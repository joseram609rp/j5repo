import { afterEach, expect, it, vi } from 'vitest';
import { api } from './api';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('does not retry unsafe mutations or version conflicts', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ code: 'BUSY' }, { status: 503 })); vi.stubGlobal('fetch', fetch);
  await expect(api('/auth/login', { method: 'POST' })).rejects.toMatchObject({ status: 503 }); expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue(Response.json({ code: 'CONFLICT' }, { status: 412 }));
  await expect(api('/orders/1', { method: 'PUT', headers: { 'Idempotency-Key': 'key' } })).rejects.toMatchObject({ status: 412 }); expect(fetch).toHaveBeenCalledTimes(2);
});
it('honors Retry-After and preserves write identity', async () => {
  vi.useFakeTimers(); const fetch = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503, headers: { 'Retry-After': '6' } })).mockResolvedValueOnce(Response.json({ ok: true })); vi.stubGlobal('fetch', fetch);
  const promise = api('/orders/1', { method: 'PUT', headers: { 'Idempotency-Key': 'same-key' }, body: '{}' });
  await vi.advanceTimersByTimeAsync(5999); expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000); expect(await promise).toEqual({ ok: true });
  expect(fetch.mock.calls[1]?.[1].headers.get('Idempotency-Key')).toBe('same-key');
});
