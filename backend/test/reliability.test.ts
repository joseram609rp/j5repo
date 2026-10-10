import { afterEach, expect, it, vi } from 'vitest';
import { isTransientSql, retrySql } from '../src/reliability.js';
afterEach(() => vi.restoreAllMocks());
it('classifies nested Azure wakeup/deadlock errors, excluding login failures and cancellation', () => {
  for (const error of [
    { number: 40613 }, { originalError: { info: { number: 40501 } } },
    { code: 'ELOGIN', originalError: { number: 40613 } },
    { errors: [{ number: 1205 }] }, { code: 'ESOCKET' }, { code: 'ETIMEOUT' }
  ]) expect(isTransientSql(error)).toBe(true);
  for (const error of [
    { number: 18456 }, { code: 'ELOGIN' }, { code: 'ECANCEL' },
    { code: 'ESOCKET', originalError: { number: 18456 } }, { number: 2627 }, { number: 547 }, new Error('unknown')
  ]) expect(isTransientSql(error)).toBe(false);
});
it('returns 503 when retry delay cannot fit budget', async () => {
  await expect(retrySql(async () => { throw { number: 40613 }; }, 10)).rejects.toMatchObject({ status: 503 });
});
it('bounds a stalled operation and signals cancellation', async () => {
  const keepAlive = setTimeout(() => {}, 100);
  let signal: AbortSignal | undefined;
  try {
    await expect(retrySql(s => { signal = s; return new Promise(() => {}); }, 10)).rejects.toMatchObject({ status: 503 });
    expect(signal?.aborted).toBe(true);
  } finally { clearTimeout(keepAlive); }
});
it('honors caller cancellation without retrying', async () => {
  const controller = new AbortController();
  const operation = vi.fn(async () => { controller.abort(); throw { code: 'ECANCEL' }; });
  await expect(retrySql(operation, 28000, controller.signal)).rejects.toMatchObject({ status: 503 });
  expect(operation).toHaveBeenCalledTimes(1);
});
it('retries a transient failure then returns its result within budget', async () => {
  // timers/promises is real: keep this test as evidence of the actual backoff path.
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const operation = vi.fn().mockRejectedValueOnce({ number: 1205 }).mockResolvedValueOnce('recovered');
  await expect(retrySql(operation, 6500)).resolves.toBe('recovered');
  expect(operation).toHaveBeenCalledTimes(2);
}, 8000);
it('does not retry SQL login errors', async () => {
  const operation = vi.fn().mockRejectedValue({ number: 18456 });
  await expect(retrySql(operation)).rejects.toMatchObject({ number: 18456 });
  expect(operation).toHaveBeenCalledTimes(1);
});
