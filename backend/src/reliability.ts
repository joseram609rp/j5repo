import { setTimeout as sleep } from 'node:timers/promises';
export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const transient = new Set([40613, 40197, 40501, 49918, 49919, 49920, 10928, 10929, 1205]);
export function isTransientSql(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { number?: number; code?: string; originalError?: { info?: { number?: number } } };
  return transient.has(e.number ?? e.originalError?.info?.number ?? -1) || ['ESOCKET', 'ETIMEOUT', 'ECONNRESET'].includes(e.code ?? '');
}
/** Only reads or whole idempotent transactions. Adapter MUST honor signal and cancel commands. */
export async function retrySql<T>(operation: (signal: AbortSignal) => Promise<T>, budgetMs = 28000): Promise<T> {
  const deadline = Date.now() + budgetMs;
  for (let attempt = 0; ; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new HttpError(503, 'SQL_UNAVAILABLE');
    const signal = AbortSignal.timeout(remaining);
    try {
      return await new Promise<T>((resolve, reject) => {
        const abort = () => reject(new HttpError(503, 'SQL_UNAVAILABLE'));
        signal.addEventListener('abort', abort, { once: true });
        operation(signal).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (!isTransientSql(error)) throw error;
      const wait = 5000 * 2 ** attempt + Math.floor(Math.random() * 300);
      if (attempt >= 2 || Date.now() + wait >= deadline) throw new HttpError(503, 'SQL_UNAVAILABLE');
      await sleep(wait);
    }
  }
}
