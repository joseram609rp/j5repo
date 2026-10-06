import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import { customerSchema, vehicleSchema } from './validation.js';
import { config } from './config.js';
import { HttpError, retrySql } from './reliability.js';
import {
  IDLE_MS,
  type Customer,
  type Vehicle,
  type Draft,
  type Order,
  type Receipt,
  type Repository,
  type Session,
  type UnitOfWork,
  type User,
} from './domain.js';

export function sqlConfig(): sql.config {
  const c = config.sql;
  if (
    !c.server ||
    !c.database ||
    !['sql', 'default'].includes(c.authMode) ||
    (c.authMode === 'sql' && (!c.user || !c.password))
  )
    throw new HttpError(503, 'SQL_NOT_CONFIGURED');
  return {
    server: c.server,
    database: c.database,
    ...(c.authMode === 'sql'
      ? { user: c.user, password: c.password }
      : {
          authentication: {
            type: 'azure-active-directory-default' as const,
            options: {},
          },
        }),
    connectionTimeout: c.connectTimeoutMs,
    requestTimeout: c.requestTimeoutMs,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      abortTransactionOnError: true,
      useUTC: true,
    },
    pool: { max: 1, min: 0, idleTimeoutMillis: 1000 },
  };
}
type Params = Record<string, string | number | boolean | Date | Buffer | null>;
type UserRow = {
  id: string;
  username: string;
  full_name: string;
  password_hash: string;
  role: User['role'];
  active: boolean;
};
const user = (r: UserRow): User => ({
  id: r.id.toLowerCase(),
  username: r.username,
  fullName: r.full_name,
  passwordHash: r.password_hash,
  role: r.role,
  active: r.active,
});
type OrderRow = {
  id: string;
  status: Order['status'];
  version: Buffer;
  mechanic_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  customer_name_snapshot: string;
  plate_snapshot: string;
  mileage: number | null;
  notes: string;
  recommendations: string;
  display_order_id: string;
  total_amount: number;
  closed_at: Date | null;
  draft_data: string;
  created_at: Date;
  mechanic_name?: string;
};
function order(r: OrderRow): Order {
  return {
    openedAt: r.created_at.toISOString(),
    mechanicName: r.mechanic_name,
    displayOrderId: r.display_order_id,
    totalAmount: r.total_amount,
    closedAt: r.closed_at?.toISOString() ?? null,
    id: r.id.toLowerCase(),
    status: r.status,
    version: r.version.toString('hex'),
    mechanicId: r.mechanic_id.toLowerCase(),
    draft: {
      ...JSON.parse(r.draft_data),
      customerName: r.customer_name_snapshot,
      plate: r.plate_snapshot,
      mileage: r.mileage,
      notes: r.notes,
      recommendations: r.recommendations,
      ...(r.customer_id ? { customerId: r.customer_id.toLowerCase() } : {}),
      ...(r.vehicle_id ? { vehicleId: r.vehicle_id.toLowerCase() } : {}),
    },
  };
}
export class SqlUnit implements UnitOfWork {
  constructor(
    private tx: sql.Transaction,
    private signal: AbortSignal,
  ) {}
  async query<T = Record<string, unknown>>(
    text: string,
    params: Params = {},
  ): Promise<sql.IResult<T>> {
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
    } finally {
      this.signal.removeEventListener('abort', cancel);
    }
  }
  async time() {
    const r = await this.query<{ now: Date }>(
      'SELECT CAST(SYSUTCDATETIME() AS datetime2(3)) AS now',
    );
    return r.recordset[0]!.now.getTime();
  }
  async userByName(username: string) {
    const r = await this.query<UserRow>(
      'SELECT * FROM dbo.Users WITH (UPDLOCK,HOLDLOCK) WHERE username=@username',
      { username },
    );
    return r.recordset[0] ? user(r.recordset[0]) : undefined;
  }
  async userById(id: string) {
    const r = await this.query<UserRow>(
      'SELECT * FROM dbo.Users WITH (UPDLOCK,HOLDLOCK) WHERE id=@id',
      { id },
    );
    return r.recordset[0] ? user(r.recordset[0]) : undefined;
  }
  async users() {
    return (
      await this.query<UserRow>(
        'SELECT * FROM dbo.Users WITH (UPDLOCK,HOLDLOCK) ORDER BY username',
      )
    ).recordset.map(user);
  }
  async insertUser(u: User) {
    await this.query(
      'INSERT dbo.Users(id,username,full_name,password_hash,role,active) VALUES(@id,@username,@fullName,@hash,@role,@active)',
      {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        hash: u.passwordHash,
        role: u.role,
        active: u.active,
      },
    );
  }
  async updateUser(u: User) {
    await this.query(
      'UPDATE dbo.Users SET full_name=@fullName,password_hash=@hash,role=@role,active=@active WHERE id=@id',
      {
        id: u.id,
        fullName: u.fullName,
        hash: u.passwordHash,
        role: u.role,
        active: u.active,
      },
    );
  }
  async session(hash: string) {
    const r = await this.query<{
      token_hash: string;
      user_id: string;
      csrf: string;
      last_activity_at: Date;
      revoked_at: Date | null;
    }>(
      'SELECT * FROM dbo.Sessions WITH (UPDLOCK,HOLDLOCK) WHERE token_hash=@hash',
      { hash },
    );
    const s = r.recordset[0];
    return s
      ? {
          tokenHash: s.token_hash,
          userId: s.user_id.toLowerCase(),
          csrf: s.csrf,
          lastActivity: s.last_activity_at.getTime(),
          revoked: s.revoked_at !== null,
        }
      : undefined;
  }
  async insertSession(s: Session) {
    // A retry after an ambiguous COMMIT must not resurrect a revoked/expired session.
    if (await this.session(s.tokenHash)) return;
    await this.query(
      'INSERT dbo.Sessions(token_hash,user_id,csrf,last_activity_at) VALUES(@hash,@userId,@csrf,@time)',
      {
        hash: s.tokenHash,
        userId: s.userId,
        csrf: s.csrf,
        time: new Date(s.lastActivity),
      },
    );
  }
  async touchSession(hash: string, now: number) {
    const r = await this.query(
      'UPDATE dbo.Sessions SET last_activity_at=@now WHERE token_hash=@hash AND revoked_at IS NULL AND last_activity_at>DATEADD(millisecond,-@idle,@now)',
      { hash, now: new Date(now), idle: IDLE_MS },
    );
    if (r.rowsAffected[0] !== 1) throw new HttpError(401, 'SESSION_EXPIRED');
  }
  async revokeSession(hash: string) {
    await this.query(
      'UPDATE dbo.Sessions SET revoked_at=COALESCE(revoked_at,SYSUTCDATETIME()) WHERE token_hash=@hash',
      { hash },
    );
  }
  async revokeUserSessions(id: string) {
    await this.query(
      'UPDATE dbo.Sessions SET revoked_at=COALESCE(revoked_at,SYSUTCDATETIME()) WHERE user_id=@id',
      { id },
    );
  }
  async listOrders(status: 'OPEN' | 'CLOSED', search: string, before?: string) {
    if (status === 'CLOSED' && search.trim().length < 2) throw new HttpError(400, 'HISTORY_SEARCH_REQUIRED');
    const rows = (
      await this.query<OrderRow>(
        `SELECT TOP (50) o.*,u.full_name AS mechanic_name FROM dbo.Orders o
      JOIN dbo.Users u ON u.id=o.mechanic_id LEFT JOIN dbo.Customers c ON c.id=o.customer_id
      WHERE o.status=@status AND (@before IS NULL OR o.created_at < (SELECT created_at FROM dbo.Orders WHERE id=@before)
        OR (o.created_at=(SELECT created_at FROM dbo.Orders WHERE id=@before) AND o.order_number<(SELECT order_number FROM dbo.Orders WHERE id=@before)))
      AND (@search='' OR LEFT(o.display_order_id,LEN(@search))=@search OR o.plate_snapshot=@plate
      OR CHARINDEX(@search COLLATE Latin1_General_100_CI_AI,o.customer_name_snapshot COLLATE Latin1_General_100_CI_AI)>0
      OR COALESCE(JSON_VALUE(o.draft_data,'$.identification'),c.identification)=@search)
      ORDER BY o.created_at DESC,o.order_number DESC`,
        { status, search, plate: search.toUpperCase().replace(/[\s-]/g, ''), before: before ?? null },
      )
    ).recordset;
    return rows.map(order);
  }
  async findCustomers(search: string): Promise<Customer[]> {
    return (
      await this.query<Customer>(
        `SELECT TOP (20) LOWER(CONVERT(varchar(36),id)) AS id, full_name AS fullName,identification,phone,email
      FROM dbo.Customers WHERE identification=@search OR CHARINDEX(@search COLLATE Latin1_General_100_CI_AI,full_name COLLATE Latin1_General_100_CI_AI)>0 ORDER BY full_name,id`,
        { search },
      )
    ).recordset;
  }
  async findVehicles(search: string, customerId?: string): Promise<Vehicle[]> {
    const rows = (
      await this.query<
        Vehicle & {
          fullName: string;
          identification: string;
          phone: string;
          email: string | null;
        }
      >(
        `SELECT TOP (20)
      LOWER(CONVERT(varchar(36),v.id)) AS id,LOWER(CONVERT(varchar(36),v.owner_id)) AS ownerId,v.plate,v.make,v.model,v.year,
      c.full_name AS fullName,c.identification,c.phone,c.email FROM dbo.Vehicles v JOIN dbo.Customers c ON c.id=v.owner_id
      WHERE (@customerId IS NULL OR v.owner_id=@customerId) AND (@search='' OR v.plate_normalized=@search)
      ORDER BY v.plate_normalized`,
        {
          search: search.toUpperCase().replace(/[\s-]/g, ''),
          customerId: customerId ?? null,
        },
      )
    ).recordset;
    return rows.map(({ fullName, identification, phone, email, ...v }) => ({
      ...v,
      owner: { id: v.ownerId, fullName, identification, phone, email },
    }));
  }
  async order(id: string) {
    const r = await this.query<OrderRow>(
      'SELECT o.*,u.full_name AS mechanic_name FROM dbo.Orders o WITH (UPDLOCK,HOLDLOCK) JOIN dbo.Users u ON u.id=o.mechanic_id WHERE o.id=@id',
      { id },
    );
    if (!r.recordset[0]) return undefined;
    const result = order(r.recordset[0]);
    result.draft.items = (
      await this.query<{ description: string; price: number }>(
        'SELECT description,price FROM dbo.OrderItems WHERE order_id=@id ORDER BY id',
        { id },
      )
    ).recordset;
    return result;
  }
  async saveOrder(id: string, userId: string, draft: Draft, previous?: Order) {
    if (draft.action === 'void' || draft.action === 'assign-mechanic') {
      if (!previous || previous.status !== 'OPEN') throw new HttpError(409, 'ORDER_NOT_OPEN');
      const actor = await this.userById(userId);
      if (draft.action === 'void' && actor?.role !== 'ADMIN' && previous.mechanicId !== userId)
        throw new HttpError(403, 'ASSIGNED_MECHANIC_REQUIRED');
      if (draft.action === 'assign-mechanic') {
        if (actor?.role !== 'ADMIN') throw new HttpError(403, 'ADMIN_REQUIRED');
        const target = draft.mechanicId ? await this.userById(draft.mechanicId) : undefined;
        if (!target?.active || !['ADMIN', 'MECHANIC'].includes(target.role)) throw new HttpError(400, 'INVALID_MECHANIC');
      }
      await this.query("EXEC sys.sp_set_session_context @key=N'j5_mechanic_reassignment',@value=@allow", { allow: draft.action === 'assign-mechanic' });
      try {
        const result = await this.query(
          draft.action === 'void'
            ? "UPDATE dbo.Orders SET status='VOID',updated_at=SYSUTCDATETIME() WHERE id=@id AND status='OPEN' AND version=@version"
            : "UPDATE dbo.Orders SET mechanic_id=@mechanic,updated_at=SYSUTCDATETIME() WHERE id=@id AND status='OPEN' AND version=@version",
          { id, mechanic: draft.mechanicId ?? previous.mechanicId, version: Buffer.from(previous.version, 'hex') },
        );
        if (result.rowsAffected[0] !== 1) throw new HttpError(412, 'VERSION_CONFLICT');
      } finally {
        await this.query("EXEC sys.sp_set_session_context @key=N'j5_mechanic_reassignment',@value=NULL");
      }
      return (await this.order(id))!;
    }
    const assignedMechanic = draft.mechanicId ?? previous?.mechanicId ?? userId;
    if (assignedMechanic !== (previous?.mechanicId ?? userId)) {
      const actor = await this.userById(userId);
      if (actor?.role !== 'ADMIN') throw new HttpError(403, 'ADMIN_REQUIRED');
      if (previous?.status !== 'OPEN') throw new HttpError(409, 'ORDER_NOT_OPEN');
      const target = await this.userById(assignedMechanic);
      if (!target?.active) throw new HttpError(400, 'INVALID_MECHANIC');
    }
    let customerId =
      draft.customerId ??
      (previous?.status !== 'OPEN' ||
      draft.identification === undefined ||
      draft.identification === previous?.draft.identification
        ? previous?.draft.customerId
        : undefined) ??
      null;
    let vehicleId =
      draft.vehicleId ??
      (draft.plate === previous?.draft.plate
        ? previous?.draft.vehicleId
        : undefined) ??
      null;
    if (
      previous?.status !== 'OPEN' &&
      previous?.draft.customerId &&
      draft.customerId &&
      previous.draft.customerId !== draft.customerId
    )
      throw new HttpError(409, 'HISTORICAL_CUSTOMER_IMMUTABLE');
    if (
      previous?.status !== 'OPEN' &&
      previous?.draft.vehicleId &&
      draft.vehicleId &&
      previous.draft.vehicleId !== draft.vehicleId
    )
      throw new HttpError(409, 'ORDER_VEHICLE_IMMUTABLE');
    if (vehicleId) {
      const vehicle = (
        await this.query<{ owner_id: string | null }>(
          'SELECT owner_id FROM dbo.Vehicles WITH (HOLDLOCK) WHERE id=@id',
          { id: vehicleId },
        )
      ).recordset[0];
      if (!vehicle) throw new HttpError(400, 'INVALID_VEHICLE');
      if (!draft.identification)
        customerId ??= vehicle.owner_id?.toLowerCase() ?? null;
    }
    if (
      customerId &&
      !(
        await this.query('SELECT id FROM dbo.Customers WHERE id=@id', {
          id: customerId,
        })
      ).recordset.length
    )
      throw new HttpError(400, 'INVALID_CUSTOMER');
    const customer = customerSchema.safeParse({
      fullName: draft.customerName,
      identification: draft.identification,
      phone: draft.phone,
      email: draft.email,
    });
    if (!customerId && customer.success) {
      const found = (
        await this.query<{ id: string }>(
          'SELECT id FROM dbo.Customers WITH (UPDLOCK,HOLDLOCK) WHERE identification=@identification',
          { identification: customer.data.identification },
        )
      ).recordset[0];
      customerId = found?.id.toLowerCase() ?? randomUUID();
      if (!found)
        await this.query(
          'INSERT dbo.Customers(id,full_name,identification,phone,email) VALUES(@id,@name,@identification,@phone,@email)',
          {
            id: customerId,
            name: customer.data.fullName,
            identification: customer.data.identification,
            phone: customer.data.phone,
            email: customer.data.email || null,
          },
        );
    }
    if (!vehicleId && customerId) {
      const vehicle = vehicleSchema.safeParse({
        make: draft.make,
        model: draft.model,
        year: draft.year,
        plate: draft.plate,
        ownerId: customerId,
      });
      if (vehicle.success) {
        const found = (
          await this.query<{ id: string }>(
            'SELECT id FROM dbo.Vehicles WITH (UPDLOCK,HOLDLOCK) WHERE plate_normalized=@plate',
            { plate: vehicle.data.plate },
          )
        ).recordset[0];
        vehicleId = found?.id.toLowerCase() ?? randomUUID();
        if (!found)
          await this.query(
            'INSERT dbo.Vehicles(id,owner_id,plate,make,model,year) VALUES(@id,@owner,@plate,@make,@model,@year)',
            {
              id: vehicleId,
              owner: customerId,
              plate: vehicle.data.plate,
              make: vehicle.data.make,
              model: vehicle.data.model,
              year: vehicle.data.year,
            },
          );
      }
    }
    if (draft.action === 'close' && customerId && vehicleId) {
      const c = (
        await this.query<{ identification: string }>(
          'SELECT identification FROM dbo.Customers WHERE id=@id',
          { id: customerId },
        )
      ).recordset[0];
      const v = (
        await this.query<{ plate_normalized: string }>(
          'SELECT plate_normalized FROM dbo.Vehicles WHERE id=@id',
          { id: vehicleId },
        )
      ).recordset[0];
      if (
        c?.identification !== draft.identification ||
        v?.plate_normalized !== draft.plate
      )
        throw new HttpError(409, 'ORDER_IDENTITY_MISMATCH');
    }
    if (draft.action === 'transfer-owner') {
      const actor = await this.userById(userId);
      if (actor?.role !== 'ADMIN') throw new HttpError(403, 'ADMIN_REQUIRED');
      const selectedCustomer = (
        await this.query<{ identification: string }>(
          'SELECT identification FROM dbo.Customers WHERE id=@id',
          { id: customerId },
        )
      ).recordset[0];
      const selectedVehicle = (
        await this.query<{ plate_normalized: string }>(
          'SELECT plate_normalized FROM dbo.Vehicles WHERE id=@id',
          { id: vehicleId },
        )
      ).recordset[0];
      if (
        !selectedCustomer ||
        !selectedVehicle ||
        selectedCustomer.identification !== draft.identification ||
        selectedVehicle.plate_normalized !== draft.plate
      )
        throw new HttpError(409, 'OWNER_SELECTION_MISMATCH');
      await this.query('UPDATE dbo.Vehicles SET owner_id=@owner WHERE id=@id', {
        owner: customerId,
        id: vehicleId,
      });
      await this.audit(userId, 'VEHICLE_OWNER_CHANGED', vehicleId);
    }
    if (vehicleId && draft.action === 'close' && draft.model) {
      await this.query(
        'UPDATE dbo.Vehicles SET model=@model WHERE id=@id AND model IS NULL',
        { id: vehicleId, model: draft.model.trim() },
      );
    }
    const originalClosedAt = previous?.closedAt;
    const dataClosed = previous?.status === 'CLOSED';
    const actor = await this.userById(userId);
    const adminMutation =
      actor?.role === 'ADMIN' &&
      !!draft.action &&
      ['admin-edit', 'reopen', 'void'].includes(draft.action);
    if (previous && previous.status !== 'OPEN' && !adminMutation)
      throw new HttpError(409, 'ORDER_NOT_OPEN');
    await this.query(
      "EXEC sys.sp_set_session_context @key=N'j5_admin_mutation',@value=@allow",
      { allow: adminMutation },
    );
    // Temporarily reopen inside the same transaction to replace services without exposing an invalid closed order.
    if (previous?.status === 'CLOSED' && adminMutation) {
      await this.query(
        "UPDATE dbo.Orders SET status='OPEN',closed_at=NULL WHERE id=@id AND version=@version",
        { id, version: Buffer.from(previous.version, 'hex') },
      );
      previous = (await this.order(id))!;
    }
    const action = draft.action;
    const status =
      action === 'close'
        ? 'CLOSED'
        : action === 'reopen'
            ? 'OPEN'
            : action === 'admin-edit' && dataClosed
              ? 'CLOSED'
              : (previous?.status ?? 'OPEN');
    await this.query("EXEC sys.sp_set_session_context @key=N'j5_mechanic_reassignment',@value=@allow", { allow: actor?.role === 'ADMIN' && previous?.status === 'OPEN' });
    const { action: _, mechanicId: _mechanic, ...data } = draft;
    const params: Params = {
      id,
      userId,
      assignedMechanic,
      customerId,
      vehicleId,
      name: draft.customerName,
      plate: draft.plate.toUpperCase().replace(/[\s-]/g, ''),
      mileage: draft.mileage,
      notes: draft.notes,
      recommendations: draft.recommendations,
      data: JSON.stringify(data),
    };
    if (previous) {
      const r = await this.query(
        'UPDATE dbo.Orders SET mechanic_id=@assignedMechanic,draft_data=@data,customer_id=@customerId,vehicle_id=@vehicleId,customer_name_snapshot=@name,plate_snapshot=@plate,mileage=@mileage,notes=@notes,recommendations=@recommendations,updated_at=SYSUTCDATETIME() WHERE id=@id AND version=@version',
        { ...params, version: Buffer.from(previous.version, 'hex') },
      );
      if (r.rowsAffected[0] !== 1) throw new HttpError(412, 'VERSION_CONFLICT');
    } else {
      await this.query(
        'INSERT dbo.Orders(id,customer_id,vehicle_id,mechanic_id,draft_data,customer_name_snapshot,plate_snapshot,mileage,notes,recommendations) VALUES(@id,@customerId,@vehicleId,@userId,@data,@name,@plate,@mileage,@notes,@recommendations)',
        params,
      );
    }
    await this.query('DELETE dbo.OrderItems WHERE order_id=@id', { id });
    for (const item of draft.items ?? [])
      await this.query(
        'INSERT dbo.OrderItems(id,order_id,description,price) VALUES(@itemId,@id,@description,CAST(@price AS decimal(12,2)))',
        {
          itemId: randomUUID(),
          id,
          description: item.description,
          price: item.price.toFixed(2),
        },
      );
    await this.query(
      "UPDATE dbo.Orders SET total_amount=(SELECT COALESCE(SUM(price),0) FROM dbo.OrderItems WHERE order_id=@id),status=@status,closed_at=CASE WHEN @status='CLOSED' THEN COALESCE(@originalClosedAt,closed_at,SYSUTCDATETIME()) ELSE NULL END WHERE id=@id",
      {
        id,
        status,
        originalClosedAt:
          action === 'admin-edit' && originalClosedAt
            ? new Date(originalClosedAt)
            : null,
      },
    );
    await this.query(
      "EXEC sys.sp_set_session_context @key=N'j5_admin_mutation',@value=NULL",
    );
    await this.query("EXEC sys.sp_set_session_context @key=N'j5_mechanic_reassignment',@value=NULL");
    return (await this.order(id))!;
  }
  async receipt(userId: string, key: string) {
    const r = await this.query<{
      fingerprint: string;
      request_password_hash: string | null;
      response_status: number;
      response_body: string;
      response_headers: string;
    }>(
      'SELECT * FROM dbo.IdempotencyRequests WITH (UPDLOCK,HOLDLOCK) WHERE user_id=@userId AND idempotency_key=@key',
      { userId, key },
    );
    const row = r.recordset[0];
    return row
      ? {
          fingerprint: row.fingerprint,
          ...(row.request_password_hash
            ? { passwordHash: row.request_password_hash }
            : {}),
          reply: {
            status: row.response_status,
            body: JSON.parse(row.response_body),
            headers: JSON.parse(row.response_headers),
          },
        }
      : undefined;
  }
  async insertReceipt(userId: string, key: string, receipt: Receipt) {
    await this.query(
      'INSERT dbo.IdempotencyRequests(user_id,idempotency_key,fingerprint,request_password_hash,response_status,response_body,response_headers) VALUES(@userId,@key,@fingerprint,@passwordHash,@status,@body,@headers)',
      {
        userId,
        key,
        fingerprint: receipt.fingerprint,
        passwordHash: receipt.passwordHash ?? null,
        status: receipt.reply.status,
        body: JSON.stringify(receipt.reply.body),
        headers: JSON.stringify(receipt.reply.headers),
      },
    );
  }
  async audit(actorId: string | null, action: string, entityId: string | null) {
    await this.query(
      'INSERT dbo.AuditLogs(actor_id,action,entity_id) VALUES(@actorId,@action,@entityId)',
      { actorId, action, entityId },
    );
  }
}
export class SqlRepository implements Repository {
  async run<T>(
    work: (tx: UnitOfWork) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.runSql(work, signal);
  }
  async runSql<T>(
    work: (tx: SqlUnit) => Promise<T>,
    signal?: AbortSignal,
    rollbackOnly = false,
  ): Promise<T> {
    return retrySql(
      async (attemptSignal) => {
        const pool = new sql.ConnectionPool(sqlConfig());
        // Never print driver errors: connection metadata can contain credentials.
        pool.on('error', () => undefined);
        let transaction: sql.Transaction | undefined;
        let finished = false;
        try {
          await pool.connect(); // bounded by connectionTimeout even during cancellation
          attemptSignal.throwIfAborted();
          transaction = new sql.Transaction(pool);
          transaction.on('rollback', () => {
            finished = true;
          });
          await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
          const result = await work(new SqlUnit(transaction, attemptSignal));
          attemptSignal.throwIfAborted();
          if (rollbackOnly) await transaction.rollback();
          else await transaction.commit();
          finished = true;
          return result;
        } catch (error) {
          if (transaction && !finished)
            await transaction.rollback().catch(() => undefined);
          throw error;
        } finally {
          await pool.close().catch(() => undefined);
        }
      },
      config.sql.retryBudgetMs,
      signal,
    );
  }
}
