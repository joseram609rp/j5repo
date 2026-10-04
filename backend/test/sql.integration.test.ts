import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApi, tokenHash } from '../src/api.js';
import { hashPassword } from '../src/password.js';
import { SqlRepository } from '../src/sql.js';
import type { Repository } from '../src/domain.js';

const enabled = process.env.J5_SQL_INTEGRATION === '1';
const sql = new SqlRepository();
const origin = 'http://localhost:5173';
it.skipIf(!enabled)('executes auth, receipts, rowversion and historical customer against SQL, then rolls back all fixtures', async () => {
  const adminId = randomUUID(); const mechanicId = randomUUID();
  const customerId = randomUUID(); const nextOwnerId = randomUUID(); const vehicleId = randomUUID(); const orderId = randomUUID();
  const username = 'sql-test-' + randomUUID().slice(0, 8);
  const password = 'Fixture-' + randomUUID();
  const passwordHash = await hashPassword(password);
  await sql.runSql(async tx => {
    await tx.insertUser({ id: adminId, username, passwordHash, role: 'ADMIN', active: true });
    await tx.insertUser({ id: mechanicId, username: username + '-m', passwordHash, role: 'MECHANIC', active: true });
    await tx.query("INSERT dbo.Customers(id,name) VALUES(@a,N'Integration fixture'),(@b,N'Next owner fixture')", { a: customerId, b: nextOwnerId });
    await tx.query('INSERT dbo.Vehicles(id,owner_id,plate) VALUES(@id,@owner,@plate)', { id: vehicleId, owner: customerId, plate: 'T' + randomUUID().replaceAll('-', '').slice(0, 12) });
    // All API calls share this rollback-only transaction. No fixture can commit.
    const scoped: Repository = { run: work => work(tx) };
    const api = createApi({ repository: scoped, origin });
    const call = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) =>
      api(new Request(origin + '/api' + path, { method, headers: { origin, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
    const login = async (name: string, pwd = password) => {
      const response = await call('/auth/login', 'POST', { username: name, password: pwd });
      const data = await response.json();
      return { response, data, headers: { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', 'x-csrf-token': data.csrf ?? '' } };
    };
    expect((await login(username, 'incorrect')).response.status).toBe(401);
    const admin = await login(username);
    expect(admin.response.status).toBe(200);
    const mechanic = await login(username + '-m');
    expect(mechanic.response.status).toBe(200);
    const rawToken = mechanic.headers.cookie.slice(11);
    const savedSession = await tx.session(tokenHash(rawToken));
    expect(savedSession?.userId).toBe(mechanicId);
    expect((await call('/admin/users', 'GET', undefined, mechanic.headers)).status).toBe(403);
    expect((await call('/auth/activity', 'POST', undefined, { ...mechanic.headers, 'x-csrf-token': 'wrong' })).status).toBe(403);
    const draft = { customerName: 'Integration fixture', plate: 't-est', mileage: null, notes: '', recommendations: '', vehicleId };
    const key = randomUUID();
    const save = (k = key, etag?: string, body = draft) => call('/orders/' + orderId, 'PUT', body,
      { ...mechanic.headers, 'idempotency-key': k, ...(etag ? { 'if-match': etag } : {}) });
    const first = await save();
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag')!;
    const data = await first.json();
    expect(data.version).toMatch(/^[0-9a-f]{16}$/);
    expect(data.draft.customerId).toBe(customerId);
    expect(await (await save()).json()).toEqual(data);
    expect((await save(key, undefined, { ...draft, notes: 'changed' })).status).toBe(409);
    expect((await save(randomUUID())).status).toBe(428);
    await tx.query('UPDATE dbo.Vehicles SET owner_id=@owner WHERE id=@id', { owner: nextOwnerId, id: vehicleId });
    const update = await save(randomUUID(), etag);
    expect(update.status).toBe(200);
    expect((await update.json()).draft.customerId).toBe(customerId);
    expect((await save(randomUUID(), etag)).status).toBe(412);
    expect((await tx.session(tokenHash(rawToken)))!.lastActivity).toBe(savedSession!.lastActivity);
    expect((await call('/auth/activity', 'POST', undefined, mechanic.headers)).status).toBe(200);
    await tx.query('UPDATE dbo.Sessions SET last_activity_at=DATEADD(hour,-2,SYSUTCDATETIME()) WHERE token_hash=@hash', { hash: tokenHash(rawToken) });
    expect((await call('/auth/activity', 'POST', undefined, mechanic.headers)).status).toBe(401);
    expect((await call('/auth/me', 'GET', undefined, mechanic.headers)).status).toBe(401);
    const fresh = await login(username + '-m');
    expect((await call('/auth/logout', 'POST', undefined, fresh.headers)).status).toBe(200);
    expect((await call('/auth/me', 'GET', undefined, fresh.headers)).status).toBe(401);
    const beforeDisable = await login(username + '-m');
    const disabled = await call('/admin/users/' + mechanicId, 'PATCH', { active: false }, { ...admin.headers, 'idempotency-key': randomUUID() });
    expect(disabled.status).toBe(200);
    expect((await call('/auth/me', 'GET', undefined, beforeDisable.headers)).status).toBe(401);
    expect((await login(username + '-m')).response.status).toBe(401);
  }, undefined, true);
  expect(await sql.run(tx => tx.userById(adminId))).toBeUndefined();
  expect(await sql.run(tx => tx.order(orderId))).toBeUndefined();
}, 60000);

it.skipIf(!enabled)('database rejects closing an order without mileage; rolls back fixture transaction', async () => {
  const id = randomUUID(); const customerId = randomUUID(); const vehicleId = randomUUID();
  const passwordHash = await hashPassword('Fixture-' + randomUUID());
  await expect(sql.runSql(async tx => {
    await tx.insertUser({ id, username: 'constraint-' + randomUUID().slice(0, 8), passwordHash, role: 'MECHANIC', active: true });
    await tx.query("INSERT dbo.Customers(id,name) VALUES(@id,N'Fixture')", { id: customerId });
    await tx.query('INSERT dbo.Vehicles(id,owner_id,plate) VALUES(@id,@owner,@plate)', { id: vehicleId, owner: customerId, plate: 'T' + randomUUID().slice(0, 12) });
    const order = await tx.saveOrder(randomUUID(), id, { customerId, vehicleId, customerName: 'Fixture', plate: 'TEST', mileage: null, notes: '', recommendations: '' });
    await tx.query("UPDATE dbo.Orders SET status='CLOSED' WHERE id=@id", { id: order.id });
  }, undefined, true)).rejects.toMatchObject({ number: 547 });
  expect(await sql.run(tx => tx.userById(id))).toBeUndefined();
}, 60000);
