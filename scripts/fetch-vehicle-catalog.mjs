import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(), dir=path.join(root,'data/vehicle-catalog');
const args=process.argv.slice(2); const value=k=>args.find(x=>x.startsWith(k+'='))?.slice(k.length+1);
const makes=JSON.parse(fs.readFileSync(path.join(dir,'makes.json'),'utf8'));
const selected=value('--makes')?value('--makes').split(','):makes.map(x=>x.make);
if(selected.some(m=>!makes.some(x=>x.make===m))) throw Error('Unknown make; use --list');
if(args.includes('--list')||args.includes('--dry-run')) {console.log(selected.join('\n')); process.exit(0);}
const max=Number(value('--max-requests')||0);
if(!Number.isInteger(max)||max<1||max>60) throw Error('Explicit --max-requests=1..60 required');
const env=fs.readFileSync(path.join(root,'.env'),'utf8');
const match=env.match(/^\s*CARSXE_API_KEY\s*=\s*(.*?)\s*$/m);
const key=process.env.CARSXE_API_KEY||match?.[1]?.replace(/^(['"])(.*)\1$/,'$2');
if(!key) throw Error('CARSXE_API_KEY missing');
const file=path.join(dir,'carsxe_raw.json');
const raw=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{schema_version:1,prior_requests_estimate:2,requests:[]};
const lifetimeUsed=raw.requests.length+(raw.prior_requests_estimate||0);
if(lifetimeUsed+max>100) throw Error('Requested budget exceeds conservative 100-call lifetime guardrail; reduce --max-requests');
const run={started_at:new Date().toISOString(),requests_consumed:0}; raw.runs??=[]; raw.runs.push(run);
const save=()=>fs.writeFileSync(file,JSON.stringify(raw,null,2)+'\n');
let count=0;
for(const make of selected){
 if(raw.requests.some(r=>r.make===make&&r.success&&r.models.length)&&!args.includes('--refresh')) continue;
 if(count>=max) break;
 const queryMake=value('--query-make')||makes.find(x=>x.make===make).query_make||make;
 if(value('--query-make')&&selected.length!==1) throw Error('Alias requires exactly one selected make');
 const record={make,query_make:queryMake,fetched_at:new Date().toISOString(),endpoint:'https://api.carsxe.com/v1/ymm-options',parameters:{dimension:'models',make:queryMake},http_status:null,success:false,models:[],warnings:[]};
 raw.requests.push(record); count++; run.requests_consumed=count; save(); // reserve before network; interrupted requests remain counted
 const url=new URL(record.endpoint); url.search=new URLSearchParams({key,dimension:'models',make:queryMake}).toString();
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'}); record.http_status=response.status;
  const body=await response.json();
  const clean=v=>typeof v==='string'?v.split(key).join('[REDACTED]'):Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!/(key|token|authorization)/i.test(k)).map(([k,v])=>[k,clean(v)])):v;
  record.response=clean(body); record.models=body.models||[]; record.success=response.ok&&body.success===true&&Array.isArray(record.models);
  if(!record.models.length) record.warnings.push('No models returned');
  if(body.usage) record.usage=clean(body.usage);
  for(const warning of [body.message,body.warning]) if(typeof warning==='string') record.warnings.push(clean(warning));
  save(); console.log(`${make}: HTTP ${response.status}, success=${record.success}, models=${record.models.length}`);
  if([401,403,429].includes(response.status)||body.usage?.remaining===0||/usage limit/i.test(body.message||'')) break;
 }catch {record.warnings.push('Network/parse failure; no automatic retry; request conservatively counted');save();console.log(`${make}: request failed`);break;}
}
run.finished_at=new Date().toISOString();save();console.log(`Requests this invocation: ${count}; recorded total: ${raw.requests.length}; prior estimate: 2`);

