import { openDB } from 'idb';
import { api } from './api';
import type { VehicleCatalog } from '../../backend/src/domain';
export type { VehicleCatalog };
export const CATALOG_TTL = 7 * 24 * 60 * 60 * 1000;
type Cached = { schema: 1; fetchedAt: number; payload: VehicleCatalog };
const db = () => openDB('j5-vehicle-catalog', 1, { upgrade(db) { db.createObjectStore('catalog'); } });
let memory: Cached | undefined;
let pending: Promise<VehicleCatalog> | undefined;
export const normalizeCatalog = (s: string) => s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function validCatalog(value: unknown): value is VehicleCatalog {
 const v = value as VehicleCatalog | undefined;
 return !!v && Array.isArray(v.makes) && v.makes.length === 57 && v.makes.reduce((n,m)=>n+(Array.isArray(m.models)?m.models.length:0),0) === 986 && v.makes.every(m=>typeof m.name==='string' && m.name.trim() && Array.isArray(m.models) && m.models.every(s=>typeof s==='string' && s.trim()));
}
async function refresh() {
 if (!pending) pending = (async () => {
  const payload = await api<VehicleCatalog>('/vehicle-catalog');
  if (!validCatalog(payload)) throw new Error('INVALID_CATALOG');
  memory = {schema:1, fetchedAt:Date.now(),payload};
  try { const database=await db(); await database.put('catalog',memory,'current'); database.close(); } catch { /* Suggestions also work when storage is unavailable. */ }
  return payload;
 })().finally(()=>{pending=undefined;});
 return pending;
}
export async function loadVehicleCatalog(update: (catalog: VehicleCatalog)=>void): Promise<void> {
 if (!memory) try {
  const database=await db(); const cached: Cached | undefined=await database.get('catalog','current');
  if(cached?.schema===1 && Number.isFinite(cached.fetchedAt) && validCatalog(cached.payload)) memory=cached;
  else if(cached) await database.delete('catalog','current');
  database.close();
 } catch { /* Free text remains available. */ }
 if(memory) { update(memory.payload); if(Date.now()-memory.fetchedAt<CATALOG_TTL) return; }
 try { update(await refresh()); } catch { /* Cached suggestions or manual input remain available. */ }
}
export function suggestions(values: string[], query: string): string[] {
 const q=normalizeCatalog(query); if(q.length<1) return [];
 return values.filter(v=>normalizeCatalog(v).includes(q)).sort((a,b)=>Number(!normalizeCatalog(a).startsWith(q))-Number(!normalizeCatalog(b).startsWith(q))).slice(0,10);
}
