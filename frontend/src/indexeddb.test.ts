// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
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
  const recovered = (await storage.read(user))!;
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
  expect((await storage.read(user))?.order?.status).toBe('CLOSED');
  expect((await storage.read(user))?.pending).toBeUndefined();
});
