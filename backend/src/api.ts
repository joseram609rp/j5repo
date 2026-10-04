import { z } from 'zod';
import { config } from './config.js';
import { HttpError } from './reliability.js';
import { draftSchema, MemoryStore } from './store.js';
const uuid = z.uuid();
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export function createApi(options: { demo: boolean; store?: MemoryStore; now?: () => number; idleMs?: number }) {
  const store = options.store ?? new MemoryStore();
  const now = options.now ?? Date.now;
  const idleMs = options.idleMs ?? config.idleMs;
  return async (request: Request): Promise<Response> => {
    try {
      const path = new URL(request.url).pathname;
      const method = request.method;
      if (path === '/api/health' && method === 'GET') return json({ status: 'ok', mode: options.demo ? 'local-demo' : 'unconfigured' });
      // Fail closed. Production must supply persistent sessions, users and SQL repository first.
      if (!options.demo) throw new HttpError(503, 'AUTH_AND_STORAGE_NOT_CONFIGURED');
      if (!['GET', 'HEAD'].includes(method) && request.headers.get('origin') !== config.origin) throw new HttpError(403, 'ORIGIN_REJECTED');
      if (path === '/api/session/demo' && method === 'POST') {
        const { token, session } = store.login(now());
        return json({ userId: session.userId, csrf: session.csrf, idleMs, lastActivity: session.lastActivity }, 200,
          { 'Set-Cookie': `j5_session=${token}; HttpOnly; SameSite=Strict; Path=/api` });
      }
      const token = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith('j5_session='))?.slice(11) ?? '';
      const session = store.session(token, now(), idleMs);
      if (!['GET', 'HEAD'].includes(method) && request.headers.get('x-csrf-token') !== session.csrf) throw new HttpError(403, 'CSRF_REJECTED');
      if (path === '/api/session' && method === 'GET') return json({ ...session, idleMs });
      if (path === '/api/session/activity' && method === 'POST') {
        session.lastActivity = now();
        return json({ lastActivity: session.lastActivity });
      }
      if (path === '/api/session' && method === 'DELETE') {
        store.sessions.delete(token);
        return json({}, 200, { 'Set-Cookie': 'j5_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0' });
      }
      const match = /^\/api\/orders\/([^/]+)$/.exec(path);
      if (match && method === 'GET') {
        const order = store.orders.get(match[1]!);
        if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND');
        return json(order, 200, { ETag: `"${order.version}"` });
      }
      if (match && method === 'PUT') {
        const id = uuid.parse(match[1]);
        const key = uuid.parse(request.headers.get('idempotency-key'));
        const raw = await request.text();
        if (raw.length > 32000) throw new HttpError(413, 'BODY_TOO_LARGE');
        const draft = draftSchema.parse(JSON.parse(raw));
        const order = store.save(session.userId, key, id, request.headers.get('if-match'), draft);
        return json(order, 200, { ETag: `"${order.version}"` });
      }
      throw new HttpError(404, 'NOT_FOUND');
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ code: 'INVALID_INPUT' }, 400);
      if (error instanceof HttpError) return json({ code: error.code }, error.status, error.status === 503 ? { 'Retry-After': '3' } : {});
      return json({ code: 'INTERNAL_ERROR' }, 500);
    }
  };
}
