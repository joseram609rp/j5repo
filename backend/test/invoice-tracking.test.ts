import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApi, tokenHash } from '../src/api.js';
import type { Order } from '../src/domain.js';
import type { InvoicePage } from '../src/invoice-types.js';
import { FakeRepository } from './fake-repository.js';

const origin = 'http://localhost:5173';
const endpoint = '/admin/invoice-tracking';

function setup() {
  const repo = new FakeRepository();
  const cookies = Object.fromEntries((['ADMIN', 'MECHANIC'] as const).map(role => {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const hash = tokenHash(token);
    repo.accounts.set(id, { id, username: role.toLowerCase(), fullName: role, role, active: true, passwordHash: 'unused' });
    repo.sessions.set(hash, { tokenHash: hash, userId: id, csrf: 'fixture', lastActivity: repo.clock, revoked: false });
    return [role, 'j5_session=' + token];
  }));
  const api = createApi({ repository: repo, origin });
  function get(path = '', role = 'ADMIN') {
    return api(new Request(origin + '/api' + endpoint + path, { headers: { cookie: cookies[role] ?? '' } }));
  }
  function put(order: Order, issued: boolean, options: { key?: string; version?: string; role?: string; csrf?: string } = {}) {
    return api(new Request(origin + '/api' + endpoint + '/orders/' + order.id, {
      method: 'PUT',
      headers: { origin, cookie: cookies[options.role ?? 'ADMIN']!, 'content-type': 'application/json',
        'x-csrf-token': options.csrf ?? 'fixture', 'idempotency-key': options.key ?? randomUUID(),
        'if-match': '"' + (options.version ?? 'none') + '"' },
      body: JSON.stringify({ issued, orderVersion: order.version }),
    }));
  }
  function fixture(index: number, overrides: Partial<Order> = {}) {
    const order: Order = {
      id: randomUUID(), status: 'CLOSED', mechanicId: randomUUID(), version: '0000000000000001',
      orderDate: index === 0 ? '2025-12-31' : '2026-01-01', displayOrderId: 'OT-QA-' + index,
      draft: { customerName: 'test', identification: '333333333', phone: '33333333', plate: 'JJJ111',
        make: 'Toyota', model: 'Land Cruiser Prado', year: 2023, electronicInvoice: true, mileage: 0 },
      ...overrides,
    };
    repo.orders.set(order.id, order);
    return order;
  }
  async function page(query = ''): Promise<InvoicePage> { return (await get(query)).json(); }
  return { repo, fixture, get, put, page };
}

it('authorizes every invoice endpoint and rejects CSRF', async () => {
  const { fixture, get, put, repo } = setup();
  const order = fixture(0);
  for (const path of ['', '/count', '/orders/' + order.id]) {
    expect((await get(path, 'anonymous')).status).toBe(401);
    expect((await get(path, 'MECHANIC')).status).toBe(403);
  }
  expect((await put(order, true, { role: 'MECHANIC' })).status).toBe(403);
  expect((await put(order, true, { csrf: 'wrong' })).status).toBe(403);
  expect(repo.invoices.size).toBe(0);
  expect(await (await get('/orders/' + order.id)).json()).toEqual(order);
});

it('uses inclusive business dates, AND filters and a stable cursor; issued requires a filter', async () => {
  const { fixture, get, page, repo } = setup();
  const first = fixture(0, { isBackfilled: true });
  for (let i = 1; i <= 27; i++) fixture(i);
  fixture(28, { status: 'OPEN' });
  const excluded = fixture(29);
  excluded.draft.electronicInvoice = false;
  const query = vi.spyOn(repo, 'invoiceOrders');
  expect((await get('?state=issued&plate=%20-')).status).toBe(400);
  expect(query).not.toHaveBeenCalled();
  expect((await get('?from=2026-01-01&to=2025-01-01')).status).toBe(400);
  expect((await get('?afterDate=2026-01-01')).status).toBe(400);
  const a = await page();
  expect(a.entries[0]?.id).toBe(first.id);
  expect(a.entries).toHaveLength(25);
  const b = await page('?afterDate=' + a.next?.date + '&afterId=' + a.next?.id);
  expect(b.entries).toHaveLength(3);
  expect(new Set([...a.entries, ...b.entries].map(entry => entry.id)).size).toBe(28);
  expect(b.next).toBeNull();
  expect(await (await get('/count')).json()).toEqual({ count: 28 });
  expect((await page('?plate=jjj-111&identification=333333333&from=2025-12-31&to=2025-12-31&orderNumber=ot-qa-0')).entries)
    .toMatchObject([{ id: first.id, version: null }]);
  expect((await page('?plate=JJJ111&identification=333333334')).entries).toEqual([]);
  expect((await get('/orders/' + excluded.id)).status).toBe(404);
});

it('compares both versions, replays requests and preserves issued state when reopened', async () => {
  const { repo, fixture, get, put, page } = setup();
  const order = fixture(0);
  const key = randomUUID();
  const [winner, stale] = await Promise.all([put(order, true, { key }), put(order, true)]);
  expect([winner.status, stale.status]).toEqual([200, 412]);
  expect((await put(order, true, { key })).status).toBe(200);
  expect((await put(order, false, { key })).status).toBe(409);
  const issued = await page('?state=issued&plate=JJJ111');
  expect(issued.entries).toMatchObject([{ id: order.id }]);
  const version = issued.entries[0]!.version!;
  expect((await put({ ...order, version: '0000000000000002' }, false, { version })).status).toBe(412);
  const reopened = await repo.saveOrder(order.id, order.mechanicId, { ...order.draft, action: 'reopen' }, order);
  expect((await put(reopened, false, { version })).status).toBe(404);
  expect((await get('/orders/' + order.id)).status).toBe(404);
  expect((await page('?state=issued&plate=JJJ111')).entries).toEqual([]);
  expect(repo.invoices.get(order.id)?.issued).toBe(true);
  const reclosed = await repo.saveOrder(order.id, order.mechanicId, { ...order.draft, action: 'close' }, reopened);
  repo.failReceipt = true;
  expect((await put(reclosed, false, { version })).status).toBe(500);
  expect(repo.invoices.get(order.id)?.issued).toBe(true);
  repo.failReceipt = false;
  expect((await put(reclosed, false, { version })).status).toBe(200);
  expect((await page()).entries).toMatchObject([{ id: order.id }]);
  expect(repo.orders.get(order.id)).toEqual(reclosed);
  expect(repo.audits).toEqual([]);
});
