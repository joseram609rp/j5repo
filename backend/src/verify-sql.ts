import { SqlRepository } from './sql.js';
import { config } from './config.js';
async function main() {
 if (config.sql.server !== 'j5sqlserver.database.windows.net' || config.sql.database !== 'tallerj5') throw new Error('TARGET_MISMATCH');
 await new SqlRepository().runSql(async tx=>{
  console.log('SQL connectivity: OK; target: tallerj5');
  const tables=(await tx.query<{name:string}>("SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID('dbo') ORDER BY name")).recordset.map(r=>r.name);
  console.log('Tables: '+tables.join(', '));
  if(tables.includes('SchemaMigrations')) console.log('SchemaMigrations: '+JSON.stringify((await tx.query('SELECT name FROM dbo.SchemaMigrations ORDER BY name')).recordset));
  console.log('Vehicles row count: '+(tables.includes('Vehicles') ? (await tx.query<{count:number}>('SELECT COUNT(*) AS count FROM dbo.Vehicles')).recordset[0]!.count : 0));
  if(tables.includes('Orders')) console.log('Orders by status: '+JSON.stringify((await tx.query('SELECT status,COUNT(*) AS count FROM dbo.Orders GROUP BY status')).recordset));
  if(process.argv.includes('--preflight')) return;
  for(const name of ['Users','Customers','Vehicles','Orders','OrderItems','Sessions','AuditLogs','IdempotencyRequests','SchemaMigrations','VehicleMakes','VehicleModels']) if(!tables.includes(name)) throw new Error('SCHEMA_INCOMPLETE');
  const migrations=(await tx.query<{name:string}>('SELECT name FROM dbo.SchemaMigrations')).recordset;
  if(migrations.length!==10 || !migrations.some(m=>m.name==='010_vehicle_catalog.sql')) throw new Error('SCHEMA_INCOMPLETE');
  await tx.query(`IF (SELECT COUNT(*) FROM dbo.VehicleMakes)<>57 OR (SELECT COUNT(*) FROM dbo.VehicleModels)<>986
 OR EXISTS(SELECT 1 FROM dbo.VehicleModels v LEFT JOIN dbo.VehicleMakes m ON m.id=v.make_id WHERE m.id IS NULL)
 THROW 51010,'CATALOG_INTEGRITY_FAILED',1;
`);
  const catalogColumns=(await tx.query<{table_name:string;name:string;is_computed:boolean;collation_name:string}>("SELECT t.name AS table_name,c.name,c.is_computed,c.collation_name FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id WHERE t.name IN ('VehicleMakes','VehicleModels')")).recordset;
  for(const table of ['VehicleMakes','VehicleModels']) for(const name of ['id','name','normalized_name','active','created_at',...(table==='VehicleModels'?['make_id']:[])]) if(!catalogColumns.some(c=>c.table_name===table && c.name===name)) throw new Error('SCHEMA_INCOMPLETE');
  if(catalogColumns.filter(c=>c.name==='normalized_name' && c.is_computed && c.collation_name==='Latin1_General_100_CI_AI').length!==2) throw new Error('SCHEMA_INCOMPLETE');
  const unique=(await tx.query<{name:string}>("SELECT name FROM sys.indexes WHERE is_unique=1 AND name IN ('UX_VehicleMakes_Normalized','UX_VehicleModels_Make_Normalized') AND is_disabled=0")).recordset;
  if(unique.length!==2 || !(await tx.query("SELECT name FROM sys.foreign_keys WHERE name='FK_VehicleModels_Make' AND is_disabled=0 AND is_not_trusted=0")).recordset.length) throw new Error('SCHEMA_INCOMPLETE');
  if((await tx.query("SELECT normalized_name FROM dbo.VehicleMakes GROUP BY normalized_name HAVING COUNT(*)>1; SELECT make_id,normalized_name FROM dbo.VehicleModels GROUP BY make_id,normalized_name HAVING COUNT(*)>1")).recordsets.some(r=>r.length)) throw new Error('SCHEMA_INCOMPLETE');
  console.log('VehicleMakes=57; VehicleModels=986; duplicates=0; orphans=0');
  const columns=(await tx.query("SELECT t.name AS table_name,c.name AS column_name,c.is_nullable FROM sys.tables t JOIN sys.columns c ON t.object_id=c.object_id WHERE t.name IN ('Users','Customers','Vehicles','Orders','OrderItems') ORDER BY t.name,c.column_id")).recordset;
  if (!columns.some(c => c.table_name === 'Vehicles' && c.column_name === 'model')) throw new Error('SCHEMA_INCOMPLETE');
  for(const [table,column] of [['Orders','tax_rate'],['OrderItems','notes']]) if(!columns.some(c=>c.table_name===table && c.column_name===column)) throw new Error('SCHEMA_INCOMPLETE');
  console.log('Columns: '+JSON.stringify(columns));
  console.log('Vehicles missing model: '+(await tx.query<{count:number}>('SELECT COUNT(*) AS count FROM dbo.Vehicles WHERE model IS NULL')).recordset[0]!.count);
  const notesGuard=(await tx.query<{is_disabled:boolean;is_not_trusted:boolean}>("SELECT is_disabled,is_not_trusted FROM sys.check_constraints WHERE name='CK_Orders_ClosedNotes'")).recordset[0];
  if(notesGuard) throw new Error('SCHEMA_INCOMPLETE');
  const yearGuard=(await tx.query<{definition:string;is_disabled:boolean;is_not_trusted:boolean}>("SELECT definition,is_disabled,is_not_trusted FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Vehicles') AND name='CK_Vehicles_Year'")).recordset[0];
  if(!yearGuard || yearGuard.is_disabled || yearGuard.is_not_trusted || !/year\]\s*>=\s*\(?1950/i.test(yearGuard.definition) || /between|2200/i.test(yearGuard.definition)) throw new Error('SCHEMA_INCOMPLETE');
  console.log('Constraints: '+JSON.stringify((await tx.query('SELECT name,is_disabled,is_not_trusted FROM sys.check_constraints ORDER BY name')).recordset));
  console.log('Indexes: '+JSON.stringify((await tx.query("SELECT t.name AS table_name,i.name,i.is_unique FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id WHERE i.name IS NOT NULL ORDER BY t.name,i.name")).recordset));
  console.log('Triggers: '+JSON.stringify((await tx.query('SELECT name,is_disabled FROM sys.triggers ORDER BY name')).recordset));
  console.log('Active ADMIN count: '+(await tx.query<{count:number}>("SELECT COUNT(*) AS count FROM dbo.Users WHERE role='ADMIN' AND active=1")).recordset[0]!.count);
 },undefined,true);
}
main().catch(error=>{ console.error('SQL verification failed: '+(typeof error?.number==='number'?'SQL '+error.number: /^[A-Z_]+$/.test(error?.code ?? '') ? error.code:['TARGET_MISMATCH','SCHEMA_INCOMPLETE'].includes(error?.message)?error.message:'connection/authentication/permissions unavailable'));process.exitCode=1; });

