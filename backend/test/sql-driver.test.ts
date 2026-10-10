import { afterEach, expect, it, vi } from 'vitest';
const driver = vi.hoisted(() => {
  const input = vi.fn(); const cancel = vi.fn();
  const query = vi.fn(async () => ({ recordset: [], rowsAffected: [1] }));
  const connect = vi.fn(async () => undefined); const close = vi.fn(async () => undefined);
  const begin = vi.fn(async () => undefined); const commit = vi.fn(async () => undefined); const rollback = vi.fn(async () => undefined);
  const pools: unknown[] = [];
  class Pool { constructor(config: unknown) { pools.push(config); } on() {} connect = connect; close = close; }
  class Transaction { on() {} begin = begin; commit = commit; rollback = rollback; }
  class Request { input = input; cancel = cancel; query = query; }
  return { input, cancel, query, connect, close, begin, commit, rollback, pools, Pool, Transaction, Request };
});
vi.mock('mssql', () => ({ default: { ConnectionPool: driver.Pool, Transaction: driver.Transaction, Request: driver.Request, DateTime2: (scale: number) => ({ type: 'datetime2', scale }), ISOLATION_LEVEL: { SERIALIZABLE: 4 } } }));
import { SqlRepository, SqlUnit, sqlConfig } from '../src/sql.js';
import { config } from '../src/config.js';
const originalConfig = { ...config.sql };
afterEach(() => { Object.assign(config.sql, originalConfig); vi.clearAllMocks(); driver.pools.length = 0; });
function configured() { Object.assign(config.sql, { server: 'test.invalid', database: 'fixture', authMode: 'sql', user: 'fixture', password: 'not-a-real-secret' }); }
it('requires explicit credentials and sets verified TLS and bounded timeouts', () => {
  Object.assign(config.sql, { server: undefined });
  expect(sqlConfig).toThrow('SQL_NOT_CONFIGURED');
  configured();
  expect(sqlConfig()).toMatchObject({ options: { encrypt: true, trustServerCertificate: false }, connectionTimeout: 5000, requestTimeout: 5000 });
  config.sql.authMode = 'default';
  expect(sqlConfig()).toMatchObject({ authentication: { type: 'azure-active-directory-default' } });
  expect(sqlConfig().password).toBeUndefined();
});
it('parameterizes attacker-controlled strings without placing them in SQL', async () => {
  const unit = new SqlUnit({} as never, new AbortController().signal);
  await unit.userByName("x'; DROP TABLE dbo.Users;--");
  expect(driver.input).toHaveBeenCalledWith('username', "x'; DROP TABLE dbo.Users;--");
  expect(driver.query.mock.calls[0]?.[0]).not.toContain('DROP');
});
it('cancels an in-flight driver request and removes its abort listener', async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  let finish!: () => void;
  driver.query.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ recordset: [], rowsAffected: [] }); }));
  const unit = new SqlUnit({} as never, controller.signal);
  const pending = unit.query('SELECT 1');
  controller.abort();
  expect(driver.cancel).toHaveBeenCalledTimes(1);
  finish(); await pending;
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});
it('commits the whole callback with SERIALIZABLE and always closes its pool', async () => {
  configured();
  expect(await new SqlRepository().run(async () => 42)).toBe(42);
  expect(driver.begin).toHaveBeenCalledWith(4);
  expect(driver.commit).toHaveBeenCalledTimes(1);
  expect(driver.close).toHaveBeenCalledTimes(1);
});
it('rolls back on mutation failure instead of committing partial work', async () => {
  configured();
  await expect(new SqlRepository().run(async () => { throw new Error('receipt failed'); })).rejects.toThrow('receipt failed');
  expect(driver.rollback).toHaveBeenCalledTimes(1);
  expect(driver.commit).not.toHaveBeenCalled();
  expect(driver.close).toHaveBeenCalledTimes(1);
});
it('provides a rollback-only SQL integration harness', async () => {
  configured();
  await new SqlRepository().runSql(async () => undefined, undefined, true);
  expect(driver.rollback).toHaveBeenCalledTimes(1);
  expect(driver.commit).not.toHaveBeenCalled();
});

it('binds activity timestamps as datetime2(3) without legacy datetime rounding', async () => {
  const unit = new SqlUnit({} as never, new AbortController().signal);
  const time = new Date('2026-01-01T00:00:00.005Z');
  await unit.query('SELECT @time', { time });
  expect(driver.input).toHaveBeenCalledWith('time', { type: 'datetime2', scale: 3 }, time);
});
