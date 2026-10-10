import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { sqlConfig } from '../backend/src/sql.js';
const dir=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.join(dir,'../backend/package.json'));
const sql=require('mssql');
const mode=process.argv[2] ?? 'precheck';
if(!['precheck','cleanup','postcheck'].includes(mode)) throw new Error('INVALID_MODE');
if(mode==='cleanup' && !process.argv.includes('--confirm-delete-all-qa')) throw new Error('CONFIRM_CLEANUP_REQUIRED');
if(process.env.SQL_SERVER!=='j5sqlserver.database.windows.net' || process.env.SQL_DATABASE!=='tallerj5') throw new Error('TARGET_MISMATCH');
const pool=new sql.ConnectionPool({...sqlConfig(),requestTimeout:120000});
pool.on('error',()=>undefined);
try {
 await pool.connect();
 let text=fs.readFileSync(path.join(dir,mode==='precheck'?'01_precheck.sql':mode==='cleanup'?'02_cleanup_qa.sql':'03_postcheck.sql'),'utf8');
 if(mode==='cleanup') text=text.replace('DECLARE @ConfirmCleanup bit=0;', 'DECLARE @ConfirmCleanup bit=1;');
 const result=await pool.request().batch(text);
 for(const records of result.recordsets) console.log(JSON.stringify(records));
} catch(error) {
 console.error('Cleanup failed: '+(typeof (error as {number?:number}).number==='number'?'SQL '+(error as {number:number}).number:'connection/authentication/permissions unavailable'));
 process.exitCode=1;
} finally {await pool.close().catch(()=>undefined);}
