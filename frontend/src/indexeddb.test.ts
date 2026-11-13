// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import { Autosave, fresh, storage, type Order } from './autosave';
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
 const db=await openDB('j5-drafts-v1',2);await db.put('drafts',old,user);
 expect((await storage.list(user)).map(r=>r.id)).toContain(old.id);
 expect(await db.get('drafts',user)).toEqual(old);
 expect((await storage.read(user,old.id))?.draft.notes).toBe('Legacy');
 expect(await db.get('drafts',user)).toBeUndefined();
 const newer=(await storage.read(user,old.id))!;newer.draft.notes='Newer';await storage.write(user,newer);await db.put('drafts',old,user);
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

it('keeps historical edits local and retries a confirmed close with the same persisted key and date', async () => {
  const user = crypto.randomUUID();
  const record = fresh();
  record.draft.workDate = '2024-02-29';
  record.revision = 1;
  let calls = 0;
  const offline = async () => { calls++; throw new TypeError('response lost'); };
  const service = new Autosave(record, user, 'csrf', () => {}, () => {}, storage.write, offline);
  await service.edit({ ...record.draft, notes: 'local' });
  await service.sync();
  expect(calls).toBe(0);
  expect((await storage.read(user, record.id))?.draft.workDate).toBe('2024-02-29');
  await expect(service.action('close')).rejects.toThrow('SYNC_REQUIRED');
  await service.pause();
  const recovered = (await storage.read(user, record.id))!;
  const pending = structuredClone(recovered.pending);
  expect(pending).toMatchObject({ version: null, draft: { workDate: '2024-02-29', action: 'close', notes: 'local' } });

  const send = vi.fn(async () => ({
    id: record.id, version: '1', status: 'CLOSED' as const, mechanicId: user, isBackfilled: true, orderDate: '2024-02-29',
    draft: { ...recovered.draft, action: undefined },
  }));
  const resumed = new Autosave(recovered, user, 'csrf', () => {}, () => {}, storage.write, send);
  await resumed.sync();
  expect(send).toHaveBeenCalledExactlyOnceWith(record.id, pending);
  const saved = (await storage.read(user, record.id))!;
  expect(saved.pending).toBeUndefined();
  expect(saved.order).toMatchObject({ status: 'CLOSED', isBackfilled: true, orderDate: '2024-02-29' });
});

it('rejects cancellation after a historical close is pending, preserving the exact retry', async () => {
  const user = crypto.randomUUID();
  const record = fresh();
  record.draft.workDate = '2024-02-29';
  const offline = vi.fn(async () => { throw new TypeError('response lost'); });
  const service = new Autosave(record, user, 'csrf', () => {}, () => {}, storage.write, offline);
  await expect(service.action('close')).rejects.toThrow('SYNC_REQUIRED');
  const pending = structuredClone(record.pending);
  await expect(service.cancelBackfill()).rejects.toThrow('ORDER_LOCKED');
  expect((await storage.read(user, record.id))?.pending).toEqual(pending);
  expect(record.cancelled).toBeUndefined();
});

it('atomically keeps both concurrent edits and leaves the winning revision usable', async () => {
  const user = crypto.randomUUID();
  const record = fresh();
  await storage.write(user, record);
  const left = (await storage.read(user, record.id))!;
  const right = (await storage.read(user, record.id))!;
  left.draft.notes = 'Pestaña izquierda';
  right.draft.notes = 'Pestaña derecha';
  const outcomes = await Promise.allSettled([storage.write(user, left), storage.write(user, right)]);
  expect(outcomes.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  const canonical = (await storage.read(user, record.id))!;
  expect([canonical.draft.notes, canonical.recoveryCopies?.[0]?.draft.notes].sort())
    .toEqual(['Pestaña derecha', 'Pestaña izquierda']);
  const winner = outcomes[0].status === 'fulfilled' ? left : right;
  winner.localRevision = canonical.localRevision;
  winner.draft.notes = 'Segunda edición de la pestaña vigente';
  await storage.write(user, winner);
  const saved = (await storage.read(user, record.id))!;
  expect(saved.draft.notes).toBe(winner.draft.notes);
  expect(saved.recoveryCopies).toEqual(canonical.recoveryCopies);
});

it('preserves a newer offline edit while the first tab receives a remote response', async () => {
  const user = crypto.randomUUID();
  const record = fresh();
  record.revision = 1;
  await storage.write(user, record);
  let accept!: (order: Order) => void;
  let started!: () => void;
  const sent = new Promise<void>(resolve => { started = resolve; });
  const reply = new Promise<Order>(resolve => { accept = resolve; });
  const first = new Autosave((await storage.read(user, record.id))!, user, 'csrf', () => {}, () => {}, storage.write,
    async () => { started(); return reply; });
  const syncing = first.sync();
  await sent;
  const pending = (await storage.read(user, record.id))!;
  const second = new Autosave(pending, user, 'csrf', () => {}, () => {}, storage.write,
    async (_id, mutation) => {
      expect(mutation).toEqual(original);
      throw new TypeError('offline');
    });
  const original = structuredClone(pending.pending);
  second.setBackground(true);
  await second.edit({ ...second.state.draft, notes: 'Edición más reciente' });
  accept({ id: record.id, draft: record.draft, status: 'OPEN', version: 'v1', mechanicId: user });
  await syncing;
  expect(first.localConflict).toBe(true);
  await expect(first.flush()).rejects.toThrow('SYNC_REQUIRED');
  await second.pause();
  const recovered = (await storage.read(user, record.id))!;
  expect(recovered.draft.notes).toBe('Edición más reciente');
  expect(recovered.pending).toEqual(original);
  expect(recovered.recoveryCopies?.[0]?.version).toBe('v1');
});

it('keeps a pending historical close canonical when a stale tab tries to cancel', async () => {
  const user = crypto.randomUUID();
  const record = fresh();
  record.draft.workDate = '2024-02-29';
  await storage.write(user, record);
  const offline = vi.fn(async () => { throw new TypeError('offline'); });
  const closer = new Autosave((await storage.read(user, record.id))!, user, 'csrf', () => {}, () => {}, storage.write, offline);
  const canceller = new Autosave((await storage.read(user, record.id))!, user, 'csrf', () => {}, () => {}, storage.write, offline);
  await expect(closer.action('close')).rejects.toThrow('SYNC_REQUIRED');
  const pending = (await storage.read(user, record.id))!.pending;
  await expect(canceller.cancelBackfill()).rejects.toThrow('LOCAL_CONFLICT');
  expect((await storage.read(user, record.id))).toMatchObject({ pending });
  expect((await storage.read(user, record.id))?.cancelled).toBeUndefined();
  expect(offline).toHaveBeenCalledTimes(1);
  await Promise.all([closer.pause(), canceller.pause()]);
});
