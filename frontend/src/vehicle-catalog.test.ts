import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from './api';
vi.mock('./api',()=>({api:vi.fn()}));
const source=JSON.parse(readFileSync('data/vehicle-catalog/vehicle_catalog_final.json','utf8'));
const payload={makes:source.brands.map((b:{make:string;models:string[]})=>({name:b.make,models:b.models}))};
afterEach(()=>{vi.resetModules();vi.clearAllMocks();});
async function seed(value?:unknown){ const database=await openDB('j5-vehicle-catalog',1,{upgrade(db){db.createObjectStore('catalog');}});await database.clear('catalog');if(value)await database.put('catalog',value,'current');database.close(); }
it('first load fetches once, persists cache and provides filtered suggestions',async()=>{
 await seed();vi.mocked(api).mockResolvedValue(payload);const {loadVehicleCatalog,suggestions}=await import('./vehicle-catalog');const update=vi.fn();
 await Promise.all([loadVehicleCatalog(update),loadVehicleCatalog(update)]);expect(api).toHaveBeenCalledTimes(1);expect(update).toHaveBeenCalledWith(payload);
 const db=await openDB('j5-vehicle-catalog',1);expect((await db.get('catalog','current')).payload).toEqual(payload);db.close();
 expect(suggestions(['Toyota','Audi'],'to')).toEqual(['Toyota']);expect(suggestions(['Citroën'],'CITROE')).toEqual(['Citroën']);expect(suggestions(['Toyota'],'')).toEqual([]);
 const toyota=payload.makes.find((m:{name:string})=>m.name==='Toyota');expect(suggestions(toyota.models,'hil')).toContain('Hilux');
});
it('stale cache is delivered immediately and survives API failure',async()=>{
 await seed({schema:1,fetchedAt:0,payload});vi.mocked(api).mockRejectedValue(new TypeError('offline'));
 const {loadVehicleCatalog}=await import('./vehicle-catalog');const update=vi.fn();await loadVehicleCatalog(update);expect(update).toHaveBeenCalledExactlyOnceWith(payload);
});
it('fresh cache avoids fetch; incompatible cache is discarded and failure remains non-blocking',async()=>{
 await seed({schema:1,fetchedAt:Date.now(),payload});let module=await import('./vehicle-catalog');const update=vi.fn();await module.loadVehicleCatalog(update);expect(api).not.toHaveBeenCalled();
 vi.resetModules();await seed({schema:2,fetchedAt:Date.now(),payload});vi.mocked(api).mockRejectedValue(new Error('failed'));module=await import('./vehicle-catalog');const empty=vi.fn();await expect(module.loadVehicleCatalog(empty)).resolves.toBeUndefined();expect(empty).not.toHaveBeenCalled();
});
