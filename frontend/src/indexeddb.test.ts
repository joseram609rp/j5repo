// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openDB } from 'idb';
import { Autosave, fresh, storage } from './autosave';
it('IndexedDB persists user-scoped pending payload/key and recovers the exact close after restart', async () => {
  const user = crypto.randomUUID(),
    other = crypto.randomUUID();
  const record = fresh();
  record.revision = 1;
  record.draft = {
    customerName: 'Fixture',
    identification: '123456789',
    phone: '88888888',
    plate: 'ABC123',
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    mileage: 128400,
    notes: 'Revisado',
    recommendations: '',
    items: [{ description: 'Servicio', price: 100 }],
  };
  const server = {
    id: record.id,
    draft: structuredClone(record.draft),
    version: 'v1',
    status: 'OPEN' as const,
    mechanicId: user,
  };
  const service = new Autosave(
    record,
    user,
    'csrf',
    () => {},
    () => {},
    storage.write,
    async () => server,
  );
  await service.sync();
  const failing = new Autosave(
    record,
    user,
    'csrf',
    () => {},
    () => {},
    storage.write,
    async () => {
      throw new TypeError('lost response');
    },
  );
  await expect(failing.action('close')).rejects.toThrow('SYNC_REQUIRED');
  const recovered = (await storage.read(user, record.id))!;
  expect(await storage.read(other)).toBeUndefined();
  expect(recovered.pending?.draft.action).toBe('close');
  const pending = structuredClone(recovered.pending);
  let calls = 0;
  const restart = new Autosave(
    recovered,
    user,
    'csrf',
    () => {},
    () => {},
    storage.write,
    async (_id, mutation) => {
      calls++;
      expect(mutation).toEqual(pending);
      return { ...server, version: 'v2', status: 'CLOSED' as const };
    },
  );
  await restart.action('close');
  expect(calls).toBe(1);
  expect((await storage.read(user, record.id))?.order?.status).toBe('CLOSED');
  expect((await storage.read(user, record.id))?.pending).toBeUndefined();
});

it('persists multiple orders for one user independently', async () => {
 const user=crypto.randomUUID(), a=fresh(), b=fresh();
 a.draft.notes='A'; b.draft.notes='B';
 await storage.write(user,a); await storage.write(user,b);
 expect((await storage.read(user,a.id))?.draft.notes).toBe('A');
 expect((await storage.read(user,b.id))?.draft.notes).toBe('B');
 expect((await storage.list(user)).map(r=>r.id).sort()).toEqual([a.id,b.id].sort());
 expect(await storage.read(crypto.randomUUID(),a.id)).toBeUndefined();
});

it('migrates a legacy user draft atomically without overwriting the newer order copy', async()=>{
 const user=crypto.randomUUID(),old=fresh();old.draft.notes='Legacy';
 const db=await openDB('j5-drafts-v1',1);await db.put('drafts',old,user);
 expect((await storage.list(user)).map(r=>r.id)).toContain(old.id);
 expect((await storage.read(user,old.id))?.draft.notes).toBe('Legacy');
 expect(await db.get('drafts',user)).toBeUndefined();
 const newer=structuredClone(old);newer.draft.notes='Newer';await storage.write(user,newer);await db.put('drafts',old,user);
 expect((await storage.read(user,old.id))?.draft.notes).toBe('Newer');
 db.close();
});
it('independent autosave queues persist different payloads and idempotency keys for the same user',async()=>{
 const user=crypto.randomUUID(),a=fresh(),b=fresh();a.revision=b.revision=1;a.draft.notes='A';b.draft.notes='B';
 const fail=async()=>{throw new TypeError('offline');};
 const first=new Autosave(a,user,'csrf',()=>{},()=>{},storage.write,fail);
 const second=new Autosave(b,user,'csrf',()=>{},()=>{},storage.write,fail);
 await Promise.all([first.sync(),second.sync()]);
 const one=await storage.read(user,a.id),two=await storage.read(user,b.id);
 expect(one?.pending?.draft.notes).toBe('A');expect(two?.pending?.draft.notes).toBe('B');
 expect(one?.pending?.key).not.toBe(two?.pending?.key);
 await first.pause();await second.pause();
});
