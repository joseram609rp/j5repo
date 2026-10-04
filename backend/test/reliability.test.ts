import { expect, it } from 'vitest';
import { isTransientSql, retrySql } from '../src/reliability.js';
it('retries only known transient errors, not login errors', () => {
  expect(isTransientSql({ number: 40613 })).toBe(true);
  expect(isTransientSql({ number: 18456 })).toBe(false);
  expect(isTransientSql({ originalError: { info: { number: 40501 } } })).toBe(true);
});
it('returns 503 when retry delay cannot fit budget', async () => {
  await expect(retrySql(async () => { throw { number: 40613 }; }, 10)).rejects.toMatchObject({ status: 503 });
});
it('bounds a stalled operation', async () => {
  const keepAlive = setTimeout(() => {}, 100);
  try { await expect(retrySql(() => new Promise(() => {}), 10)).rejects.toMatchObject({ status: 503 }); }
  finally { clearTimeout(keepAlive); }
});
