import { expect, it, vi } from 'vitest';
import { Autosave, fresh, type RecordState } from './autosave';
import { ApiError } from './api';
it('preserves the exact pending key and payload across lost responses and reloads', async () => {
  let disk: RecordState = fresh();
  const write = async (_: string, state: RecordState) => { disk = structuredClone(state); };
  const send = vi.fn().mockRejectedValue(new TypeError('offline'));
  const state = fresh(); state.revision = 1; state.draft.notes = 'first';
  const a = new Autosave(state, 'u', 'csrf', () => {}, () => {}, write, send);
  await a.sync();
  const pending = structuredClone(disk.pending);
  disk.draft.notes = 'second'; disk.revision++;
  const recovered = structuredClone(disk);
  const success = vi.fn().mockResolvedValueOnce({ version: 1 }).mockResolvedValueOnce({ version: 2 });
  const b = new Autosave(recovered, 'u', 'csrf', () => {}, () => {}, write, success);
  await b.sync();
  expect(success.mock.calls[0]?.[1]).toEqual(pending);
  expect(success.mock.calls[1]?.[1].key).not.toBe(pending?.key);
  expect(success.mock.calls[1]?.[1].version).toBe(1);
  expect(disk.savedRevision).toBe(2); expect(disk.pending).toBeUndefined();
});
it('halts on conflict without discarding draft or pending mutation', async () => {
  const state = fresh(); state.revision = 1;
  const send = vi.fn().mockRejectedValue(new ApiError(412, 'VERSION_CONFLICT'));
  const a = new Autosave(state, 'u', 'csrf', () => {}, () => {}, async () => {}, send);
  await a.sync(); await a.sync();
  expect(send).toHaveBeenCalledTimes(1); expect(state.pending).toBeDefined(); expect(state.savedRevision).toBe(0);
});
it('never sends a write if local persistence failed', async () => {
  const state = fresh(); state.revision = 1; const send = vi.fn();
  await new Autosave(state, 'u', 'csrf', () => {}, () => {}, async () => { throw new Error('quota'); }, send).sync();
  expect(send).not.toHaveBeenCalled();
});
it('waits for an in-flight write before releasing the editor on pause', async () => {
  const state = fresh(); state.revision = 1;
  let finish!: (value: { version: number }) => void;
  const send = vi.fn(() => new Promise<{version: number}>(resolve => { finish = resolve; }));
  const a = new Autosave(state, 'u', 'csrf', () => {}, () => {}, async () => {}, send);
  const sync = a.sync();
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  let paused = false; const pause = a.pause().then(() => { paused = true; });
  await Promise.resolve(); expect(paused).toBe(false);
  finish({version: 1}); await sync; await pause;
  expect(paused).toBe(true); expect(state.version).toBe(1);
});
