import sql from 'mssql';
import { config } from './config.js';
import { HttpError, retrySql } from './reliability.js';
import { IDLE_MS, type Draft, type Order, type Receipt, type Repository, type Session, type UnitOfWork, type User } from './domain.js';

export function sqlConfig(): sql.config {
  const c = config.sql;
  if (!c.server || !c.database || !['sql', 'default'].includes(c.authMode) ||
      (c.authMode === 'sql' && (!c.user || !c.password))) throw new HttpError(503, 'SQL_NOT_CONFIGURED');
  return {
    server: c.server, database: c.database,
    ...(c.authMode === 'sql' ? { user: c.user, password: c.password } :
      { authentication: { type: 'azure-active-directory-default' as const, options: {} } }),
    connectionTimeout: c.connectTimeoutMs, requestTimeout: c.requestTimeoutMs,
    options: { encrypt: true, trustServerCertificate: false, abortTransactionOnError: true, useUTC: true },
    pool: { max: 1, min: 0, idleTimeoutMillis: 1000 }
  };
}
type Params = Record<string, string | number | boolean | Date | Buffer | null>;
type UserRow = { id: string; username: string; password_hash: string; role: User['role']; active: boolean };
const user = (r: UserRow): User => ({ id: r.id.toLowerCase(), username: r.username, passwordHash: r.password_hash, role: r.role, active: r.active });
type OrderRow = { id: string; status: Order['status']; version: Buffer; mechanic_id: string; customer_id: string | null; vehicle_id: string | null; customer_name_snapshot: string; plate_snapshot: string; mileage: number | null; notes: string; recommendations: string };
function order(r: OrderRow): Order {
  return { id: r.id.toLowerCase(), status: r.status, version: r.version.toString('hex'), mechanicId: r.mechanic_id.toLowerCase(),
    draft: { customerName: r.customer_name_snapshot, plate: r.plate_snapshot, mileage: r.mileage, notes: r.notes, recommendations: r.recommendations,
      ...(r.customer_id ? { customerId: r.customer_id.toLowerCase() } : {}), ...(r.vehicle_id ? { vehicleId: r.vehicle_id.toLowerCase() } : {}) } };
}
export class SqlUnit implements UnitOfWork {
  constructor(private tx: sql.Transaction, private signal: AbortSignal) {}
  async query<T = Record<string, unknown>>(text: string, params: Params = {}): Promise<sql.IResult<T>> {
    this.signal.throwIfAborted();
    const request = new sql.Request(this.tx);
    for (const [name, value] of Object.entries(params)) {
      if (value instanceof Date) request.input(name, sql.DateTime2(3), value);
      else request.input(name, value);
    }
    const cancel = () => request.cancel();
    this.signal.addEventListener('abort', cancel, { once: true });
    try {
      this.signal.throwIfAborted();
      return await request.query<T>(text);
    } finally { this.signal.removeEventListener('abort', cancel); }
  }
  async time() {
    const r = await this.query<{ now: Date }>('SELECT CAST(SYSUTCDATETIME() AS datetime2(3)) AS now');
    return r.recordset[0]!.now.getTime();
  }
  async userByName(username: string) {
    const r = await this.query<UserRow>('SELECT * FROM dbo.Users WITH (UPDLOCK,HOLDLOCK) WHERE username=@username', { username });
    return r.recordset[0] ? user(r.recordset[0]) : undefined;
  }
  async userById(id: string) {
    const r = await this.query<UserRow>('SELECT * FROM dbo.Users WITH (UPDLOCK,HOLDLOCK) WHERE id=@id', { id });
    return r.recordset[0] ? user(r.recordset[0]) : undefined;
  }
  async users() {
    return (await this.query<UserRow>('SELECT * FROM dbo.Users WITH (UPDLOCK,HOLDLOCK) ORDER BY username')).recordset.map(user);
  }
  async insertUser(u: User) {
    await this.query('INSERT dbo.Users(id,username,password_hash,role,active) VALUES(@id,@username,@hash,@role,@active)',
      { id: u.id, username: u.username, hash: u.passwordHash, role: u.role, active: u.active });
  }
  async updateUser(u: User) {
    await this.query('UPDATE dbo.Users SET password_hash=@hash,role=@role,active=@active WHERE id=@id',
      { id: u.id, hash: u.passwordHash, role: u.role, active: u.active });
  }
  async session(hash: string) {
    const r = await this.query<{ token_hash: string; user_id: string; csrf: string; last_activity_at: Date; revoked_at: Date | null }>(
      'SELECT * FROM dbo.Sessions WITH (UPDLOCK,HOLDLOCK) WHERE token_hash=@hash', { hash });
    const s = r.recordset[0];
    return s ? { tokenHash: s.token_hash, userId: s.user_id.toLowerCase(), csrf: s.csrf, lastActivity: s.last_activity_at.getTime(), revoked: s.revoked_at !== null } : undefined;
  }
  async insertSession(s: Session) {
    // A retry after an ambiguous COMMIT must not resurrect a revoked/expired session.
    if (await this.session(s.tokenHash)) return;
    await this.query('INSERT dbo.Sessions(token_hash,user_id,csrf,last_activity_at) VALUES(@hash,@userId,@csrf,@time)',
      { hash: s.tokenHash, userId: s.userId, csrf: s.csrf, time: new Date(s.lastActivity) });
  }
  async touchSession(hash: string, now: number) {
    const r = await this.query(
      'UPDATE dbo.Sessions SET last_activity_at=@now WHERE token_hash=@hash AND revoked_at IS NULL AND last_activity_at>DATEADD(millisecond,-@idle,@now)',
      { hash, now: new Date(now), idle: IDLE_MS });
    if (r.rowsAffected[0] !== 1) throw new HttpError(401, 'SESSION_EXPIRED');
  }
  async revokeSession(hash: string) {
    await this.query('UPDATE dbo.Sessions SET revoked_at=COALESCE(revoked_at,SYSUTCDATETIME()) WHERE token_hash=@hash', { hash });
  }
  async revokeUserSessions(id: string) {
    await this.query('UPDATE dbo.Sessions SET revoked_at=COALESCE(revoked_at,SYSUTCDATETIME()) WHERE user_id=@id', { id });
  }
  async order(id: string) {
    const r = await this.query<OrderRow>('SELECT * FROM dbo.Orders WITH (UPDLOCK,HOLDLOCK) WHERE id=@id', { id });
    return r.recordset[0] ? order(r.recordset[0]) : undefined;
  }
  async saveOrder(id: string, userId: string, draft: Draft, previous?: Order) {
    let customerId = previous?.draft.customerId ?? draft.customerId ?? null;
    const vehicleId = previous?.draft.vehicleId ?? draft.vehicleId ?? null;
    if (previous?.draft.customerId && draft.customerId && previous.draft.customerId !== draft.customerId)
      throw new HttpError(409, 'HISTORICAL_CUSTOMER_IMMUTABLE');
    if (previous?.draft.vehicleId && draft.vehicleId && previous.draft.vehicleId !== draft.vehicleId)
      throw new HttpError(409, 'ORDER_VEHICLE_IMMUTABLE');
    if (vehicleId) {
      const vehicle = (await this.query<{ owner_id: string | null }>('SELECT owner_id FROM dbo.Vehicles WITH (HOLDLOCK) WHERE id=@id', { id: vehicleId })).recordset[0];
      if (!vehicle) throw new HttpError(400, 'INVALID_VEHICLE');
      customerId ??= vehicle.owner_id?.toLowerCase() ?? null;
    }
    if (customerId && !(await this.query('SELECT id FROM dbo.Customers WHERE id=@id', { id: customerId })).recordset.length)
      throw new HttpError(400, 'INVALID_CUSTOMER');
    const params: Params = { id, userId, customerId, vehicleId, name: draft.customerName, plate: draft.plate.toUpperCase().replace(/[\s-]/g, ''),
      mileage: draft.mileage, notes: draft.notes, recommendations: draft.recommendations };
    if (previous) {
      const r = await this.query(
        'UPDATE dbo.Orders SET customer_id=@customerId,vehicle_id=@vehicleId,customer_name_snapshot=@name,plate_snapshot=@plate,mileage=@mileage,notes=@notes,recommendations=@recommendations,updated_at=SYSUTCDATETIME() WHERE id=@id AND version=@version',
        { ...params, version: Buffer.from(previous.version, 'hex') });
      if (r.rowsAffected[0] !== 1) throw new HttpError(412, 'VERSION_CONFLICT');
    } else {
      await this.query('INSERT dbo.Orders(id,customer_id,vehicle_id,mechanic_id,customer_name_snapshot,plate_snapshot,mileage,notes,recommendations) VALUES(@id,@customerId,@vehicleId,@userId,@name,@plate,@mileage,@notes,@recommendations)', params);
    }
    return (await this.order(id))!;
  }
  async receipt(userId: string, key: string) {
    const r = await this.query<{ fingerprint: string; request_password_hash: string | null; response_status: number; response_body: string; response_headers: string }>(
      'SELECT * FROM dbo.IdempotencyRequests WITH (UPDLOCK,HOLDLOCK) WHERE user_id=@userId AND idempotency_key=@key', { userId, key });
    const row = r.recordset[0];
    return row ? { fingerprint: row.fingerprint, ...(row.request_password_hash ? { passwordHash: row.request_password_hash } : {}), reply: { status: row.response_status, body: JSON.parse(row.response_body), headers: JSON.parse(row.response_headers) } } : undefined;
  }
  async insertReceipt(userId: string, key: string, receipt: Receipt) {
    await this.query('INSERT dbo.IdempotencyRequests(user_id,idempotency_key,fingerprint,request_password_hash,response_status,response_body,response_headers) VALUES(@userId,@key,@fingerprint,@passwordHash,@status,@body,@headers)',
      { userId, key, fingerprint: receipt.fingerprint, passwordHash: receipt.passwordHash ?? null, status: receipt.reply.status, body: JSON.stringify(receipt.reply.body), headers: JSON.stringify(receipt.reply.headers) });
  }
  async audit(actorId: string | null, action: string, entityId: string | null) {
    await this.query('INSERT dbo.AuditLogs(actor_id,action,entity_id) VALUES(@actorId,@action,@entityId)', { actorId, action, entityId });
  }
}
export class SqlRepository implements Repository {
  async run<T>(work: (tx: UnitOfWork) => Promise<T>, signal?: AbortSignal): Promise<T> {
    return this.runSql(work, signal);
  }
  async runSql<T>(work: (tx: SqlUnit) => Promise<T>, signal?: AbortSignal, rollbackOnly = false): Promise<T> {
    return retrySql(async attemptSignal => {
      const pool = new sql.ConnectionPool(sqlConfig());
      // Never print driver errors: connection metadata can contain credentials.
      pool.on('error', () => undefined);
      let transaction: sql.Transaction | undefined;
      let finished = false;
      try {
        await pool.connect(); // bounded by connectionTimeout even during cancellation
        attemptSignal.throwIfAborted();
        transaction = new sql.Transaction(pool);
        transaction.on('rollback', () => { finished = true; });
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const result = await work(new SqlUnit(transaction, attemptSignal));
        attemptSignal.throwIfAborted();
        if (rollbackOnly) await transaction.rollback();
        else await transaction.commit();
        finished = true;
        return result;
      } catch (error) {
        if (transaction && !finished) await transaction.rollback().catch(() => undefined);
        throw error;
      } finally { await pool.close().catch(() => undefined); }
    }, config.sql.retryBudgetMs, signal);
  }
}
