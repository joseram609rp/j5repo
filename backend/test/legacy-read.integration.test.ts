import {describe,it,expect} from 'vitest';
import {SqlRepository} from '../src/sql.js';
import {config} from '../src/config.js';
import {createApi, tokenHash} from '../src/api.js';
import {FakeRepository} from './fake-repository.js';
import {legacySearch,SqlLegacyReader} from '../src/legacy.js';
// Explicit opt-in. These checks only SELECT existing data and inspect permissions.
describe.skipIf(process.env.LEGACY_LIVE_READ_TEST!=='1')('live archive read-only verification',()=>{
 it('preserves archive counts/nulls/zero prices and restricts the historical execution identity',async()=>{
  if(config.sql.server!=='j5sqlserver.database.windows.net'||config.sql.database!=='tallerj5')throw new Error('TARGET_MISMATCH');
  const value=await new SqlRepository().runSql(async tx=>{
   await tx.query("EXECUTE AS USER=N'j5_legacy_reader';");
   try {
    const permissions=(await tx.query<{canSelect:number;canInsert:number;canUpdate:number;canDelete:number;canAlter:number;canReadOperational:number}>("SELECT HAS_PERMS_BY_NAME('legacy','SCHEMA','SELECT') canSelect,HAS_PERMS_BY_NAME('legacy','SCHEMA','INSERT') canInsert,HAS_PERMS_BY_NAME('legacy','SCHEMA','UPDATE') canUpdate,HAS_PERMS_BY_NAME('legacy','SCHEMA','DELETE') canDelete,HAS_PERMS_BY_NAME('legacy','SCHEMA','ALTER') canAlter,HAS_PERMS_BY_NAME('dbo.Orders','OBJECT','SELECT') canReadOperational")).recordset[0];
    const counts=(await tx.query("SELECT (SELECT COUNT(*) FROM legacy.ImportBatches) batches,(SELECT COUNT(*) FROM legacy.Vehicles) vehicles,(SELECT COUNT(*) FROM legacy.WorkOrders) orders,(SELECT COUNT(*) FROM legacy.Mechanics) mechanics,(SELECT COUNT(*) FROM legacy.WorkOrders WHERE work_date IS NULL) nullDates,(SELECT COUNT(*) FROM legacy.Vehicles WHERE JSON_VALUE(payload,'$.customer_identification') IS NULL) nullIdentifications,(SELECT COUNT(*) FROM legacy.WorkOrders WHERE TRY_CONVERT(decimal(18,2),JSON_VALUE(payload,'$.price_amount'))=0) zeroPrices")).recordset[0];
    return {permissions,counts};
   }finally{await tx.query('REVERT;');}
  });
  expect(value.permissions).toEqual({canSelect:1,canInsert:0,canUpdate:0,canDelete:0,canAlter:0,canReadOperational:0});
  expect(value.counts).toEqual({batches:1,vehicles:13219,orders:16289,mechanics:5,nullDates:3,nullIdentifications:13219,zeroPrices:4125});
 },30000);
 it('pages and reads details through the same restricted reader used by API',async()=>{
  if(config.sql.server!=='j5sqlserver.database.windows.net'||config.sql.database!=='tallerj5')throw new Error('TARGET_MISMATCH');
  const reader=new SqlLegacyReader();const signal=AbortSignal.timeout(28000);
  const page=await reader.search(legacySearch.parse({pageSize:2}),signal) as {total:number;orders:{id:string}[]};
  expect(page.total).toBe(16289);expect(page.orders.length).toBe(2);
  const detail=await reader.detail(page.orders[0]!.id,signal) as {work:{id:string};vehicles:unknown[]};
  expect(detail.work.id===page.orders[0]!.id).toBe(true);expect(Array.isArray(detail.vehicles)).toBe(true);
 },30000);
});

describe.skipIf(process.env.LEGACY_LIVE_READ_TEST !== '1')('legacy search regression (read-only)', () => {
 it('finds a known plate, normalizes typing, and intersects dates without losing pages', async () => {
  if (config.sql.server !== 'j5sqlserver.database.windows.net' || config.sql.database !== 'tallerj5') throw new Error('TARGET_MISMATCH');
  const reader = new SqlLegacyReader();
  const repository = new FakeRepository();
  const token = 'a'.repeat(43);
  const userId = '11111111-1111-4111-8111-111111111111';
  repository.accounts.set(userId, {id: userId, username: 'fixture', fullName: 'Fixture', passwordHash: 'unused', role: 'MECHANIC', active: true});
  repository.sessions.set(tokenHash(token), {tokenHash: tokenHash(token), userId, csrf: 'fixture', lastActivity: repository.clock, revoked: false});
  const api = createApi({repository, legacyReader: reader});
  const search = async (filters: Record<string, string | number>) => {
   const query = new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, String(value)]));
   const response = await api(new Request('http://localhost:5173/api/legacy/work-orders?' + query, {
    headers: {origin: config.origin, cookie: 'j5_session=' + token},
    signal: AbortSignal.timeout(28000),
   }));
   expect(response.status).toBe(200);
   return await response.json() as {total: number; orders: {id: string; workDate: string | null}[]};
  };
  const first = await search({q: 'JRP101', pageSize: 2});
  const second = await search({q: 'jrp - 101', page: 2, pageSize: 2});
  expect(first.total).toBe(4);
  expect(second.total).toBe(first.total);
  expect([...first.orders, ...second.orders].map(work => work.workDate)).toEqual([
   '2026-01-07', '2025-04-14', '2024-10-08', '2024-04-09',
  ]);
  expect(new Set([...first.orders, ...second.orders].map(work => work.id)).size).toBe(4);

  const dates = {from: '2026-01-07', to: '2026-01-07'};
  expect((await search(dates)).total).toBeGreaterThan(1);
  const combined = await search({...dates, q: 'JRP101'});
  expect(combined.total).toBe(1);
  expect(combined.orders[0]?.id).toBe(first.orders[0]?.id);
  expect(await search({...dates, q: 'J5-no-match-932870'})).toMatchObject({orders: [], total: 0});

  // Read only the related card and use its name without printing customer details.
  const detail = await reader.detail(first.orders[0]!.id, AbortSignal.timeout(28000)) as {
   vehicles: {customerName: string | null}[];
  };
  const name = detail.vehicles.find(card => card.customerName)?.customerName;
  if (!name) throw new Error('LEGACY_FIXTURE_NAME_MISSING');
  const byName = await search({...dates, q: name});
  expect(byName.orders.some(work => work.id === first.orders[0]?.id)).toBe(true);
 }, 60000);
});
