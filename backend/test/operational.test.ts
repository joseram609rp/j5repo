import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApi, tokenHash } from '../src/api.js';
import { operationalFilters } from '../src/operational-filters.js';
import { readOperationalOrders, readOperationalReport } from '../src/operational-sql.js';
import type { SqlUnit } from '../src/sql.js';
import { FakeRepository } from './fake-repository.js';
import { mechanic, metrics, sampleOrder, sampleReport } from './operational-fixture.js';

const origin = 'http://localhost:5173';
const range = '?from=2026-11-09&to=2026-11-13';
const now = Date.parse('2026-11-14T04:59:00Z');

it('uses Costa Rica dates and validates inclusive ranges, mechanic and backfill flag', () => {
  expect(operationalFilters(new URLSearchParams(range), now)).toEqual({
    from: '2026-11-09', to: '2026-11-13', includeBackfilled: false,
  });
  for (const query of [
    'from=2026-11-13&to=2026-11-14', 'from=2026-02-30&to=2026-11-13',
    'from=2025-11-12&to=2026-11-13', 'from=2026-11-13&to=2026-11-12',
    range + '&mechanic=invalid', range + '&includeBackfilled=1',
  ]) expect(() => operationalFilters(new URLSearchParams(query), now)).toThrow();
  expect(operationalFilters(new URLSearchParams('from=2025-11-13&to=2026-11-13'), now).from).toBe('2025-11-13');
});

it('enforces ADMIN on every route, validates filters before SQL and only accepts GET', async () => {
  const repo = new FakeRepository();
  repo.clock = now;
  function headers(role: 'ADMIN' | 'MECHANIC') {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const hash = tokenHash(token);
    repo.accounts.set(id, { id, username: role.toLowerCase(), fullName: role, role, active: true, passwordHash: 'unused' });
    repo.sessions.set(hash, { tokenHash: hash, userId: id, csrf: 'qa', lastActivity: now, revoked: false });
    return { cookie: 'j5_session=' + token, origin, 'x-csrf-token': 'qa' };
  }
  const admin = headers('ADMIN');
  const staff = headers('MECHANIC');
  const report = vi.spyOn(repo, 'operationalReport').mockResolvedValue(sampleReport());
  const list = vi.spyOn(repo, 'operationalOrders').mockResolvedValue({ rows: [sampleOrder], more: false });
  const detail = vi.spyOn(repo, 'order');
  const api = createApi({ repository: repo, origin });
  const call = (path: string, headers?: HeadersInit, method = 'GET') =>
    api(new Request(origin + '/api/admin/operational' + path, { headers, method }));

  for (const path of [range, '/orders' + range, '/orders/' + sampleOrder.id]) {
    expect((await call(path)).status).toBe(401);
    expect((await call(path, staff)).status).toBe(403);
  }
  expect((await call(range, admin, 'POST')).status).toBe(405);
  expect((await call('', admin)).status).toBe(400);
  expect((await call('/orders' + range + '&page=200', admin)).status).toBe(400);
  expect(report).not.toHaveBeenCalled();
  expect(list).not.toHaveBeenCalled();
  expect(detail).not.toHaveBeenCalled();
  expect(await (await call(range, admin)).json()).toEqual(sampleReport());
  expect((await call('/orders' + range + '&mechanic=' + mechanic.id + '&includeBackfilled=true&status=OPEN&page=2', admin)).status).toBe(200);
  expect(list).toHaveBeenCalledWith({ from: '2026-11-09', to: '2026-11-13', mechanic: mechanic.id, includeBackfilled: true }, 'OPEN', 2);
  expect((await call('/orders/' + sampleOrder.id, admin)).status).toBe(404);
  expect(detail).toHaveBeenCalledWith(sampleOrder.id, true);
  expect(repo.receipts.size).toBe(0);
  expect(repo.audits).toEqual([]);
});

it('maps SQL aggregates and binds filters and pagination without interpolating values', async () => {
  const sample = sampleReport();
  const aggregate = { ...metrics, mechanic: null, date: null, method: null };
  const query = vi.fn().mockResolvedValueOnce({ recordsets: [
    [aggregate, { ...aggregate, mechanic: mechanic.id }, { ...aggregate, date: sampleOrder.workDate }, { ...aggregate, method: 'SINPE' }],
    [mechanic], [{ ...sample.closureDays[0], week: null, mechanic: null }], sample.comparison,
    [{ comparisonWeek: sample.comparisonWeek, comparisonThrough: sample.comparisonThrough }],
  ] }).mockResolvedValueOnce({ recordset: Array.from({ length: 26 }, () => sampleOrder) });
  const tx = { query } as unknown as SqlUnit;
  const filters = operationalFilters(new URLSearchParams(range + '&mechanic=' + mechanic.id), now);
  expect((await readOperationalReport(tx, filters, now)).totals).toEqual(metrics);
  expect(query.mock.calls[0]?.[0]).toContain('ROUND(i.price*o.tax_rate/100,2)');
  expect(query.mock.calls[0]?.[0]).toContain('o.is_backfilled=0 AND o.closed_at>=@closeFrom');
  expect(query.mock.calls[0]?.[0]).not.toContain(mechanic.id);
  expect(query.mock.calls[0]?.[1]).toEqual({ ...filters, today: '2026-11-13' });
  expect(await readOperationalOrders(tx, filters, 'CLOSED', 1)).toEqual({ rows: Array.from({ length: 25 }, () => sampleOrder), more: true });
  expect(query.mock.calls[1]?.[1]).toMatchObject({ status: 'CLOSED', offset: 25, limit: 26 });
});
