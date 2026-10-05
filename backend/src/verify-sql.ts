import { SqlRepository } from './sql.js';
import { config } from './config.js';
async function main() {
 if (config.sql.server !== 'j5sqlserver.database.windows.net' || config.sql.database !== 'tallerj5') throw new Error('TARGET_MISMATCH');
 await new SqlRepository().runSql(async tx=>{
  console.log('SQL connectivity: OK; target: tallerj5');
  const tables=(await tx.query<{name:string}>("SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID('dbo') ORDER BY name")).recordset.map(r=>r.name);
  console.log('Tables: '+tables.join(', '));
  if(tables.includes('SchemaMigrations')) console.log('SchemaMigrations: '+JSON.stringify((await tx.query('SELECT name FROM dbo.SchemaMigrations ORDER BY name')).recordset));
  if(process.argv.includes('--preflight')) return;
  for(const name of ['Users','Customers','Vehicles','Orders','OrderItems','Sessions','AuditLogs','IdempotencyRequests','SchemaMigrations']) if(!tables.includes(name)) throw new Error('SCHEMA_INCOMPLETE');
  const columns=(await tx.query("SELECT t.name AS table_name,c.name AS column_name,c.is_nullable FROM sys.tables t JOIN sys.columns c ON t.object_id=c.object_id WHERE t.name IN ('Users','Customers','Vehicles','Orders','OrderItems') ORDER BY t.name,c.column_id")).recordset;
  console.log('Columns: '+JSON.stringify(columns));
  console.log('Constraints: '+JSON.stringify((await tx.query('SELECT name,is_disabled,is_not_trusted FROM sys.check_constraints ORDER BY name')).recordset));
  console.log('Indexes: '+JSON.stringify((await tx.query("SELECT t.name AS table_name,i.name,i.is_unique FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id WHERE i.name IS NOT NULL ORDER BY t.name,i.name")).recordset));
  console.log('Triggers: '+JSON.stringify((await tx.query('SELECT name,is_disabled FROM sys.triggers ORDER BY name')).recordset));
  console.log('Active ADMIN count: '+(await tx.query<{count:number}>("SELECT COUNT(*) AS count FROM dbo.Users WHERE role='ADMIN' AND active=1")).recordset[0]!.count);
 },undefined,true);
}
main().catch(error=>{ console.error('SQL verification failed: '+(typeof error?.number==='number'?'SQL '+error.number: /^[A-Z_]+$/.test(error?.code ?? '') ? error.code:['TARGET_MISMATCH','SCHEMA_INCOMPLETE'].includes(error?.message)?error.message:'connection/authentication/permissions unavailable'));process.exitCode=1; });

