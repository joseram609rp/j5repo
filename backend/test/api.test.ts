import { describe, it, expect } from 'vitest';
import { createApi } from '../src/api.js';
const draft = { customerName: 'Prueba', plate: 'ABC123', mileage: 100, notes: '', recommendations: '' };
const origin = 'http://localhost:5173';
async function setup() {
  let time = 0;
  const api = createApi({ demo: true, now: () => time, idleMs: 1000 });
  const login = await api(new Request(`${origin}/api/session/demo`, { method: 'POST', headers: { origin } }));
  const body = await login.json();
  const headers = { origin, cookie: login.headers.get('set-cookie')!.split(';')[0]!, 'x-csrf-token': body.csrf, 'content-type': 'application/json' };
  return { api, headers, time: (value: number) => { time = value; } };
}
describe('API boundaries', () => {
  it('fails closed outside local demo', async () => {
    const result = await createApi({ demo: false })(new Request(`${origin}/api/session/demo`, { method: 'POST' }));
    expect(result.status).toBe(503);
  });
  it('replays committed writes, rejects changed payloads and stale versions', async () => {
    const { api, headers } = await setup();
    const id = crypto.randomUUID(); const key = crypto.randomUUID();
    const save = (key: string, version?: string, data = draft) => api(new Request(`${origin}/api/orders/${id}`, { method: 'PUT', headers: { ...headers, 'idempotency-key': key, ...(version ? { 'if-match': version } : {}) }, body: JSON.stringify(data) }));
    const first = await save(key); expect(first.status).toBe(200);
    const replay = await save(key); expect(await replay.json()).toEqual(await first.json());
    expect((await save(key, undefined, { ...draft, notes: 'different' })).status).toBe(409);
    expect((await save(crypto.randomUUID(), '"1"')).status).toBe(200);
    expect((await save(crypto.randomUUID(), '"1"')).status).toBe(412);
    expect((await save(crypto.randomUUID())).status).toBe(428);
    expect((await save(key)).headers.get('etag')).toBe('"1"');
  });
  it('does not extend sessions on background reads and expires at boundary', async () => {
    const { api, headers, time } = await setup();
    time(999); expect((await api(new Request(`${origin}/api/session`, { headers }))).status).toBe(200);
    time(1000); expect((await api(new Request(`${origin}/api/session`, { headers }))).status).toBe(401);
  });
  it('extends on activity, blocks CSRF and revokes logout', async () => {
    const { api, headers, time } = await setup();
    time(500);
    expect((await api(new Request(`${origin}/api/session/activity`, { method: 'POST', headers }))).status).toBe(200);
    time(1200); expect((await api(new Request(`${origin}/api/session`, { headers }))).status).toBe(200);
    expect((await api(new Request(`${origin}/api/session/activity`, { method: 'POST', headers: { ...headers, 'x-csrf-token': 'wrong' } }))).status).toBe(403);
    expect((await api(new Request(`${origin}/api/session`, { method: 'DELETE', headers }))).status).toBe(200);
    expect((await api(new Request(`${origin}/api/session`, { headers }))).status).toBe(401);
  });
  it('rejects invalid mileage and missing idempotency key', async () => {
    const { api, headers } = await setup();
    const write = (body: unknown, key = crypto.randomUUID()) => api(new Request(`${origin}/api/orders/${crypto.randomUUID()}`, { method: 'PUT', headers: { ...headers, 'idempotency-key': key }, body: JSON.stringify(body) }));
    expect((await write({ ...draft, mileage: -1 })).status).toBe(400);
    expect((await write(draft, '')).status).toBe(400);
  });
});
