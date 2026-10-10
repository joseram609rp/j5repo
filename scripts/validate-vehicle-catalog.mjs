import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const dir=path.join(process.cwd(),'data/vehicle-catalog');
const jsons=fs.readdirSync(dir).filter(n=>n.endsWith('.json'));const parsed=Object.fromEntries(jsons.map(n=>[n,JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'))]));
const raw=parsed['carsxe_raw.json'], final=parsed['vehicle_catalog_final.json'], manual=parsed['manual_additions.json'], aliases=parsed['aliases.json'], evidence=parsed['evidence.json'], coverage=parsed['coverage.json'], provenance=parsed['provenance.json'];
const key=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const normalize=(make,model)=>aliases.model_aliases.find(a=>a.make===make&&key(a.from)===key(model.trim()))?.to||model.trim().replace(/\s+/g,' ');
const sort=(a,b)=>a.localeCompare(b,'en',{sensitivity:'base'});
assert.equal(final.restrictive,false);assert.equal(final.market,'CR');
const makes=new Set(parsed['makes.json'].map(x=>x.make));assert.equal(makes.size,parsed['makes.json'].length);
assert.deepEqual(final.brands.map(b=>b.make),[...makes].sort(sort));
assert.equal(final.raw_sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'carsxe_raw.json'))).digest('hex'));
const sourceIds=new Set(evidence.sources.map(s=>s.id));assert.equal(sourceIds.size,evidence.sources.length);
for(const source of evidence.sources){assert.ok(source.consulted_on&&new URL(source.url).protocol==='https:');}
const aliasMap=new Map();
for(const a of aliases.model_aliases){assert.ok(makes.has(a.make)&&a.from.trim()&&a.to.trim());const k=a.make+'|'+key(a.from);assert.ok(!aliasMap.has(k)||aliasMap.get(k)===a.to,'Conflicting alias '+k);aliasMap.set(k,a.to);}
for(const a of aliases.brand_aliases){assert.ok(makes.has(a.canonical));for(const id of a.source_ids||[])assert.ok(sourceIds.has(id));}
const manualKeys=new Set();
for(const a of manual.additions){assert.ok(makes.has(a.make)&&a.model.trim()&&a.reason);const k=a.make+'|'+key(a.model);assert.ok(!manualKeys.has(k),'Duplicate manual '+k);manualKeys.add(k);assert.ok(a.source_ids.length);for(const id of a.source_ids)assert.ok(sourceIds.has(id));assert.ok(a.source_urls.length&&a.source_urls.every(u=>new URL(u).protocol==='https:'));}
for(const r of raw.requests){assert.ok(makes.has(r.make));assert.equal(r.parameters.dimension,'models');assert.deepEqual(Object.keys(r.parameters).sort(),['dimension','make']);assert.equal(r.endpoint,'https://api.carsxe.com/v1/ymm-options');assert.ok(r.fetched_at.endsWith('Z'));assert.ok(Array.isArray(r.models));assert.ok(r.models.every(m=>typeof m==='string'&&m.trim()));}
assert.equal(raw.runs.reduce((n,r)=>n+r.requests_consumed,0),raw.requests.length);
let total=0;
for(const b of final.brands){assert.ok(b.make.trim()&&b.models.length);assert.deepEqual(b.models,[...b.models].sort(sort));assert.equal(new Set(b.models.map(key)).size,b.models.length,'Duplicate final '+b.make);assert.ok(b.models.every(m=>m&&m===m.trim()&&!/\s{2}/.test(m)));const expected=new Set([...raw.requests.filter(r=>r.make===b.make&&r.success).flatMap(r=>r.models.map(m=>key(normalize(b.make,m)))),...manual.additions.filter(a=>a.make===b.make).map(a=>key(normalize(b.make,a.model)))]);assert.deepEqual(new Set(b.models.map(key)),expected);const c=coverage.coverage.find(r=>r.make===b.make);assert.equal(c.final_models,b.models.length);assert.equal(c.manual_additions,manual.additions.filter(a=>a.make===b.make).length);const p=provenance.brands.find(x=>x.make===b.make);assert.deepEqual(p.models.map(x=>x.model),b.models);for(const m of p.models)for(const id of m.source_ids)assert.ok(sourceIds.has(id));total+=b.models.length;}
assert.equal(coverage.makes,makes.size);assert.equal(coverage.models,total);assert.equal(coverage.requests_this_round,raw.requests.length);assert.equal(coverage.total_requests_estimate,raw.requests.length+raw.prior_requests_estimate);assert.equal(coverage.manual_additions,manual.additions.length);
// Secret scan stays in memory; never report the secret value.
const env=fs.readFileSync(path.join(process.cwd(),'.env'),'utf8');const match=env.match(/^\s*CARSXE_API_KEY\s*=\s*(.*?)\s*$/m);const secret=match?.[1]?.replace(/^(['"])(.*)\1$/,'$2');assert.ok(secret);
for(const folder of [dir,path.join(process.cwd(),'scripts')])for(const n of fs.readdirSync(folder)){const f=path.join(folder,n);if(fs.statSync(f).isFile())assert.ok(!fs.readFileSync(f,'utf8').includes(secret),'Secret detected in generated/script file');}
assert.ok(/^CARSXE_API_KEY=\s*$/m.test(fs.readFileSync(path.join(process.cwd(),'.env.example'),'utf8')));
console.log(`PASS: ${jsons.length} JSON files; ${makes.size} brands; ${total} models; ${manual.additions.length} evidence-backed manual additions; aliases/provenance/coverage coherent; no API key in catalog/scripts; env example blank.`);
