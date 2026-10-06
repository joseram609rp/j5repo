import { expect, it, vi } from 'vitest';
import { Autosave, fresh, type RecordState } from './autosave';
import { ApiError, api } from './api';
vi.mock('./api', async (original) => ({ ...(await original<typeof import('./api')>()), api: vi.fn() }));
it('preserves the exact pending key and payload across lost responses and reloads', async () => {
  let disk: RecordState = fresh();
  const write = async (_: string, state: RecordState) => {
    disk = structuredClone(state);
  };
  const send = vi.fn().mockRejectedValue(new TypeError('offline'));
  const state = fresh();
  state.revision = 1;
  state.draft.notes = 'first';
  const a = new Autosave(
    state,
    'u',
    'csrf',
    () => {},
    () => {},
    write,
    send,
  );
  await a.sync();
  const pending = structuredClone(disk.pending);
  disk.draft.notes = 'second';
  disk.revision++;
  const recovered = structuredClone(disk);
  const success = vi
    .fn()
    .mockResolvedValueOnce({ version: '0000000000000001' })
    .mockResolvedValueOnce({ version: '0000000000000002' });
  const b = new Autosave(
    recovered,
    'u',
    'csrf',
    () => {},
    () => {},
    write,
    success,
  );
  await b.sync();
  expect(success.mock.calls[0]?.[1]).toEqual(pending);
  expect(success.mock.calls[1]?.[1].key).not.toBe(pending?.key);
  expect(success.mock.calls[1]?.[1].version).toBe('0000000000000001');
  expect(disk.savedRevision).toBe(2);
  expect(disk.pending).toBeUndefined();
});
it('halts on conflict without discarding draft or pending mutation', async () => {
  const state = fresh();
  state.revision = 1;
  const send = vi.fn().mockRejectedValue(new ApiError(412, 'VERSION_CONFLICT'));
  const a = new Autosave(
    state,
    'u',
    'csrf',
    () => {},
    () => {},
    async () => {},
    send,
  );
  await a.sync();
  await a.sync();
  expect(send).toHaveBeenCalledTimes(1);
  expect(state.pending).toBeDefined();
  expect(state.savedRevision).toBe(0);
});
it('never sends a write if local persistence failed', async () => {
  const state = fresh();
  state.revision = 1;
  const send = vi.fn();
  await new Autosave(
    state,
    'u',
    'csrf',
    () => {},
    () => {},
    async () => {
      throw new Error('quota');
    },
    send,
  ).sync();
  expect(send).not.toHaveBeenCalled();
});
it('waits for an in-flight write before releasing the editor on pause', async () => {
  const state = fresh();
  state.revision = 1;
  let finish!: (value: { version: string }) => void;
  const send = vi.fn(
    () =>
      new Promise<{ version: string }>((resolve) => {
        finish = resolve;
      }),
  );
  const a = new Autosave(
    state,
    'u',
    'csrf',
    () => {},
    () => {},
    async () => {},
    send,
  );
  const sync = a.sync();
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  let paused = false;
  const pause = a.pause().then(() => {
    paused = true;
  });
  await Promise.resolve();
  expect(paused).toBe(false);
  finish({ version: '0000000000000001' });
  await sync;
  await pause;
  expect(paused).toBe(true);
  expect(state.version).toBe('0000000000000001');
});

it('legacy IndexedDB draft and pending mutation without model replay unchanged before a new model revision', async () => {
  const state = fresh();
  delete state.draft.model;
  state.revision = 1;
  const first = vi.fn().mockRejectedValue(new TypeError('offline'));
  const a = new Autosave(
    state,
    'u',
    'csrf',
    () => {},
    () => {},
    async () => {},
    first,
  );
  await a.sync();
  const pending = structuredClone(state.pending);
  const recovered = structuredClone(state);
  recovered.draft.model = 'Hilux';
  recovered.revision++;
  const send = vi.fn().mockResolvedValue({ version: '0000000000000001' });
  const b = new Autosave(
    recovered,
    'u',
    'csrf',
    () => {},
    () => {},
    async () => {},
    send,
  );
  await b.sync();
  expect(send.mock.calls[0]![1]).toEqual(pending);
  expect(send.mock.calls[0]![1].draft).not.toHaveProperty('model');
  expect(send.mock.calls[1]![1].draft.model).toBe('Hilux');
  expect(send.mock.calls[1]![1].key).not.toBe(pending!.key);
});

it('autosave sends integer mileage and empty OPEN notes without display formatting', async () => {
  const state = fresh();
  state.revision = 1;
  state.draft.mileage = 128400;
  const send = vi.fn().mockResolvedValue({ version: '0000000000000001' });
  await new Autosave(
    state,
    'u',
    'csrf',
    () => {},
    () => {},
    async () => {},
    send,
  ).sync();
  const payload = JSON.parse(JSON.stringify(send.mock.calls[0]![1].draft));
  expect(payload.mileage).toBe(128400);
  expect(Number.isInteger(payload.mileage)).toBe(true);
  expect(payload.notes).toBe('');
});

it('a known close rejection clears the action and permits correcting the OPEN draft', async () => {
  const state = fresh();
  state.draft = {
    customerName: 'Fixture',
    identification: '123456789',
    phone: '88888888',
    plate: 'ABC123',
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    mileage: 0,
    notes: 'Revisado',
    recommendations: '',
    items: [{ description: 'Servicio', price: 1 }],
  };
  state.version = 'v1';
  state.order = {
    id: state.id,
    version: 'v1',
    status: 'OPEN',
    mechanicId: 'u',
    draft: structuredClone(state.draft),
  };
  const saver = new Autosave(
    state,
    'u',
    'csrf',
    () => {},
    () => {},
    async () => {},
    async () => {
      throw new ApiError(400, 'ORDER_INCOMPLETE');
    },
  );
  await expect(saver.action('close')).rejects.toThrow('ACTION_REJECTED');
  expect(state.pending).toBeUndefined();
  expect(state.draft.action).toBeUndefined();
  await saver.edit({ ...state.draft, notes: 'Corregido' });
  await saver.pause();
  expect(state.draft.notes).toBe('Corregido');
});
it('cannot close when a prior autosave still has an ambiguous result', async () => {
  const state = fresh();
  state.revision = 1;
  const send = vi.fn().mockRejectedValue(new TypeError('network'));
  const saver = new Autosave(
    state,
    'u',
    'csrf',
    () => {},
    () => {},
    async () => {},
    send,
  );
  await expect(saver.action('close')).rejects.toThrow('SYNC_REQUIRED');
  expect(state.pending?.draft.action).toBeUndefined();
  expect(send).toHaveBeenCalledOnce();
});
it('closed metadata refuses edits until an explicit reopen action', async () => {
  const state = fresh();
  state.order = {
    id: state.id,
    version: 'v1',
    status: 'CLOSED',
    mechanicId: 'u',
    draft: state.draft,
  };
  const saver = new Autosave(
    state,
    'u',
    'csrf',
    () => {},
    () => {},
    async () => {},
    vi.fn(),
  );
  await expect(
    saver.edit({ ...state.draft, notes: 'illegal' }),
  ).rejects.toThrow('ORDER_LOCKED');
  expect(state.revision).toBe(0);
});

it('replaying a known rejected close cannot report a successful closure', async () => {
  const state = fresh();
  state.draft = {
    customerName: 'Fixture',
    identification: '123456789',
    phone: '88888888',
    plate: 'ABC123',
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    mileage: 0,
    notes: 'Revisado',
    recommendations: '',
    items: [{ description: 'Servicio', price: 1 }],
    action: 'close',
  };
  state.version = 'v1';
  state.revision = 1;
  state.pending = {
    key: crypto.randomUUID(),
    draft: structuredClone(state.draft),
    version: 'v1',
    revision: 1,
  };
  state.order = {
    id: state.id,
    version: 'v1',
    status: 'OPEN',
    mechanicId: 'u',
    draft: state.draft,
  };
  const saver = new Autosave(
    state,
    'u',
    'csrf',
    () => {},
    () => {},
    async () => {},
    async () => {
      throw new ApiError(400, 'ORDER_INCOMPLETE');
    },
  );
  await expect(saver.action('close')).rejects.toThrow('ACTION_REJECTED');
  expect(state.order.status).toBe('OPEN');
  expect(state.pending).toBeUndefined();
});


it('412 after metadata reassignment refetches and preserves local edits with a fresh retry key',async()=>{
 const state=fresh(), remote={id:state.id,status:'OPEN' as const,version:'v2',draft:structuredClone(state.draft),mechanicId:'new',mechanicName:'Nuevo'};
 state.version='v1';state.order={...remote,version:'v1',mechanicId:'old'};state.draft.notes='local edit';state.revision=1;
 vi.mocked(api).mockResolvedValue(remote);const report=vi.fn();const send=vi.fn().mockRejectedValueOnce(new ApiError(412,'VERSION_CONFLICT')).mockResolvedValueOnce({...remote,version:'v3',draft:structuredClone(state.draft)});
 const service=new Autosave(state,'u','csrf',report,()=>{},async()=>{},send);
 await service.sync();expect(api).toHaveBeenCalledWith('/orders/'+state.id);expect(state.version).toBe('v2');expect(state.draft.notes).toBe('local edit');expect(state.pending).toBeUndefined();
 expect(report.mock.calls.some(([text])=>text.includes('reasignada a Nuevo'))).toBe(true);
 await service.sync();expect(send.mock.calls[1]![1].key).not.toBe(send.mock.calls[0]![1].key);expect(send.mock.calls[1]![1].version).toBe('v2');expect(state.savedRevision).toBe(1);
});
it('remote content conflict preserves draft/pending and halts instead of overwriting unseen edits',async()=>{
 const state=fresh(), remote={id:state.id,status:'OPEN' as const,version:'v2',draft:{...state.draft,notes:'someone else'},mechanicId:'new'};
 state.version='v1';state.order={...remote,version:'v1',draft:structuredClone(state.draft),mechanicId:'old'};state.draft.notes='local';state.revision=1;
 vi.mocked(api).mockResolvedValue(remote);const send=vi.fn().mockRejectedValue(new ApiError(412,'VERSION_CONFLICT'));
 const service=new Autosave(state,'u','csrf',()=>{},()=>{},async()=>{},send);
 await service.sync();await service.sync();expect(send).toHaveBeenCalledTimes(1);expect(state.draft.notes).toBe('local');expect(state.pending).toBeDefined();expect(state.order?.mechanicId).toBe('new');expect(state.version).toBe('v1');
});

it('a late focus GET cannot replace the editor after switching orders',async()=>{
 const state=fresh();state.version='v1';state.order={id:state.id,status:'OPEN',version:'v1',draft:structuredClone(state.draft),mechanicId:'old'};
 let resolve!:(value:unknown)=>void;vi.mocked(api).mockImplementation(()=>new Promise(done=>{resolve=done;}) as never);
 const report=vi.fn(),service=new Autosave(state,'u','csrf',report,()=>{},async()=>{},vi.fn());
 const refreshing=service.refresh();await service.pause();resolve({...state.order,version:'v2',mechanicId:'new'});await refreshing;
 expect(state.version).toBe('v1');expect(state.order.mechanicId).toBe('old');expect(report).not.toHaveBeenCalled();
});

it('polling a VOID after a lost cancellation response still allows exact idempotent replay',async()=>{
 const state=fresh();state.version='v1';state.order={id:state.id,status:'OPEN',version:'v1',draft:structuredClone(state.draft),mechanicId:'u'};
 const remote={...state.order,status:'VOID' as const,version:'v2'},send=vi.fn().mockRejectedValueOnce(new TypeError('lost response')).mockResolvedValueOnce(remote);
 vi.mocked(api).mockResolvedValue(remote);const service=new Autosave(state,'u','csrf',()=>{},()=>{},async()=>{},send);
 await expect(service.action('void')).rejects.toThrow('SYNC_REQUIRED');const pending=structuredClone(state.pending);
 await service.refresh();expect(state.order.status).toBe('VOID');expect(state.pending).toEqual(pending);
 expect((await service.action('void'))?.status).toBe('VOID');expect(send.mock.calls[1]?.[1]).toEqual(pending);expect(state.pending).toBeUndefined();
});
