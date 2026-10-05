import { beforeAll, describe, expect, it } from 'vitest';
import { createApi, tokenHash } from '../src/api.js';
import { IDLE_MS } from '../src/domain.js';
import { hashPassword } from '../src/password.js';
import { HttpError } from '../src/reliability.js';
import { FakeRepository } from './fake-repository.js';

const origin = 'http://localhost:5173';
const password = 'Local-test-only-123!';
const adminId = '11111111-1111-4111-8111-111111111111';
const mechanicId = '22222222-2222-4222-8222-222222222222';
const draft = { customerName: 'Fixture', plate: 'ABC123', mileage: null, notes: '', recommendations: '' };
let passwordHash: string;
beforeAll(async () => { passwordHash = await hashPassword(password); });
function setup(production = false) {
  const repo = new FakeRepository();
  repo.accounts.set(adminId, { id: adminId, username: 'admin', fullName: 'Test user', passwordHash, role: 'ADMIN', active: true });
  repo.accounts.set(mechanicId, { id: mechanicId, username: 'mechanic', fullName: 'Test user', passwordHash, role: 'MECHANIC', active: true });
  const api = createApi({ repository: repo, origin, production });
  const call = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) =>
    api(new Request(origin + '/api' + path, { method, headers: { origin, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  const login = async (username = 'admin', pwd = password) => {
    const response = await call('/auth/login', 'POST', { username, password: pwd });
    const data = await response.json();
    return { response, data, headers: { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', 'x-csrf-token': data.csrf ?? '' } };
  };
  return { repo, call, login };
}
describe('persistent API contracts (transactional test double)', () => {
  it('authenticates with bcrypt, persists only token hash and returns secure cookie', async () => {
    const { repo, login } = setup(true);
    const { response, data, headers } = await login();
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Strict; Path=\/api; Secure/);
    expect(data).toMatchObject({ userId: adminId, role: 'ADMIN', idleMs: IDLE_MS });
    const raw = headers.cookie.slice(11);
    expect(raw).toHaveLength(43);
    expect(repo.sessions.has(raw)).toBe(false);
    expect(repo.sessions.has(tokenHash(raw))).toBe(true);
    expect(JSON.stringify(data)).not.toContain(raw);
    expect(JSON.stringify(data)).not.toContain(passwordHash);
  });
  it.each(['wrong-password', password + 'wrong'])('rejects wrong password %s', async pwd => {
    const { login, repo } = setup();
    expect((await login('admin', pwd)).response.status).toBe(401);
    expect(repo.sessions.size).toBe(0);
  });
  it('rejects inactive and unknown users with the same response', async () => {
    const { repo, login } = setup();
    repo.accounts.get(adminId)!.active = false;
    expect((await login()).data).toEqual({ code: 'INVALID_CREDENTIALS' });
    expect((await login('unknown')).data).toEqual({ code: 'INVALID_CREDENTIALS' });
    expect(repo.sessions.size).toBe(0);
  });
  it('blocks login CSRF through Origin and requires CSRF for authenticated mutations', async () => {
    const { call, login } = setup();
    expect((await call('/auth/login', 'POST', { username: 'admin', password }, { origin: 'https://evil.invalid' })).status).toBe(403);
    const { headers } = await login();
    expect((await call('/auth/activity', 'POST', undefined, { ...headers, 'x-csrf-token': 'wrong' })).status).toBe(403);
    expect((await call('/auth/activity', 'POST', undefined, { ...headers, origin: '' })).status).toBe(403);
  });
  it('GET and autosave never extend idle timeout; expires at exactly two hours', async () => {
    const { repo, call, login } = setup();
    const { headers } = await login();
    const start = repo.clock;
    repo.clock = start + IDLE_MS - 1;
    expect((await call('/auth/me', 'GET', undefined, headers)).status).toBe(200);
    expect((await call('/orders/' + crypto.randomUUID(), 'PUT', draft, { ...headers, 'idempotency-key': crypto.randomUUID() })).status).toBe(200);
    expect([...repo.sessions.values()][0]!.lastActivity).toBe(start);
    repo.clock++;
    expect((await call('/auth/me', 'GET', undefined, headers)).status).toBe(401);
    expect((await call('/auth/activity', 'POST', undefined, headers)).status).toBe(401);
    expect([...repo.sessions.values()][0]!.lastActivity).toBe(start);
  });
  it('activity renews, but an expired/revoked session cannot be revived', async () => {
    const { repo, call, login } = setup();
    const { headers } = await login();
    repo.clock += IDLE_MS - 1;
    const updated = repo.clock;
    expect((await call('/auth/activity', 'POST', undefined, headers)).status).toBe(200);
    repo.clock += IDLE_MS - 1;
    expect((await call('/auth/me', 'GET', undefined, headers)).status).toBe(200);
    expect([...repo.sessions.values()][0]!.lastActivity).toBe(updated);
    repo.clock++;
    expect((await call('/auth/activity', 'POST', undefined, headers)).status).toBe(401);
    expect((await call('/auth/activity', 'POST', undefined, headers)).status).toBe(401);
  });
  it('logout revokes and expires cookie', async () => {
    const { call, login } = setup();
    const { headers } = await login();
    const response = await call('/auth/logout', 'POST', undefined, headers);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await call('/auth/logout', 'POST', undefined, headers)).status).toBe(200);
    expect((await call('/auth/me', 'GET', undefined, headers)).status).toBe(401);
    expect((await call('/auth/activity', 'POST', undefined, headers)).status).toBe(401);
  });
  it('enforces ADMIN before read/create/update and never exposes hashes', async () => {
    const { call, login } = setup();
    const mechanic = await login('mechanic');
    expect((await call('/admin/users', 'GET', undefined, mechanic.headers)).status).toBe(403);
    expect((await call('/admin/users', 'POST', {}, mechanic.headers)).status).toBe(403);
    expect((await call('/admin/users/' + adminId, 'PATCH', { role: 'MECHANIC' }, mechanic.headers)).status).toBe(403);
    const admin = await login();
    const list = await call('/admin/users', 'GET', undefined, admin.headers);
    expect(list.status).toBe(200);
    expect(await list.text()).not.toContain('password');
  });
  it('persists replay before version checks; changed body/If-Match/path conflict; missing/stale ETag rejected', async () => {
    const { repo, call, login } = setup();
    const { headers } = await login();
    const id = crypto.randomUUID(); const key = crypto.randomUUID();
    const save = (k = key, expected?: string, data = draft, target = id) => call('/orders/' + target, 'PUT', data,
      { ...headers, 'idempotency-key': k, ...(expected ? { 'if-match': expected } : {}) });
    const first = await save();
    const etag = first.headers.get('etag')!;
    const response = await first.json();
    const replay = await save();
    expect(await replay.json()).toEqual(response);
    expect(replay.headers.get('etag')).toBe(etag);
    expect(repo.orders.size).toBe(1);
    expect((await save(key, undefined, { ...draft, notes: 'changed' })).status).toBe(409);
    expect((await save(key, etag)).status).toBe(409);
    expect((await save(key, undefined, draft, crypto.randomUUID())).status).toBe(409);
    expect((await save(crypto.randomUUID())).status).toBe(428);
    expect((await save(crypto.randomUUID(), etag)).status).toBe(200);
    expect((await save(crypto.randomUUID(), etag)).status).toBe(412);
    expect((await save()).headers.get('etag')).toBe(etag);
  });
  it('serializes duplicate concurrent requests and scopes keys per user', async () => {
    const { repo, call, login } = setup();
    const admin = await login(); const mechanic = await login('mechanic');
    const id = crypto.randomUUID(); const key = crypto.randomUUID();
    const save = () => call('/orders/' + id, 'PUT', draft, { ...admin.headers, 'idempotency-key': key });
    const responses = await Promise.all([save(), save()]);
    expect(await responses[0]!.json()).toEqual(await responses[1]!.json());
    expect(repo.audits.filter(x => x.action === 'ORDER_CREATED')).toHaveLength(1);
    expect((await call('/orders/' + crypto.randomUUID(), 'PUT', draft, { ...mechanic.headers, 'idempotency-key': key })).status).toBe(200);
    expect(repo.receipts.size).toBe(2);
  });
  it('rolls back order and audit if receipt persistence fails', async () => {
    const { repo, call, login } = setup();
    const { headers } = await login();
    repo.failReceipt = true;
    expect((await call('/orders/' + crypto.randomUUID(), 'PUT', draft, { ...headers, 'idempotency-key': crypto.randomUUID() })).status).toBe(500);
    expect(repo.orders.size).toBe(0);
    expect(repo.receipts.size).toBe(0);
    expect(repo.audits.filter(x => x.action === 'ORDER_CREATED')).toHaveLength(0);
  });
  it('creates users idempotently, normalizes names, and fingerprints password safely', async () => {
    const { repo, call, login } = setup();
    const { headers } = await login();
    const key = crypto.randomUUID();
    const data = { username: 'New.Mechanic', fullName: 'New Mechanic', password, role: 'MECHANIC' };
    const send = (body = data, k = key) => call('/admin/users', 'POST', body, { ...headers, 'idempotency-key': k });
    const first = await send();
    expect(first.status).toBe(201);
    expect((await first.json()).username).toBe('new.mechanic');
    expect((await send()).status).toBe(201);
    expect((await send({ ...data, password: 'Another-test-123!' })).status).toBe(409);
    expect((await send(data, crypto.randomUUID())).status).toBe(409);
    expect(repo.accounts.size).toBe(3);
    const receipt = repo.receipts.get(adminId + ':' + key)!;
    expect(receipt.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(JSON.stringify(receipt)).not.toContain(password);
  });
  it.each([{ active: false }, { role: 'ADMIN' }, { password: 'Changed-test-123!' }])('admin change %j revokes target sessions', async patch => {
    const { call, login } = setup();
    const admin = await login(); const mechanic = await login('mechanic');
    const changed = await call('/admin/users/' + mechanicId, 'PATCH', patch, { ...admin.headers, 'idempotency-key': crypto.randomUUID() });
    expect(changed.status).toBe(200);
    expect((await call('/auth/me', 'GET', undefined, mechanic.headers)).status).toBe(401);
    expect((await call('/auth/activity', 'POST', undefined, mechanic.headers)).status).toBe(401);
  });
  it('protects last active admin', async () => {
    const { call, login } = setup();
    const { headers } = await login();
    const response = await call('/admin/users/' + adminId, 'PATCH', { active: false }, { ...headers, 'idempotency-key': crypto.randomUUID() });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'LAST_ADMIN' });
  });
  it('rejects missing keys, malformed data, unsafe password length and invalid mileage', async () => {
    const { call, login } = setup();
    const { headers } = await login();
    expect((await call('/orders/' + crypto.randomUUID(), 'PUT', draft, headers)).status).toBe(400);
    expect((await call('/orders/' + crypto.randomUUID(), 'PUT', { ...draft, mileage: -1 }, { ...headers, 'idempotency-key': crypto.randomUUID() })).status).toBe(400);
    expect((await call('/admin/users', 'POST', { username: 'newuser', password: 'é'.repeat(37), role: 'ADMIN' }, { ...headers, 'idempotency-key': crypto.randomUUID() })).status).toBe(400);
  });
  it('enforces closing prerequisites, official totals, ETag and admin-only changes to closed orders', async()=>{
    const {call,login}=setup();const mechanic=await login('mechanic');const admin=await login();const id=crypto.randomUUID();
    const save=(body:unknown,headers=mechanic.headers,version?:string)=>call('/orders/'+id,'PUT',body,{...headers,'idempotency-key':crypto.randomUUID(),...(version?{'if-match':'"'+version+'"'}:{})});
    const first=await save(draft);const initial=await first.json();
    const complete={...draft,identification:'123456789',phone:'88888888',make:'Toyota',year:2020,mileage:0,items:[{description:'Frenos',price:100.1},{description:'Ajuste',price:0.2}],action:'close'};
    expect((await save({...complete,items:[]},mechanic.headers,initial.version)).status).toBe(400);
    expect((await save({...complete,mileage:null},mechanic.headers,initial.version)).status).toBe(400);
    expect((await save({...complete,totalAmount:1},mechanic.headers,initial.version)).status).toBe(400);
    const closed=await (await save(complete,mechanic.headers,initial.version)).json();expect(closed.status).toBe('CLOSED');expect(closed.totalAmount).toBe(100.3);
    expect((await save(draft,mechanic.headers,closed.version)).status).toBe(409);
    expect((await save({...complete,action:'reopen'},mechanic.headers,closed.version)).status).toBe(403);
    expect((await save({...complete,action:'reopen'},admin.headers,closed.version)).status).toBe(200);
  });
  it('does not provide a demo login endpoint', async () => {
    const { call } = setup();
    expect((await call('/session/demo', 'POST')).status).toBe(401);
  });
});

it('returns 503 and Retry-After when SQL is unavailable', async () => {
  const api = createApi({ repository: { run: async () => { throw new HttpError(503, 'SQL_UNAVAILABLE'); } } });
  const response = await api(new Request(origin + '/api/health'));
  expect(response.status).toBe(503);
  expect(response.headers.get('retry-after')).toBe('3');
});

it('password reset persists the new hash and rejects the previous password', async () => {
  const { call, login } = setup();
  const { headers } = await login();
  const changed = 'Changed-password-123!';
  expect((await call('/admin/users/' + mechanicId, 'PATCH', { password: changed }, { ...headers, 'idempotency-key': crypto.randomUUID() })).status).toBe(200);
  expect((await login('mechanic')).response.status).toBe(401);
  expect((await login('mechanic', changed)).response.status).toBe(200);
});
