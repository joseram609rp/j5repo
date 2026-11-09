// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startEditorLock } from './editor-lock';

type Controller = ReturnType<typeof startEditorLock>;
const controllers: Controller[] = [];
let visibility: DocumentVisibilityState;
let browserOwnsLock: boolean;
let request: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  browserOwnsLock = false;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  request = vi.fn(async (_name: string, _options: LockOptions, callback: LockGrantedCallback<Promise<void>>) => {
    if (browserOwnsLock) return callback(null);
    browserOwnsLock = true;
    try { return await callback({ name: _name, mode: 'exclusive' }); }
    finally { browserOwnsLock = false; }
  });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
});

afterEach(async () => {
  controllers.splice(0).forEach(controller => controller.dispose());
  await vi.advanceTimersByTimeAsync(0);
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'locks');
  vi.useRealTimers();
});

function start(onRelease = async () => {}) {
  const status = vi.fn();
  const controller = startEditorLock('mechanic', status, onRelease);
  controllers.push(controller);
  return { controller, status };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

it('waits out a real contention response after reload and bounds automatic retries', async () => {
  browserOwnsLock = true;
  const { controller, status } = start();
  await vi.advanceTimersByTimeAsync(20000);
  expect(request).toHaveBeenCalledTimes(7);
  expect(status).toHaveBeenLastCalledWith('occupied');
  expect(controller.lease).toBeUndefined();
  await expect(controller.write(undefined, async () => {})).rejects.toThrow('EDITOR_NOT_READY');
  browserOwnsLock = false;
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(status).toHaveBeenLastCalledWith('ready');
  expect(request).toHaveBeenLastCalledWith('j5-editor-mechanic', { ifAvailable: true }, expect.any(Function));
});

it('retries automatically when another tab releases after the initial attempt', async () => {
  browserOwnsLock = true;
  const { status } = start();
  await vi.advanceTimersByTimeAsync(150);
  expect(status).toHaveBeenLastCalledWith('occupied');
  browserOwnsLock = false;
  await vi.advanceTimersByTimeAsync(350);
  expect(status).toHaveBeenLastCalledWith('ready');
});

it('defers requests while hidden and wakes on visibility change', async () => {
  visibility = 'hidden';
  const { status } = start();
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(request).not.toHaveBeenCalled();
  visibility = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(status).toHaveBeenLastCalledWith('ready');
});

it('revokes the lease at pagehide and waits for writes and pause before pageshow can reacquire', async () => {
  const write = deferred();
  const paused = deferred();
  const { controller, status } = start(() => paused.promise);
  await vi.advanceTimersByTimeAsync(0);
  const oldLease = controller.lease;
  const persisting = controller.write(oldLease, () => write.promise);
  window.dispatchEvent(new Event('pagehide'));
  expect(controller.lease).toBeUndefined();
  expect(status).toHaveBeenLastCalledWith('checking');
  const lateWrite = vi.fn(async () => {});
  await expect(controller.write(oldLease, lateWrite)).rejects.toThrow('EDITOR_NOT_READY');
  expect(lateWrite).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('pageshow'));
  paused.resolve();
  await vi.advanceTimersByTimeAsync(10000);
  expect(browserOwnsLock).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
  write.resolve();
  await persisting;
  await vi.advanceTimersByTimeAsync(0);
  expect(status).toHaveBeenLastCalledWith('ready');
  expect(controller.lease).not.toBe(oldLease);
});

it('discards a late grant after unmount and serializes a StrictMode-style remount', async () => {
  const grant = deferred();
  request.mockImplementationOnce(async (name: string, _options: LockOptions, callback: LockGrantedCallback<Promise<void>>) => {
    await grant.promise;
    return callback({ name, mode: 'exclusive' });
  });
  const first = start();
  await vi.advanceTimersByTimeAsync(0);
  first.controller.dispose();
  const second = start();
  await vi.advanceTimersByTimeAsync(0);
  expect(request).toHaveBeenCalledTimes(1);
  grant.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(first.status).not.toHaveBeenCalledWith('ready');
  expect(second.status).toHaveBeenLastCalledWith('ready');
});
