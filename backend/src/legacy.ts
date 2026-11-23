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
   let failed = false;
   try {
    return await work(tx);
   } catch (error) {
    failed = true;
    throw error;
   } finally {
    // SQL can roll back on timeout, leaving no transaction for REVERT.
    await tx.query('REVERT;').catch(error => { if (!failed) throw error; });
   }
  },signal);
 }
 search(input: LegacySearch, signal: AbortSignal) {
  // Escape SQL LIKE wildcards and normalize the plate only, preserving text searches.
  const escapeLike = (value: string) => '%' + value.replace(/[~%_\[]/g, c => '~' + c) + '%';
  const plate = input.q.replace(/[\s-]/g, '').toUpperCase();
  const dates = {from: input.from ?? null, to: input.to ?? null};
  const dateFilter = '(@from IS NULL OR w.work_date >= @from) AND (@to IS NULL OR w.work_date <= @to)';
  return this.read(async tx=> {
   let matching = '';
   let source = 'FROM legacy.WorkOrders w WHERE ' + dateFilter;
   let params: {q?: string; plate?: string|null; descriptionIds?: string} = {};
   if (input.q) {
    const q = escapeLike(input.q);
    // Scan descriptions once, separately from the count and ordered page queries.
    const descriptions = await tx.query<{id: string}>(
     'SELECT w.record_id AS id FROM legacy.WorkOrders w ' +
     "CROSS APPLY OPENJSON(w.payload) WITH (firstText nvarchar(4000) '$.description_1', secondText nvarchar(4000) '$.description_2') d " +
     'WHERE ' + dateFilter + " AND (d.firstText LIKE @q ESCAPE '~' OR d.secondText LIKE @q ESCAPE '~')",
     {...dates, q},
    );
    params = {q, plate: plate ? escapeLike(plate) : null, descriptionIds: JSON.stringify(descriptions.recordset.map(row => row.id))};
    matching = 'WITH Matches AS (' +
     'SELECT w.record_id FROM legacy.WorkOrders w WHERE ' + dateFilter +
     " AND (w.plate LIKE @q ESCAPE '~' OR UPPER(REPLACE(REPLACE(w.plate, N' ', N''), N'-', N'')) LIKE @plate ESCAPE '~')" +
     ' UNION SELECT w.record_id FROM legacy.WorkOrders w' +
     " JOIN (SELECT DISTINCT plate FROM legacy.Vehicles WHERE customer_name LIKE @q ESCAPE '~') v ON v.plate = w.plate" +
     ' WHERE ' + dateFilter +
     " UNION SELECT id FROM OPENJSON(@descriptionIds) WITH (id varchar(100) '$')" +
     ') ';
    source = 'FROM legacy.WorkOrders w JOIN Matches m ON w.record_id = m.record_id';
   }
   const total = (await tx.query<{total: number}>(matching + 'SELECT COUNT(*) total ' + source, {...dates, ...params})).recordset[0]!.total;
   const orders = (await tx.query(
    matching + 'SELECT ' + projection + ' ' + source + ' ORDER BY w.work_date DESC, w.record_id OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY',
    {...dates, ...params, offset: (input.page - 1) * input.pageSize, size: input.pageSize},
   )).recordset;
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
