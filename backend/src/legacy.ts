import { z } from 'zod';
import { SqlRepository, type SqlUnit } from './sql.js';
import { HttpError } from './reliability.js';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d=new Date(s); return !isNaN(d.getTime()) && d.toISOString().slice(0,10)===s; });
export const legacySearch = z.object({
 q: z.string().trim().max(200).default(''),
 from: date.optional(), to: date.optional(),
 page: z.coerce.number().int().min(1).max(10000).default(1),
 pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine(x => !x.from || !x.to || x.from<=x.to);
export type LegacySearch = z.infer<typeof legacySearch>;
export interface LegacyReader {
 search(input: LegacySearch, signal: AbortSignal): Promise<unknown>;
 detail(id: string, signal: AbortSignal): Promise<unknown>;
}
const projection = `w.record_id AS id, w.plate, w.work_date AS workDate,
 JSON_VALUE(w.payload,'$.description_1') AS description,
 JSON_VALUE(w.payload,'$.description_2') AS description2,
 JSON_VALUE(w.payload,'$.price_amount') AS price,
 JSON_VALUE(w.payload,'$.mechanic') AS mechanic,
 JSON_VALUE(w.payload,'$.date_quality') AS dateQuality`;
export class SqlLegacyReader implements LegacyReader {
 constructor(private repository = new SqlRepository()) {}
 private read<T>(work:(tx:SqlUnit)=>Promise<T>,signal:AbortSignal) {
  return this.repository.runSql(async tx=>{
   await tx.query("EXECUTE AS USER = N'j5_legacy_reader';");
   try {return await work(tx);} finally {await tx.query('REVERT;');}
  },signal);
 }
 search(input: LegacySearch, signal: AbortSignal) {
  // Escape SQL LIKE wildcards; values are always parameterized.
  const q='%'+input.q.replace(/[~%_\[]/g, c=>'~'+c)+'%';
  const where=`(@empty=1 OR w.plate LIKE @q ESCAPE '~'
   OR JSON_VALUE(w.payload,'$.description_1') LIKE @q ESCAPE '~'
   OR JSON_VALUE(w.payload,'$.description_2') LIKE @q ESCAPE '~'
   OR EXISTS(SELECT 1 FROM legacy.Vehicles v WHERE v.plate=w.plate AND v.customer_name LIKE @q ESCAPE '~'))
   AND (@from IS NULL OR w.work_date>=@from) AND (@to IS NULL OR w.work_date<=@to)`;
  return this.read(async tx=> {
   const params={q,empty:input.q.length===0,from:input.from??null,to:input.to??null,offset:(input.page-1)*input.pageSize,size:input.pageSize};
   const total=(await tx.query<{total:number}>(`SELECT COUNT(*) total FROM legacy.WorkOrders w WHERE ${where}`,params)).recordset[0]!.total;
   const orders=(await tx.query(`SELECT ${projection} FROM legacy.WorkOrders w WHERE ${where} ORDER BY w.work_date DESC,w.record_id OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`,params)).recordset;
   return {orders,total,page:input.page,pageSize:input.pageSize};
  },signal);
 }
 detail(id:string,signal:AbortSignal) {
  return this.read(async tx=> {
   const work=(await tx.query(`SELECT ${projection}, JSON_VALUE(w.payload,'$.work_date_raw') AS originalDate, JSON_VALUE(w.payload,'$.legacy_sequence_raw') AS originalNumber FROM legacy.WorkOrders w WHERE w.record_id=@id`,{id})).recordset[0];
   if(!work) throw new HttpError(404,'LEGACY_NOT_FOUND');
   // Same plate can identify multiple conflicting historical cards: return all; never merge.
   const vehicles=(await tx.query(`SELECT record_id AS id, customer_name AS customerName, JSON_VALUE(payload,'$.customer_identification') AS identification, JSON_VALUE(payload,'$.phone_normalized') AS phone, JSON_VALUE(payload,'$.make') AS make, JSON_VALUE(payload,'$.model') AS model FROM legacy.Vehicles WHERE plate=@plate ORDER BY record_id`,{plate:work.plate as string|null})).recordset;
   return {work,vehicles};
  },signal);
 }
}
