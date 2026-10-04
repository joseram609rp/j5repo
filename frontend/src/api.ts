export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers(options.headers);
  const safe = method === 'GET' || headers.has('Idempotency-Key');
  const deadline = Date.now() + 120000;
  for (let attempt = 0; ; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin', signal: AbortSignal.timeout(Math.min(35000, Math.max(1, deadline - Date.now()))) });
      if (response.ok) return await response.json() as T;
      const body = await response.json().catch(() => ({ code: 'API_ERROR' }));
      throw new ApiError(response.status, body.code);
    } catch (error) {
      const transient = error instanceof ApiError ? [408, 429, 502, 503, 504].includes(error.status) : error instanceof TypeError || (error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name));
      if (!safe || !transient || attempt >= 3) throw error;
      const retryAfter = response?.headers.get('Retry-After');
      const seconds = Number(retryAfter);
      const retryMs = retryAfter ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
      const wait = Math.max([2000, 5000, 10000][attempt]!, Number.isFinite(retryMs) ? retryMs : 0) + Math.random() * 250;
      if (Date.now() + wait >= deadline) throw error;
      await delay(wait);
    }
  }
}
