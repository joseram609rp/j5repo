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
  if(tables.includes('Orders')) console.log('CLOSED orders missing observations: '+(await tx.query<{count:number}>("SELECT COUNT(*) AS count FROM dbo.Orders WHERE NOT (status <> 'CLOSED' OR DATALENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(notes COLLATE Latin1_General_100_BIN2,NCHAR(9),N''),NCHAR(10),N''),NCHAR(11),N''),NCHAR(12),N''),NCHAR(13),N''),NCHAR(32),N''),NCHAR(160),N''),NCHAR(5760),N''),NCHAR(8192),N''),NCHAR(8193),N''),NCHAR(8194),N''),NCHAR(8195),N''),NCHAR(8196),N''),NCHAR(8197),N''),NCHAR(8198),N''),NCHAR(8199),N''),NCHAR(8200),N''),NCHAR(8201),N''),NCHAR(8202),N''),NCHAR(8232),N''),NCHAR(8233),N''),NCHAR(8239),N''),NCHAR(8287),N''),NCHAR(12288),N''),NCHAR(65279),N'')) > 0)")).recordset[0]!.count);
  if(process.argv.includes('--preflight')) return;
  for(const name of ['Users','Customers','Vehicles','Orders','OrderItems','Sessions','AuditLogs','IdempotencyRequests','SchemaMigrations']) if(!tables.includes(name)) throw new Error('SCHEMA_INCOMPLETE');
  const columns=(await tx.query("SELECT t.name AS table_name,c.name AS column_name,c.is_nullable FROM sys.tables t JOIN sys.columns c ON t.object_id=c.object_id WHERE t.name IN ('Users','Customers','Vehicles','Orders','OrderItems') ORDER BY t.name,c.column_id")).recordset;
  if (!columns.some(c => c.table_name === 'Vehicles' && c.column_name === 'model')) throw new Error('SCHEMA_INCOMPLETE');
  console.log('Columns: '+JSON.stringify(columns));
  console.log('Vehicles missing model: '+(await tx.query<{count:number}>('SELECT COUNT(*) AS count FROM dbo.Vehicles WHERE model IS NULL')).recordset[0]!.count);
  const notesGuard=(await tx.query<{is_disabled:boolean;is_not_trusted:boolean}>("SELECT is_disabled,is_not_trusted FROM sys.check_constraints WHERE name='CK_Orders_ClosedNotes'")).recordset[0];
  if(!notesGuard || notesGuard.is_disabled || notesGuard.is_not_trusted) throw new Error('SCHEMA_INCOMPLETE');
  console.log('Constraints: '+JSON.stringify((await tx.query('SELECT name,is_disabled,is_not_trusted FROM sys.check_constraints ORDER BY name')).recordset));
  console.log('Indexes: '+JSON.stringify((await tx.query("SELECT t.name AS table_name,i.name,i.is_unique FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id WHERE i.name IS NOT NULL ORDER BY t.name,i.name")).recordset));
  console.log('Triggers: '+JSON.stringify((await tx.query('SELECT name,is_disabled FROM sys.triggers ORDER BY name')).recordset));
  console.log('Active ADMIN count: '+(await tx.query<{count:number}>("SELECT COUNT(*) AS count FROM dbo.Users WHERE role='ADMIN' AND active=1")).recordset[0]!.count);
 },undefined,true);
}
main().catch(error=>{ console.error('SQL verification failed: '+(typeof error?.number==='number'?'SQL '+error.number: /^[A-Z_]+$/.test(error?.code ?? '') ? error.code:['TARGET_MISMATCH','SCHEMA_INCOMPLETE'].includes(error?.message)?error.message:'connection/authentication/permissions unavailable'));process.exitCode=1; });

