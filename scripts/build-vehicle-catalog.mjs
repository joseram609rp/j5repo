import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dir=path.join(process.cwd(),'data/vehicle-catalog');
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const write=(n,v)=>fs.writeFileSync(path.join(dir,n),JSON.stringify(v,null,2)+'\n');
const raw=read('carsxe_raw.json'), additions=read('manual_additions.json'), aliases=read('aliases.json'), evidence=read('evidence.json'), makes=read('makes.json');
const key=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const normalize=(make,model)=>{
 if(typeof model!=='string'||!model.trim())throw Error('Empty/non-string model');
 let n=model.trim().replace(/\s+/g,' ');const mapping=aliases.model_aliases.find(a=>a.make===make&&key(a.from)===key(n));return mapping?.to||n;
};
const all=new Map(makes.map(x=>[x.make,new Map()]));
const put=(make,model,provenance)=>{
 if(!all.has(make))throw Error('Unknown make '+make);
 const n=normalize(make,model), k=key(n);if(!k)throw Error('Empty model');
 const entry=all.get(make).get(k)||{model:n,raw_names:[],source_ids:[],manual:false};
 if(provenance.raw_name&&!entry.raw_names.includes(provenance.raw_name))entry.raw_names.push(provenance.raw_name);
 if(provenance.source_ids)for(const id of provenance.source_ids)if(!entry.source_ids.includes(id))entry.source_ids.push(id);
 if(provenance.manual)entry.manual=true;all.get(make).set(k,entry);
};
for(const r of raw.requests.filter(r=>r.success))for(const model of r.models)put(r.make,model,{raw_name:model});
const sourceIds=new Set(evidence.sources.map(s=>s.id));
for(const a of additions.additions){if(!a.source_ids?.length||a.source_ids.some(s=>!sourceIds.has(s)))throw Error('Invalid manual source');put(a.make,a.model,{source_ids:a.source_ids,manual:true});}
// Attach local evidence to seed models too, without fabricating manual additions.
for(const e of evidence.evidence){const n=normalize(e.make,e.model);const hit=all.get(e.make)?.get(key(n));if(hit&&!hit.source_ids.includes(e.source_id))hit.source_ids.push(e.source_id);}
const sort=(a,b)=>a.localeCompare(b,'en',{sensitivity:'base'});
const brands=[...all].sort(([a],[b])=>sort(a,b)).map(([make,map])=>({make,models:[...map.values()].map(x=>x.model).sort(sort)}));
for(const b of brands)if(!b.make.trim()||!b.models.length||new Set(b.models.map(key)).size!==b.models.length)throw Error('Invalid/empty/duplicate brand '+b.make);
const rows=brands.map(b=>({make:b.make,carsxe_models:raw.requests.filter(r=>r.make===b.make&&r.success).reduce((n,r)=>n+r.models.length,0),carsxe_base_models:new Set(raw.requests.filter(r=>r.make===b.make&&r.success).flatMap(r=>r.models.map(m=>key(normalize(r.make,m))))).size,manual_additions:additions.additions.filter(a=>a.make===b.make).length,final_models:b.models.length,requests:raw.requests.filter(r=>r.make===b.make).length}));
const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'carsxe_raw.json'))).digest('hex');
write('vehicle_catalog_final.json',{schema_version:1,market:'CR',restrictive:false,scope:'make + base model; no years/trims/engines; seed retains uncommon automotive models',raw_sha256:hash,brands});
write('provenance.json',{schema_version:1,brands:[...all].sort(([a],[b])=>sort(a,b)).map(([make,map])=>({make,models:[...map.values()].sort((a,b)=>sort(a.model,b.model))}))});
write('coverage.json',{schema_version:1,requests_this_round:raw.requests.length,prior_requests_estimate:raw.prior_requests_estimate,total_requests_estimate:raw.requests.length+raw.prior_requests_estimate,remaining_requests_estimate:100-raw.requests.length-raw.prior_requests_estimate,usage_verified:false,makes:brands.length,models:brands.reduce((n,b)=>n+b.models.length,0),manual_additions:additions.additions.length,coverage:rows});
fs.writeFileSync(path.join(dir,'coverage.md'),'# Cobertura del catálogo local CR\n\n| Marca | CarsXE RAW | Bases normalizadas | Adiciones manuales | Final | Requests |\n|---|---:|---:|---:|---:|---:|\n'+rows.map(r=>`| ${r.make} | ${r.carsxe_models} | ${r.carsxe_base_models} | ${r.manual_additions} | ${r.final_models} | ${r.requests} |`).join('\n')+'\n');
console.log(`Validated ${brands.length} makes, ${brands.reduce((n,b)=>n+b.models.length,0)} base models, ${additions.additions.length} manual additions; ${raw.requests.length} requests recorded.`);
