import { setTimeout as sleep } from 'node:timers/promises';
export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const transient = new Set([40613, 40197, 40501, 49918, 49919, 49920, 10928, 10929, 1205]);
export function isTransientSql(error: unknown): boolean {
  const seen = new Set<object>(); const numbers: number[] = []; const codes: string[] = [];
  function collect(value: unknown) {
    if (!value || typeof value !== 'object' || seen.has(value) || seen.size >= 20) return;
    seen.add(value);
    const e = value as { number?: number; code?: string; info?: unknown; originalError?: unknown; cause?: unknown; errors?: unknown[]; precedingErrors?: unknown[] };
    if (typeof e.number === 'number') numbers.push(e.number);
    if (typeof e.code === 'string') codes.push(e.code);
    [e.info, e.originalError, e.cause, ...(e.errors ?? []), ...(e.precedingErrors ?? [])].forEach(collect);
  }
  collect(error);
  if (numbers.includes(18456) || codes.includes('ECANCEL')) return false;
  if (numbers.some(number => transient.has(number))) return true;
  if (codes.includes('ELOGIN')) return false;
  return codes.some(code => ['ESOCKET', 'ETIMEOUT', 'ECONNRESET'].includes(code));
}
/** Retry reads or COMPLETE idempotent transactions; never an isolated ambiguous write. */
export async function retrySql<T>(operation: (signal: AbortSignal) => Promise<T>, budgetMs = 28000, caller?: AbortSignal): Promise<T> {
  const deadline = Date.now() + budgetMs;
  const budget = AbortSignal.timeout(budgetMs);
  const signal = caller ? AbortSignal.any([budget, caller]) : budget;
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw new HttpError(503, 'SQL_UNAVAILABLE');
    try {
      return await new Promise<T>((resolve, reject) => {
        const abort = () => reject(new HttpError(503, 'SQL_UNAVAILABLE'));
        signal.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(() => operation(signal)).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
      });
    } catch (error) {
      if (signal.aborted) throw new HttpError(503, 'SQL_UNAVAILABLE');
      if (error instanceof HttpError || !isTransientSql(error)) throw error;
      const wait = 5000 * 2 ** attempt + Math.floor(Math.random() * 300);
      if (attempt >= 2 || Date.now() + wait >= deadline) throw new HttpError(503, 'SQL_UNAVAILABLE');
      try { await sleep(wait, undefined, { signal }); }
      catch { throw new HttpError(503, 'SQL_UNAVAILABLE'); }
    }
  }
}
