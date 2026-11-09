import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { config } from './config.js';
import { SqlRepository } from './sql.js';
const record = z.object({record_id:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),source_record_sha256:z.string().regex(/^[a-f0-9]{64}$/),source_file:z.string(),source_record_number:z.number().int().positive()}).passthrough();
const nullableText=z.string().nullable();
const vehicle=record.extend({plate_normalized:z.string().max(100).nullable(),customer_name:nullableText,customer_identification:nullableText,make:nullableText,model:nullableText,phone_normalized:nullableText});
const work=record.extend({plate_normalized:z.string().max(100).nullable(),work_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s);return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}).nullable(),customer_identification:nullableText,price_amount:z.string().regex(/^-?\d+(\.\d+)?$/).nullable(),date_quality:z.string(),description_1:nullableText,description_2:nullableText});
export function validateRows(raw:string,schema:z.ZodType<Record<string,unknown>>,expected:number) {
 const rows=raw.split(/\r?\n/).filter(x=>x.trim()).map(line=>schema.parse(JSON.parse(line)));
 if(rows.length!==expected || new Set(rows.map(r=>r.record_id)).size!==rows.length) throw new Error('COUNT_OR_DUPLICATE_ID');
 return rows;
}
export function validateArchive(entries:Record<string,string>) {
 const vehicles=validateRows(entries['legacy_vehicles_curated.jsonl']!,vehicle,13219);
 const orders=validateRows(entries['legacy_work_orders.jsonl']!,work,16289);
 const mechanics=validateRows(entries['legacy_mechanics.jsonl']!,record,5);
 const plates=new Set(vehicles.map(r=>r.plate_normalized));
 if(orders.some(r=>!plates.has(r.plate_normalized))) throw new Error('UNMATCHED_PLATE');
 const quality=JSON.parse(entries['quality_summary.json']!);
 return {vehicles,orders,mechanics,quality};
}
export async function main() {
 const args=process.argv.slice(2); const path=args[0];
 if(!path || args.some((a,i)=>i>0&&!['--apply','--validate','--migrate'].includes(a))) throw new Error('ARGUMENTS');
 // Hash exactly the archive read; detect replacement while reading. Never extract private files.
 const hash=async()=>createHash('sha256').update(await readFile(path)).digest('hex');
 const archiveHash=await hash();
 const read=spawnSync('pwsh.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('../../scripts/read-legacy-zip.ps1',import.meta.url)),'-ArchivePath',path],{encoding:'utf8',maxBuffer:80000000,windowsHide:true});
 if(read.status!==0) throw new Error('ZIP_READ_FAILED');
 const data=validateArchive(JSON.parse(read.stdout.replace(/^\uFEFF/,'')));
 if(await hash()!==archiveHash) throw new Error('ARCHIVE_CHANGED');
 console.log(JSON.stringify({vehicles:data.vehicles.length,workOrders:data.orders.length,mechanics:data.mechanics.length,nullDates:data.orders.filter(r=>r.work_date===null).length,nullIdentifications:data.vehicles.filter(r=>r.customer_identification===null).length}));
 if(!args.includes('--apply') && !args.includes('--migrate')) return;
 // Explicit DEV/QA allowlist required; generic application .env is never sufficient authorization.
 if(!['dev','qa'].includes(process.env.LEGACY_ENVIRONMENT??'') || process.env.NODE_ENV==='production' || process.env.WEBSITE_INSTANCE_ID || !config.sql.server || !config.sql.database || config.sql.server!==process.env.LEGACY_ALLOWED_SERVER || config.sql.database!==process.env.LEGACY_ALLOWED_DATABASE) throw new Error('DEV_QA_TARGET_REQUIRED');
 const repo=new SqlRepository();
 if(args.includes('--migrate')) {
  const directory=fileURLToPath(new URL('../../database/migrations/',import.meta.url));
  const names=(await readdir(directory)).filter(n=>/^\d{3}_.*\.sql$/.test(n)).sort();
  const migrations=await Promise.all(names.map(async name=>{const text=await readFile(directory+'/'+name,'utf8');return {name,text,checksum:createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex')};}));
  await repo.runSql(async tx=>{
   await tx.query("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'j5:schema',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=4000; IF @r<0 THROW 51000,'Schema lock unavailable',1;");
   const applied=(await tx.query<{name:string;checksum:string}>('SELECT name,checksum FROM dbo.SchemaMigrations')).recordset;
   if(applied.some(a=>!migrations.some(m=>m.name===a.name&&m.checksum===a.checksum)) || migrations.filter(m=>m.name<'017_').some(m=>!applied.some(a=>a.name===m.name)))throw new Error('MIGRATION_HISTORY_MISMATCH');
   const migration=migrations.find(m=>m.name==='017_legacy_archive.sql')!;
   if(!applied.some(a=>a.name===migration.name)) {
    await tx.query(migration.text);
    await tx.query('INSERT dbo.SchemaMigrations(name,checksum) VALUES(@name,@checksum)',{name:migration.name,checksum:migration.checksum});
   }
  });
  console.log('Migration 017 verified/applied in DEV/QA.');
 }
 if(!args.includes('--apply')) return;
 console.log(await importValidated(repo,data,archiveHash));
}
export async function importValidated(repo:SqlRepository,data:ReturnType<typeof validateArchive>,archiveHash:string) {
 return repo.runSql(async tx=> {
  await tx.query("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'j5:legacy-import',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=4000; IF @r<0 THROW 51000,'Import lock unavailable',1;");
  const prior=(await tx.query('SELECT archive_hash FROM legacy.ImportBatches WHERE archive_hash=@hash',{hash:archiveHash})).recordset.length>0;
  if(!prior) {
   await tx.query('INSERT legacy.ImportBatches(archive_hash,vehicle_count,work_order_count,mechanic_count) VALUES(@hash,@vehicles,@orders,@mechanics)',{hash:archiveHash,vehicles:data.vehicles.length,orders:data.orders.length,mechanics:data.mechanics.length});
   for(const [table,rows] of [['Vehicles',data.vehicles],['WorkOrders',data.orders],['Mechanics',data.mechanics]] as const) {
    for(let i=0;i<rows.length;i+=200) {
     // IDs are globally unique. A different archive with conflicting IDs fails and rolls back entirely.
     await tx.query(`INSERT legacy.${table}(record_id,archive_hash,payload) SELECT JSON_VALUE(value,'$.record_id'),@hash,value FROM OPENJSON(@payload)`,{hash:archiveHash,payload:JSON.stringify(rows.slice(i,i+200))});
    }
   }
   await tx.query("INSERT legacy.ImportIssues(archive_hash,issue_key,payload) VALUES(@hash,'quality_summary',@payload)",{hash:archiveHash,payload:JSON.stringify(data.quality)});
  }
  for(const [table,expected] of [['Vehicles',13219],['WorkOrders',16289],['Mechanics',5]] as const) {
   const count=(await tx.query<{count:number}>(`SELECT COUNT(*) count FROM legacy.${table} WHERE archive_hash=@hash`,{hash:archiveHash})).recordset[0]!.count;
   if(count!==expected) throw new Error('IMPORTED_COUNT_MISMATCH');
  }
  return prior?'Already imported; counts verified.':'Imported; counts verified.';
 },AbortSignal.timeout(180000),false,180000);
}
if(process.argv[1] && /legacy-import\.(ts|js)$/.test(process.argv[1])) main().catch(()=>{console.error('Legacy import failed; private data and driver details suppressed. Check archive, DEV/QA target, migration and permissions.');process.exitCode=1;});
