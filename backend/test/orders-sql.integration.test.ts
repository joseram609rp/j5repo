import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { config } from '../src/config.js';
import { createApi, tokenHash } from '../src/api.js';
import { SqlRepository } from '../src/sql.js';
import type { Draft, Order } from '../src/domain.js';
const enabled = process.env.J5_SQL_INTEGRATION === '1';
it.skipIf(!enabled)(
  'Phase 3 SQL: cross-mechanic lists, reuse, search, close, transfer history, ETag, replay and ADMIN reopen (rollback only)',
  async () => {
    const repo = new SqlRepository(),
      userId = randomUUID(),
      adminId = randomUUID(),
      orderId = randomUUID(),
      secondId = randomUUID();
    const oldBudget = config.sql.retryBudgetMs;
    config.sql.retryBudgetMs = 55000;
    try {
      await repo.runSql(
        async (tx) => {
          const suffix = randomUUID().slice(0, 8);
          await tx.insertUser({
            id: userId,
            username: 'p3-m-' + suffix,
            fullName: 'Phase 3 mechanic ' + suffix,
            passwordHash: 'unused-fixture-no-login',
            role: 'MECHANIC',
            active: true,
          });
          await tx.insertUser({
            id: adminId,
            username: 'p3-a-' + suffix,
            fullName: 'Phase 3 admin ' + suffix,
            passwordHash: 'unused-fixture-no-login',
            role: 'ADMIN',
            active: true,
          });
          const raw = randomBytes(32).toString('base64url'),
            adminRaw = randomBytes(32).toString('base64url'),
            csrf = 'fixture-csrf';
          for (const [token, id] of [
            [raw, userId],
            [adminRaw, adminId],
          ])
            await tx.insertSession({
              tokenHash: tokenHash(token!),
              userId: id!,
              csrf,
              lastActivity: await tx.time(),
              revoked: false,
            });
          let diagnostic = '';
          const origin = 'http://localhost:5173',
            api = createApi({
              repository: {
                run: async (work) => {
                  try {
                    return await work(tx);
                  } catch (e) {
                    const error = e as { number?: number; message?: string };
                    diagnostic =
                      String(error.number) + ': ' + String(error.message);
                    for (const secret of [config.sql.user, config.sql.password])
                      if (secret)
                        diagnostic = diagnostic
                          .split(secret)
                          .join('[REDACTED]');
                    throw e;
                  }
                },
              },
              origin,
            });
          const call = (
            path: string,
            method = 'GET',
            body?: unknown,
            admin = false,
            key = randomUUID(),
            version?: string,
          ) =>
            api(
              new Request(origin + '/api' + path, {
                method,
                headers: {
                  origin,
                  'content-type': 'application/json',
                  cookie: 'j5_session=' + (admin ? adminRaw : raw),
                  'x-csrf-token': csrf,
                  'idempotency-key': key,
                  ...(version ? { 'if-match': '"' + version + '"' } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
              }),
            );
          const draft: Draft = {
            customerName: 'Phase 3 customer ' + suffix,
            identification: String(randomInt(100000000, 999999999)),
            phone: '88888888',
            plate: 'MVP' + String(randomInt(0, 1000)).padStart(3, '0'),
            make: 'Toyota',
            model: 'Corolla',
            year: 2020,
            mileage: 128400,
            notes: 'Frenos revisados',
            recommendations: '',
            items: [
              { description: 'Servicio', price: 100.1 },
              { description: 'Ajuste', price: 0.2 },
            ],
          };
          const first = await call('/orders/' + orderId, 'PUT', draft);
          expect(first.status, diagnostic).toBe(200);
          const open: Order = await first.json();
          expect(open.openedAt).toBeTruthy();
          expect(open.mechanicId).toBe(userId);
          expect(open.totalAmount).toBe(100.3);
          const list = await (
            await call(
              '/orders?status=OPEN&q=' + encodeURIComponent(suffix),
              'GET',
              undefined,
              true,
            )
          ).json();
          expect(list.orders.map((o: Order) => o.id)).toContain(orderId);
          expect((await call('/orders?status=VOID')).status).toBe(400);
          expect((await call('/orders?before=bad')).status).toBe(400);
          const customer = (
            await (await call('/customers?q=' + draft.identification)).json()
          ).customers[0];
          expect(customer.id).toBe(open.draft.customerId);
          expect(
            (
              await (await call('/customers?q=' + suffix)).json()
            ).customers.some((c: { id: string }) => c.id === customer.id),
          ).toBe(true);
          const vehicle = (
            await (await call('/vehicles?q=' + draft.plate)).json()
          ).vehicles[0];
          expect(vehicle.id).toBe(open.draft.vehicleId);
          expect(vehicle.owner.id).toBe(customer.id);
          expect(
            (
              await (await call('/vehicles?customerId=' + customer.id)).json()
            ).vehicles.map((v: { id: string }) => v.id),
          ).toContain(vehicle.id);
          const secondResponse = await call(
            '/orders/' + secondId,
            'PUT',
            draft,
            true,
          );
          expect(secondResponse.status).toBe(200);
          const second: Order = await secondResponse.json();
          expect(second.draft.customerId).toBe(customer.id);
          expect(second.draft.vehicleId).toBe(vehicle.id);
          expect(
            (
              await tx.query<{ n: number }>(
                'SELECT COUNT(*) AS n FROM dbo.Customers WHERE identification=@identification',
                { identification: draft.identification! },
              )
            ).recordset[0]?.n,
          ).toBe(1);
          expect(
            (
              await tx.query<{ n: number }>(
                'SELECT COUNT(*) AS n FROM dbo.Vehicles WHERE plate_normalized=@plate',
                { plate: draft.plate },
              )
            ).recordset[0]?.n,
          ).toBe(1);
          expect(
            (
              await call(
                '/orders/' + orderId,
                'PUT',
                { ...draft, totalAmount: 1 },
                false,
                randomUUID(),
                open.version,
              )
            ).status,
          ).toBe(400);
          expect(
            (
              await call(
                '/orders/' + orderId,
                'PUT',
                { ...draft, action: 'close', notes: '' },
                false,
                randomUUID(),
                open.version,
              )
            ).status,
          ).toBe(400);
          const closeKey = randomUUID(),
            payload = { ...draft, action: 'close' };
          const closedResponse = await call(
            '/orders/' + orderId,
            'PUT',
            payload,
            false,
            closeKey,
            open.version,
          );
          expect(closedResponse.status).toBe(200);
          const closed: Order = await closedResponse.json();
          expect(closed.status).toBe('CLOSED');
          expect(closed.closedAt).toBeTruthy();
          expect(closed.totalAmount).toBe(100.3);
          expect(
            await (
              await call(
                '/orders/' + orderId,
                'PUT',
                payload,
                false,
                closeKey,
                open.version,
              )
            ).json(),
          ).toEqual(closed);
          expect(
            (
              await call(
                '/orders/' + orderId,
                'PUT',
                draft,
                false,
                randomUUID(),
                closed.version,
              )
            ).status,
          ).toBe(409);
          expect(
            (
              await call(
                '/orders/' + orderId,
                'PUT',
                { ...draft, action: 'reopen' },
                false,
                randomUUID(),
                closed.version,
              )
            ).status,
          ).toBe(403);
          for (const search of [
            closed.displayOrderId!,
            draft.plate,
            draft.identification!,
            draft.customerName,
          ])
            expect(
              (
                await (
                  await call(
                    '/orders?status=CLOSED&q=' + encodeURIComponent(search),
                  )
                ).json()
              ).orders.map((o: Order) => o.id),
            ).toContain(orderId);
          const newOwnerId = randomUUID(),
            newIdentification = String(randomInt(100000000, 999999999));
          await tx.query(
            "INSERT dbo.Customers(id,full_name,identification,phone) VALUES(@id,N'Explicit next owner',@identification,'88888888')",
            { id: newOwnerId, identification: newIdentification },
          );
          const transferredDraft = {
            ...second.draft,
            customerId: newOwnerId,
            customerName: 'Explicit next owner',
            identification: newIdentification,
          };
          // Ordinary save may use a different customer for this OPEN order, but never changes current vehicle ownership.
          const changedResponse = await call(
            '/orders/' + secondId,
            'PUT',
            transferredDraft,
            true,
            randomUUID(),
            second.version,
          );
          expect(changedResponse.status).toBe(200);
          const changed: Order = await changedResponse.json();
          expect((await tx.findVehicles(draft.plate))[0]?.ownerId).toBe(
            customer.id,
          );
          expect(
            (
              await call(
                '/orders/' + secondId,
                'PUT',
                { ...transferredDraft, action: 'transfer-owner' },
                false,
                randomUUID(),
                changed.version,
              )
            ).status,
          ).toBe(403);
          const transferKey = randomUUID(),
            transferPayload = { ...transferredDraft, action: 'transfer-owner' };
          const transferResponse = await call(
            '/orders/' + secondId,
            'PUT',
            transferPayload,
            true,
            transferKey,
            changed.version,
          );
          expect(transferResponse.status).toBe(200);
          expect((await tx.findVehicles(draft.plate))[0]?.ownerId).toBe(
            newOwnerId,
          );
          expect((await tx.order(orderId))?.draft.customerId).toBe(customer.id);
          expect(
            (
              await call(
                '/orders/' + secondId,
                'PUT',
                transferPayload,
                true,
                transferKey,
                changed.version,
              )
            ).status,
          ).toBe(200);
          const reopenedResponse = await call(
            '/orders/' + orderId,
            'PUT',
            { ...closed.draft, action: 'reopen' },
            true,
            randomUUID(),
            closed.version,
          );
          expect(reopenedResponse.status).toBe(200);
          expect((await reopenedResponse.json()).status).toBe('OPEN');
          expect((await tx.order(orderId))?.draft.customerId).toBe(customer.id);
        },
        undefined,
        true,
      );
      expect(await repo.run((tx) => tx.order(orderId))).toBeUndefined();
      expect(await repo.run((tx) => tx.userById(userId))).toBeUndefined();
    } finally {
      config.sql.retryBudgetMs = oldBudget;
    }
  },
  90000,
);
