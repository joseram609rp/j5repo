import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Autosave, fresh } from './autosave';
import { ApiError } from './api';
import { SyncStatus } from './SyncStatus';

afterEach(() => vi.unstubAllGlobals());
function status() {
  let html = '';
  const report = (message: string, retryable = false) => {
    html = renderToStaticMarkup(<SyncStatus message={message} retryable={retryable} onRetry={() => {}}/>);
  };
  return { report, html: () => html };
}
it('healthy sync shows progress and saved status without manual retry', async () => {
  const state = fresh(); state.revision = 1;
  const view = status();
  let finish!: (value: { version: string }) => void;
  const send = vi.fn(() => new Promise<{ version: string }>(resolve => { finish = resolve; }));
  const saver = new Autosave(state, 'u', 'csrf', view.report, () => {}, async () => {}, send);
  const syncing = saver.sync();
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  expect(view.html()).toContain('Sincronizando');
  expect(view.html()).not.toContain('Reintentar sincronización');
  finish({ version: 'v1' }); await syncing;
  expect(view.html()).toContain('Guardado');
  expect(view.html()).not.toContain('Reintentar sincronización');
});
it('failed sync exposes retry and successful replay removes it preserving the mutation', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const state = fresh(); state.revision = 1;
  const view = status();
  const send = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValue({ version: 'v1' });
  const saver = new Autosave(state, 'u', 'csrf', view.report, () => {}, async () => {}, send);
  await saver.sync();
  expect(view.html()).toContain('Reintentar sincronización');
  const pending = structuredClone(state.pending);
  await saver.sync();
  expect(send.mock.calls[1]![1]).toEqual(pending);
  expect(view.html()).not.toContain('Reintentar sincronización');
});
it('offline failure keeps local status without manual retry and can recover automatically', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  const state = fresh(); state.revision = 1;
  const view = status();
  const send = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue({ version: 'v1' });
  const saver = new Autosave(state, 'u', 'csrf', view.report, () => {}, async () => {}, send);
  await saver.sync();
  expect(view.html()).toContain('Cambios guardados en este dispositivo. Sin conexión.');
  expect(view.html()).not.toContain('Reintentar sincronización');
  vi.stubGlobal('navigator', { onLine: true });
  await saver.sync();
  expect(state.savedRevision).toBe(1);
});
it.each([409, 412, 428, 401])('non-retryable sync failure %s does not offer an ineffective retry', async code => {
  const state = fresh(); state.revision = 1;
  const view = status(); const expire = vi.fn();
  await new Autosave(state, 'u', 'csrf', view.report, expire, async () => {}, vi.fn().mockRejectedValue(new ApiError(code, 'ERROR'))).sync();
  expect(view.html()).not.toContain('Reintentar sincronización');
  expect(expire).toHaveBeenCalledTimes(code === 401 ? 1 : 0);
});
