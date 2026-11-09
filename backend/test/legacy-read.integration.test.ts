import {describe,it,expect} from 'vitest';
import {SqlRepository} from '../src/sql.js';
import {config} from '../src/config.js';
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
