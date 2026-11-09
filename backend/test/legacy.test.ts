import { describe, it, expect, vi } from 'vitest';
import { createApi,tokenHash } from '../src/api.js';
import { FakeRepository } from './fake-repository.js';
import { legacySearch, SqlLegacyReader } from '../src/legacy.js';
import { importValidated, validateRows } from '../src/legacy-import.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
function setup() {
 const repository=new FakeRepository();const token='a'.repeat(43);const id='11111111-1111-4111-8111-111111111111';
 repository.accounts.set(id,{id,username:'tester',fullName:'Test',passwordHash:'unused',role:'MECHANIC',active:true});
 repository.sessions.set(tokenHash(token),{tokenHash:tokenHash(token),userId:id,csrf:'test',lastActivity:repository.clock,revoked:false});
 const legacyReader={search:vi.fn(async()=>({orders:[],total:0,page:1,pageSize:25})),detail:vi.fn(async()=>({work:{workDate:null},vehicles:[]}))};
 const api=createApi({repository,legacyReader});
 const call=(path:string,method='GET',logged=true,body?:unknown)=>api(new Request('http://localhost:5173/api'+path,{method,headers:{origin:'http://localhost:5173',cookie:logged?'j5_session='+token:'','x-csrf-token':'test','content-type':'application/json','idempotency-key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})}));
 return {repository,legacyReader,call};
}
describe('isolated legacy archive',()=>{
 it('authenticates before reading, pages GET and rejects writes',async()=>{
  const {call,legacyReader}=setup();expect((await call('/legacy/work-orders','GET',false)).status).toBe(401);expect(legacyReader.search).not.toHaveBeenCalled();
  expect((await call('/legacy/work-orders?q=ABC&page=2&pageSize=10')).status).toBe(200);expect(legacyReader.search.mock.calls[0]?.[0]).toMatchObject({q:'ABC',page:2,pageSize:10});
  const detail=await call('/legacy/work-orders/old_1');expect(detail.headers.get('cache-control')).toBe('no-store');expect((await detail.json()).work.workDate).toBeNull();
  for(const method of ['POST','PUT','PATCH','DELETE'])expect((await call('/legacy/work-orders',method)).status).toBe(405);
 });
 it.each(['page=0','pageSize=101','from=2026-02-30','from=2026-03-01&to=2026-01-01','unexpected=x'])('rejects invalid filters %s',async query=>expect((await setup().call('/legacy/work-orders?'+query)).status).toBe(400));
 it('current order, customer and vehicle paths never invoke archive reader',async()=>{
  const {call,legacyReader,repository}=setup();
  for(const path of ['/orders?status=OPEN&q=ABC','/orders?status=CLOSED&q=ABC','/customers?q=ABC','/vehicles?q=ABC'])expect((await call(path)).status).toBe(200);
  const id=crypto.randomUUID();expect((await call('/orders/'+id,'PUT',true,{customerName:'Fixture',plate:'ABC123',mileage:null,paymentMethod:'CASH',electronicInvoice:false,notes:'',recommendations:''})).status).toBe(200);
  expect((await call('/orders/'+id,'PUT',true,{customerName:'Fixture',plate:'ABC123',mileage:null,paymentMethod:'CASH',electronicInvoice:false,notes:'updated',recommendations:''})).status).toBe(428);
  expect(repository.orders.size).toBe(1);expect(legacyReader.search).not.toHaveBeenCalled();expect(legacyReader.detail).not.toHaveBeenCalled();
 });
 it('operational SQL and autosave contain no legacy references',()=>{
  for(const file of ['backend/src/sql.ts','frontend/src/autosave.ts','frontend/src/EntitySearch.tsx'])expect(readFileSync(file,'utf8')).not.toMatch(/(?:FROM|JOIN|INSERT|UPDATE)\s+legacy\.|\/legacy\//i);
  const migration=readFileSync('database/migrations/017_legacy_archive.sql','utf8');expect(migration).not.toMatch(/REFERENCES dbo\./i);expect(migration).toContain('DENY INSERT, UPDATE, DELETE, ALTER');
 });
 it('uses parameterized archive-only queries with literal wildcard search',async()=>{
  const query=vi.fn(async(text:string)=>({recordset:text.includes('COUNT(*)')?[{total:0}]:[]}));
  const reader=new SqlLegacyReader({runSql:async(fn:any)=>fn({query})} as any);
  await reader.search(legacySearch.parse({q:"%' OR 1=1 --"}),AbortSignal.timeout(1000));
  for(const [text,params] of query.mock.calls as any){expect(text).not.toContain('dbo.');expect(text).not.toContain("%' OR");expect(params.q).toContain('~%');}
 });
 it('preserves null and rejects duplicates or count mismatch before import',()=>{
  const schema=z.object({record_id:z.string(),date:z.string().nullable()});const raw=JSON.stringify({record_id:'fixture',date:null});
  expect(validateRows(raw,schema,1)[0]?.date).toBeNull();expect(()=>validateRows(raw+'\n'+raw,schema,2)).toThrow();expect(()=>validateRows(raw,schema,2)).toThrow();
 });
});


it('same archive is inserted once and repeated import validates persisted counts',async()=>{
 let imported=false;let inserts=0;
 const query=vi.fn(async(text:string)=>{
  if(text.startsWith('SELECT archive_hash')) return {recordset:imported?[{archive_hash:'fixture'}]:[]};
  if(text.startsWith('INSERT legacy.ImportBatches')){imported=true;inserts++;}
  if(text.includes('COUNT(*)'))return {recordset:[{count:text.includes('WorkOrders')?16289:text.includes('Vehicles')?13219:5}]};
  return {recordset:[]};
 });
 const repo={runSql:async(fn:any)=>fn({query})} as any;
 const data={vehicles:[{record_id:'vehicle',customer_identification:null}],orders:[{record_id:'work',work_date:null,price_amount:'0'}],mechanics:[{record_id:'mechanic'}],quality:{}} as any;
 expect(await importValidated(repo,data,'fixture')).toContain('Imported');
 const priorCalls=query.mock.calls.length;
 expect(await importValidated(repo,data,'fixture')).toContain('Already imported');expect(inserts).toBe(1);
 expect(query.mock.calls.slice(priorCalls).some(([text])=>text.startsWith('INSERT'))).toBe(false);
});
