import { afterEach, expect, it, vi } from 'vitest';
import { requestSignal } from './request-signal';
import { api } from './api';
import { bootstrapSession } from './bootstrap';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function legacy() {
  vi.useFakeTimers();
  vi.stubGlobal('AbortSignal', class extends AbortSignal { static timeout = undefined as never; });
}

it('fallback times out and cleans timers and external listeners', () => {
  legacy();
  const external = new AbortController();
  const remove = vi.spyOn(external.signal, 'removeEventListener');
  const scope = requestSignal(35, external.signal);
  vi.advanceTimersByTime(35);
  expect(scope.signal.aborted).toBe(true);
  scope.cleanup();
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

it('native timeout is feature detected and listeners are released', () => {
  const timeout = new AbortController();
  const native = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
  const remove = vi.spyOn(timeout.signal, 'removeEventListener');
  const scope = requestSignal(123);
  expect(native).toHaveBeenCalledWith(123);
  timeout.abort();
  expect(scope.signal.aborted).toBe(true);
  scope.cleanup();
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

it('legacy bootstrap reaches login on 401 without waiting for a missing API', async () => {
  legacy();
  const fetch = vi.fn(async (url: string) => url.endsWith('/auth/me')
    ? Response.json({code:'UNAUTHORIZED'}, {status:401}) : Response.json({ok:true}));
  vi.stubGlobal('fetch', fetch);
  expect(await bootstrapSession()).toEqual({status:'anonymous',session:null,healthOk:true});
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  expect(fetch.mock.calls.every(call => call[0].startsWith('/api/'))).toBe(true);
});

it('legacy successful body parsing clears its timer and preserves credentials', async () => {
  legacy();
  const fetch = vi.fn().mockResolvedValue(Response.json({ok:true}));
  vi.stubGlobal('fetch', fetch);
  expect(await api('/auth/login', {method:'POST',body:'fixture'})).toEqual({ok:true});
  expect(fetch.mock.calls[0]![1]).toMatchObject({credentials:'same-origin',body:'fixture'});
  expect(vi.getTimerCount()).toBe(0);
});

it('external cancellation during a retry cancels the wait and never retries', async () => {
  legacy();
  const external = new AbortController();
  const fetch = vi.fn().mockResolvedValue(Response.json({}, {status:503}));
  vi.stubGlobal('fetch', fetch);
  const result = api('/health', {signal:external.signal}).catch(e=>e);
  await vi.advanceTimersByTimeAsync(1);
  external.abort();
  expect(await result).toMatchObject({name:'AbortError'});
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('already cancelled requests never fetch', async () => {
  const external = new AbortController(); external.abort();
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(api('/health', {signal:external.signal})).rejects.toMatchObject({name:'AbortError'});
  expect(fetch).not.toHaveBeenCalled();
});

it('external cancellation during fetch is propagated without retry', async () => {
  legacy();
  const external = new AbortController();
  const fetch = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  vi.stubGlobal('fetch', fetch);
  const result = api('/health', {signal:external.signal}).catch(e=>e);
  external.abort();
  expect(await result).toMatchObject({name:'AbortError'});
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['network', '503'])('legacy bootstrap reports %s failure after bounded retries', async kind => {
  legacy();
  const fetch = kind === 'network' ? vi.fn().mockRejectedValue(new TypeError('offline'))
    : vi.fn().mockResolvedValue(Response.json({}, {status:503}));
  vi.stubGlobal('fetch', fetch);
  const result = bootstrapSession().catch(e=>e);
  await vi.advanceTimersByTimeAsync(30000);
  expect(await result).toMatchObject({message:'SESSION_CHECK_FAILED'});
  expect(fetch).toHaveBeenCalledTimes(8);
  expect(vi.getTimerCount()).toBe(0);
});

it('legacy timeout retries idempotent writes with unchanged body, ETag and key', async () => {
  legacy();
  const fetch = vi.fn()
    .mockImplementationOnce((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError')));
    }))
    .mockResolvedValue(Response.json({ok:true}));
  vi.stubGlobal('fetch', fetch);
  const result = api('/orders/fixture', {method:'PUT',body:'same-body',
    headers:{'Idempotency-Key':'same-key','If-Match':'v1','X-CSRF-Token':'fixture'}});
  await vi.advanceTimersByTimeAsync(38000);
  expect(await result).toEqual({ok:true});
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const call of fetch.mock.calls) {
    expect(call[1].body).toBe('same-body');
    expect(call[1].headers.get('Idempotency-Key')).toBe('same-key');
    expect(call[1].headers.get('If-Match')).toBe('v1');
    expect(call[1].headers.get('X-CSRF-Token')).toBe('fixture');
  }
  expect(vi.getTimerCount()).toBe(0);
});
