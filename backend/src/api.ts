import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import { fullNameSchema, canClose } from './validation.js';
import { config } from './config.js';
import {
  draftSchema,
  IDLE_MS,
  passwordSchema,
  publicUser,
  roleSchema,
  usernameSchema,
  type Reply,
  type Repository,
  type Session,
  type UnitOfWork,
} from './domain.js';
import { hashPassword, verifyPassword } from './password.js';
import { HttpError } from './reliability.js';
import { SqlRepository } from './sql.js';

export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const uuid = z.uuid().transform((s) => s.toLowerCase());
const loginSchema = z
  .object({ username: usernameSchema, password: z.string().min(1).max(200) })
  .strict();
const createUserSchema = z
  .object({
    username: usernameSchema,
    fullName: fullNameSchema,
    password: passwordSchema,
    role: roleSchema,
  })
  .strict();
const patchUserSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    active: z.boolean().optional(),
    role: roleSchema.optional(),
    password: passwordSchema.optional(),
  })
  .strict()
  .refine((x) => Object.keys(x).length > 0);
const result = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Reply => ({
  body,
  status,
  headers: { 'Cache-Control': 'no-store', ...headers },
});
const errorReply = (error: HttpError) =>
  result(
    { code: error.code },
    error.status,
    error.status === 503 || error.status === 429 ? { 'Retry-After': '3' } : {},
  );
function csrfMatches(actual: string | null, expected: string) {
  const a = Buffer.from(actual ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
      .join(',') +
    '}'
  );
}
async function body(request: Request) {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new HttpError(415, 'JSON_REQUIRED');
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 32000)
    throw new HttpError(413, 'BODY_TOO_LARGE');
  return JSON.parse(raw) as unknown;
}
async function authenticated(tx: UnitOfWork, hash: string) {
  const s = await tx.session(hash);
  const now = await tx.time();
  if (!s || s.revoked || now - s.lastActivity >= IDLE_MS)
    throw new HttpError(401, 'SESSION_EXPIRED');
  const user = await tx.userById(s.userId);
  if (!user?.active) throw new HttpError(401, 'SESSION_EXPIRED');
  return { session: s, user, now };
}
export function createApi(
  options: {
    repository?: Repository;
    production?: boolean;
    origin?: string;
  } = {},
) {
  const repository = options.repository ?? new SqlRepository();
  const origin = options.origin ?? config.origin;
  const secure = (options.production ?? config.production) ? '; Secure' : '';
  const cookie = (token: string, expire = false) =>
    'j5_session=' +
    token +
    '; HttpOnly; SameSite=Strict; Path=/api' +
    secure +
    (expire ? '; Max-Age=0' : '');
  // Local abuse guard. Multi-instance deployments also require a shared gateway limiter.
  const attempts = new Map<string, { count: number; start: number }>();
  let globalAttempts = { count: 0, start: Date.now() };
  function limitLogin(username: string) {
    const now = Date.now();
    if (now - globalAttempts.start >= 60000)
      globalAttempts = { count: 0, start: now };
    for (const [key, value] of attempts)
      if (now - value.start >= 300000) attempts.delete(key);
    const entry = attempts.get(username) ?? { count: 0, start: now };
    if (globalAttempts.count >= 100 || entry.count >= 15)
      throw new HttpError(429, 'LOGIN_RATE_LIMIT');
    globalAttempts.count++;
    entry.count++;
    attempts.set(username, entry);
  }
  return async (request: Request): Promise<Response> => {
    try {
      // One SQL budget for the entire HTTP request, including multi-transaction login/admin paths.
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(config.sql.retryBudgetMs),
      ]);
      const path = new URL(request.url).pathname;
      const method = request.method;
      const mutating = !['GET', 'HEAD'].includes(method);
      if (mutating && request.headers.get('origin') !== origin)
        throw new HttpError(403, 'ORIGIN_REJECTED');
      let reply: Reply;
      if (path === '/api/health' && method === 'GET') {
        await repository.run((tx) => tx.time(), signal);
        reply = result({ status: 'ok', mode: 'sql' });
      } else if (path === '/api/auth/login' && method === 'POST') {
        const input = loginSchema.parse(await body(request));
        limitLogin(input.username);
        const candidate = await repository.run(
          (tx) => tx.userByName(input.username),
          signal,
        );
        const valid = await verifyPassword(
          input.password,
          candidate?.passwordHash,
        );
        if (!valid || !candidate?.active)
          throw new HttpError(401, 'INVALID_CREDENTIALS');
        const token = randomBytes(32).toString('base64url');
        const hash = tokenHash(token);
        const csrf = randomBytes(32).toString('base64url');
        reply = await repository.run(async (tx) => {
          const current = await tx.userById(candidate.id);
          if (
            !current?.active ||
            current.passwordHash !== candidate.passwordHash
          )
            throw new HttpError(401, 'INVALID_CREDENTIALS');
          let session = await tx.session(hash);
          if (!session) {
            session = {
              tokenHash: hash,
              userId: current.id,
              csrf,
              lastActivity: await tx.time(),
              revoked: false,
            };
            await tx.insertSession(session);
            await tx.audit(current.id, 'LOGIN', current.id);
          }
          if (
            session.revoked ||
            (await tx.time()) - session.lastActivity >= IDLE_MS
          )
            throw new HttpError(401, 'SESSION_EXPIRED');
          return result(
            {
              userId: current.id,
              username: current.username,
              fullName: current.fullName,
              role: current.role,
              csrf: session.csrf,
              lastActivity: session.lastActivity,
              idleMs: IDLE_MS,
            },
            200,
            { 'Set-Cookie': cookie(token) },
          );
        }, signal);
      } else {
        const token =
          request.headers
            .get('cookie')
            ?.split(';')
            .map((x) => x.trim())
            .find((x) => x.startsWith('j5_session='))
            ?.slice(11) ?? '';
        if (!/^[A-Za-z0-9_-]{43}$/.test(token))
          throw new HttpError(401, 'SESSION_EXPIRED');
        const hash = tokenHash(token);
        const orderRoute = /^\/api\/orders\/([^/]+)$/.exec(path);
        const userRoute = /^\/api\/admin\/users\/([^/]+)$/.exec(path);
        const userWrite =
          (path === '/api/admin/users' && method === 'POST') ||
          (userRoute && method === 'PATCH');
        const write = Boolean(userWrite || (orderRoute && method === 'PUT'));
        // Authenticate before expensive password hashing. Authorization is repeated inside the write transaction.
        if (userWrite)
          await repository.run(async (tx) => {
            const { user, session } = await authenticated(tx, hash);
            if (user.role !== 'ADMIN')
              throw new HttpError(403, 'ADMIN_REQUIRED');
            if (!csrfMatches(request.headers.get('x-csrf-token'), session.csrf))
              throw new HttpError(403, 'CSRF_REJECTED');
          }, signal);
        const input = write ? await body(request) : undefined;
        const key = write
          ? uuid.parse(request.headers.get('idempotency-key'))
          : undefined;
        const createInput =
          path === '/api/admin/users' && method === 'POST'
            ? createUserSchema.parse(input)
            : undefined;
        const patchInput =
          userRoute && method === 'PATCH'
            ? patchUserSchema.parse(input)
            : undefined;
        const password = createInput?.password ?? patchInput?.password;
        const passwordHash =
          password === undefined ? undefined : await hashPassword(password);
        // Password equality uses bcrypt; never create a fast SHA-256 password verifier.
        const fingerprintBody =
          password === undefined
            ? input
            : { ...(input as object), password: '[bcrypt-verified]' };
        const fingerprint = write
          ? tokenHash(
              canonical({
                method,
                path,
                body: fingerprintBody,
                expected: request.headers.get('if-match'),
              }),
            )
          : '';
        reply = await repository.run(async (tx) => {
          // Logout is idempotent even after an ambiguous COMMIT or prior revocation.
          if (
            (path === '/api/auth/logout' && method === 'POST') ||
            (path === '/api/session' && method === 'DELETE')
          ) {
            const previous = await tx.session(hash);
            if (!previous) throw new HttpError(401, 'SESSION_EXPIRED');
            if (
              !csrfMatches(request.headers.get('x-csrf-token'), previous.csrf)
            )
              throw new HttpError(403, 'CSRF_REJECTED');
            if (!previous.revoked) {
              await tx.revokeSession(hash);
              await tx.audit(previous.userId, 'LOGOUT', previous.userId);
            }
            return result({}, 200, { 'Set-Cookie': cookie('', true) });
          }
          const { session, user, now } = await authenticated(tx, hash);
          if (
            mutating &&
            !csrfMatches(request.headers.get('x-csrf-token'), session.csrf)
          )
            throw new HttpError(403, 'CSRF_REJECTED');
          const sessionBody = (s: Session) => ({
            userId: user.id,
            username: user.username,
            fullName: user.fullName,
            role: user.role,
            csrf: s.csrf,
            lastActivity: s.lastActivity,
            idleMs: IDLE_MS,
          });
          if (
            ['/api/auth/me', '/api/session'].includes(path) &&
            method === 'GET'
          )
            return result(sessionBody(session));
          if (
            ['/api/auth/activity', '/api/session/activity'].includes(path) &&
            method === 'POST'
          ) {
            await tx.touchSession(hash, now);
            return result({ lastActivity: now });
          }
          if (path === '/api/vehicle-catalog' && method === 'GET') return result(await tx.vehicleCatalog());
          if (path.startsWith('/api/admin/') && user.role !== 'ADMIN')
            throw new HttpError(403, 'ADMIN_REQUIRED');
          if (path === '/api/admin/users' && method === 'GET')
            return result({ users: (await tx.users()).map(publicUser) });
          if (path === '/api/orders' && method === 'GET') {
            const url = new URL(request.url);
            const status = z
              .enum(['OPEN', 'CLOSED'])
              .parse(url.searchParams.get('status') ?? 'OPEN');
            const search = z
              .string()
              .trim()
              .max(200)
              .parse(url.searchParams.get('q') ?? '');
            if (status === 'CLOSED' && search.length < 2) throw new HttpError(400, 'HISTORY_SEARCH_REQUIRED');
            const before = url.searchParams.get('before');
            if (before) uuid.parse(before);
            return result({
              orders: await tx.listOrders(status, search, before ?? undefined),
            });
          }
          if (path === '/api/customers' && method === 'GET') {
            const search = z
              .string()
              .trim()
              .min(2)
              .max(200)
              .parse(new URL(request.url).searchParams.get('q'));
            return result({ customers: await tx.findCustomers(search) });
          }
          if (path === '/api/vehicles' && method === 'GET') {
            const url = new URL(request.url);
            const customerId = url.searchParams.get('customerId');
            const search = z
              .string()
              .trim()
              .max(20)
              .parse(url.searchParams.get('q') ?? '');
            if (!customerId && search.length < 3)
              throw new HttpError(400, 'SEARCH_TOO_SHORT');
            return result({
              vehicles: await tx.findVehicles(
                search,
                customerId ? uuid.parse(customerId) : undefined,
              ),
            });
          }
          if (orderRoute && method === 'GET') {
            const order = await tx.order(uuid.parse(orderRoute[1]));
            if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND');
            return result(order, 200, { ETag: '"' + order.version + '"' });
          }
          if (!write || !key) throw new HttpError(404, 'NOT_FOUND');
          const previous = await tx.receipt(user.id, key);
          if (previous) {
            if (
              previous.fingerprint !== fingerprint ||
              (previous.passwordHash &&
                !(await verifyPassword(password ?? '', previous.passwordHash)))
            )
              throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED');
            return previous.reply;
          }
          let response: Reply;
          try {
            if (orderRoute && method === 'PUT') {
              const id = uuid.parse(orderRoute[1]);
              let draft = draftSchema.parse(input);
              const existing = await tx.order(id);
              const expected = request.headers.get('if-match');
              if (existing && expected === null)
                throw new HttpError(428, 'VERSION_REQUIRED');
              if (
                (existing && expected !== '"' + existing.version + '"') ||
                (!existing && expected !== null)
              )
                throw new HttpError(412, 'VERSION_CONFLICT');
              if (
                draft.action &&
                ['reopen', 'admin-edit', 'transfer-owner', 'assign-mechanic'].includes(
                  draft.action,
                ) &&
                user.role !== 'ADMIN'
              )
                throw new HttpError(403, 'ADMIN_REQUIRED');
              if (draft.action === 'void' || draft.action === 'assign-mechanic') {
                if (!existing || existing.status !== 'OPEN') throw new HttpError(409, 'ORDER_NOT_OPEN');
                if (draft.action === 'void' && user.role !== 'ADMIN' && existing.mechanicId !== user.id)
                  throw new HttpError(403, 'ASSIGNED_MECHANIC_REQUIRED');
                if (draft.action === 'assign-mechanic' && !draft.mechanicId) throw new HttpError(400, 'INVALID_MECHANIC');
                // Operational actions preserve all customer, vehicle and service data.
                draft = { ...existing.draft, action: draft.action, ...(draft.action === 'assign-mechanic' ? { mechanicId: draft.mechanicId } : {}) };
              }
              if (
                existing &&
                existing.status !== 'OPEN' &&
                !(user.role === 'ADMIN' && draft.action)
              )
                throw new HttpError(409, 'ORDER_NOT_OPEN');
              if (draft.action === 'close' && existing && user.role !== 'ADMIN' && existing.mechanicId !== user.id)
                throw new HttpError(403, 'ASSIGNED_MECHANIC_REQUIRED');
              if (
                draft.action === 'close' &&
                (!existing || existing.status !== 'OPEN' || !canClose(draft))
              )
                throw new HttpError(400, 'ORDER_INCOMPLETE');
              if (
                draft.action === 'transfer-owner' &&
                (!existing ||
                  existing.status !== 'OPEN' ||
                  !draft.customerId ||
                  !draft.vehicleId)
              )
                throw new HttpError(400, 'OWNER_TRANSFER_INCOMPLETE');
              if (draft.mechanicId && (draft.action === 'assign-mechanic' || draft.mechanicId !== existing?.mechanicId)) {
                if (user.role !== 'ADMIN') throw new HttpError(403, 'ADMIN_REQUIRED');
                if (!existing || existing.status !== 'OPEN') throw new HttpError(409, 'ORDER_NOT_OPEN');
                const target = await tx.userById(draft.mechanicId);
                if (!target?.active || !['MECHANIC', 'ADMIN'].includes(target.role)) throw new HttpError(400, 'INVALID_MECHANIC');
              }
              if (draft.action === 'reopen' && existing?.status !== 'CLOSED')
                throw new HttpError(409, 'ORDER_NOT_CLOSED');
              if (draft.action === 'admin-edit' && !existing)
                throw new HttpError(404, 'ORDER_NOT_FOUND');
              if (
                draft.action === 'admin-edit' &&
                existing?.status === 'CLOSED' &&
                !canClose(draft)
              )
                throw new HttpError(400, 'ORDER_INCOMPLETE');
              const saved = await tx.saveOrder(id, user.id, draft, existing);
              if (existing && saved.mechanicId !== existing.mechanicId)
                await tx.audit(user.id, 'ORDER_MECHANIC_CHANGED', id);
              await tx.audit(
                user.id,
                draft.action === 'void' ? 'ORDER_VOIDED' : existing ? 'ORDER_UPDATED' : 'ORDER_CREATED',
                id,
              );
              response = result(saved, 200, {
                ETag: '"' + saved.version + '"',
              });
            } else if (createInput) {
              if (await tx.userByName(createInput.username))
                throw new HttpError(409, 'USERNAME_EXISTS');
              const created = {
                id: randomUUID(),
                username: createInput.username,
                fullName: createInput.fullName,
                passwordHash: passwordHash!,
                role: createInput.role,
                active: true,
              };
              await tx.insertUser(created);
              await tx.audit(user.id, 'USER_CREATED', created.id);
              response = result(publicUser(created), 201);
            } else if (userRoute && patchInput) {
              const id = uuid.parse(userRoute[1]);
              const target = await tx.userById(id);
              if (!target) throw new HttpError(404, 'USER_NOT_FOUND');
              const updated = {
                ...target,
                fullName: patchInput.fullName ?? target.fullName,
                role: patchInput.role ?? target.role,
                active: patchInput.active ?? target.active,
                passwordHash: passwordHash ?? target.passwordHash,
              };
              if (
                target.active &&
                target.role === 'ADMIN' &&
                (!updated.active || updated.role !== 'ADMIN') &&
                (await tx.users()).filter((u) => u.active && u.role === 'ADMIN')
                  .length <= 1
              )
                throw new HttpError(409, 'LAST_ADMIN');
              await tx.updateUser(updated);
              if (
                !updated.active ||
                updated.role !== target.role ||
                passwordHash
              )
                await tx.revokeUserSessions(id);
              await tx.audit(
                user.id,
                passwordHash ? 'USER_PASSWORD_RESET' : 'USER_UPDATED',
                id,
              );
              response = result(publicUser(updated));
            } else throw new HttpError(404, 'NOT_FOUND');
          } catch (error) {
            // saveOrder rolls business failures back to its savepoint before we persist their replay.
            if (
              !(error instanceof HttpError) ||
              ![400, 404, 409, 412, 428].includes(error.status)
            )
              throw error;
            response = errorReply(error);
          }
          await tx.insertReceipt(user.id, key, {
            fingerprint,
            ...(passwordHash ? { passwordHash } : {}),
            reply: response,
          });
          return response;
        }, signal);
      }
      return Response.json(reply.body, {
        status: reply.status,
        headers: reply.headers,
      });
    } catch (error) {
      const reply =
        error instanceof z.ZodError || error instanceof SyntaxError
          ? result({ code: 'INVALID_INPUT' }, 400)
          : error instanceof HttpError
            ? errorReply(error)
            : result({ code: 'INTERNAL_ERROR' }, 500);
      return Response.json(reply.body, {
        status: reply.status,
        headers: reply.headers,
      });
    }
  };
}
