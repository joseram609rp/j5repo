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
            paymentMethod: 'CASH' as const, electronicInvoice: false, notes: 'Frenos revisados',
            recommendations: '',
            items: [
              { description: 'Servicio', price: 100.1, notes: 'Observación de servicio' },
              { description: 'Ajuste', price: 0.2 },
            ],
          };
          const first = await call('/orders/' + orderId, 'PUT', draft);
          expect(first.status, diagnostic).toBe(200);
          let open: Order = await first.json();
          expect(open.openedAt).toBeTruthy();
          expect(open.mechanicId).toBe(userId);
          expect(open.totalAmount).toBe(113.34);expect(open.subtotalAmount).toBe(100.3);expect(open.taxAmount).toBe(13.04);expect(open.taxRate).toBe(13);expect(open.draft.items?.find(i=>i.description==='Servicio')?.notes).toBe('Observación de servicio');
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
            false,
          );
          expect(secondResponse.status).toBe(200);
          const second: Order = await secondResponse.json();
          expect(second.mechanicId).toBe(userId);
          expect(open.mechanicId).toBe(userId);
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
                { ...draft, action: 'close', model: '' },
                false,
                randomUUID(),
                open.version,
              )
            ).status,
          ).toBe(400);
          expect((await call('/orders?status=CLOSED')).status).toBe(400);
          expect((await call('/orders/'+orderId,'PUT',{...draft,mechanicId:adminId},false,randomUUID(),open.version)).status).toBe(403);
          const assignmentKey=randomUUID(), assignmentVersion=open.version, assignmentDraft={...draft,mechanicId:adminId};
          const reassigned=await call('/orders/'+orderId,'PUT',assignmentDraft,true,assignmentKey,assignmentVersion);
          expect(reassigned.status,diagnostic).toBe(200);open=await reassigned.json();expect(open.mechanicId).toBe(adminId);
          expect(await (await call('/orders/'+orderId,'PUT',assignmentDraft,true,assignmentKey,assignmentVersion)).json()).toEqual(open);
          const audit=(await tx.query<{actor_id:string;action:string;entity_id:string}>('SELECT actor_id,action,entity_id FROM dbo.AuditLogs WHERE entity_id=@id AND action=@action',{id:orderId,action:'ORDER_MECHANIC_CHANGED'})).recordset;
          expect(audit).toHaveLength(1);expect(audit[0]!.actor_id.toLowerCase()).toBe(adminId);
          const closeKey = randomUUID(),
            payload = { ...draft, action: 'close' };
          expect((await call('/orders/'+orderId,'PUT',payload,false,randomUUID(),open.version)).status).toBe(403);
          for(const missing of [{paymentMethod:undefined},{electronicInvoice:undefined}]) expect((await call('/orders/'+orderId,'PUT',{...payload,...missing},true,randomUUID(),open.version)).status).toBe(400);
          const closedResponse = await call(
            '/orders/' + orderId,
            'PUT',
            payload,
            true,
            closeKey,
            open.version,
          );
          expect(closedResponse.status).toBe(200);
          const closed: Order = await closedResponse.json();
          expect(closed.status).toBe('CLOSED');expect(closed.draft.electronicInvoice).toBe(false);expect(closed.draft.paymentMethod).toBe('CASH');
          expect((await call('/orders/'+orderId,'PUT',{...closed.draft,mechanicId:userId,action:'admin-edit'},true,randomUUID(),closed.version)).status).toBe(409);
          expect(closed.closedAt).toBeTruthy();
          expect(closed.totalAmount).toBe(113.34);
          expect(
            await (
              await call(
                '/orders/' + orderId,
                'PUT',
                payload,
                true,
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
          const reopened: Order = await reopenedResponse.json();
          expect(reopened.status).toBe('OPEN');
          expect(reopened.closedAt).toBeNull();
          expect(reopened.version).not.toBe(closed.version);
          expect(reopenedResponse.headers.get('etag')).toBe('"' + reopened.version + '"');
          expect(reopened.draft).toEqual(closed.draft);
          expect(reopened.mechanicId).toBe(closed.mechanicId);
          expect(reopened.taxRate).toBe(closed.taxRate);
          expect(reopened.totalAmount).toBe(closed.totalAmount);
          expect((await tx.order(orderId))?.draft.customerId).toBe(customer.id);
          const operationalId=randomUUID();
          const created=await call('/orders/'+operationalId,'PUT',draft);
          const operational:Order=await created.json();expect(created.status,diagnostic).toBe(200);
          const snapshot=async()=>({
            items:(await tx.query('SELECT id,description,price FROM dbo.OrderItems WHERE order_id=@id ORDER BY id',{id:operationalId})).recordset,
            customer:(await tx.query('SELECT * FROM dbo.Customers WHERE id=@id',{id:operational.draft.customerId!})).recordset,
            vehicle:(await tx.query('SELECT * FROM dbo.Vehicles WHERE id=@id',{id:operational.draft.vehicleId!})).recordset,
            history:(await tx.query('SELECT * FROM dbo.Orders WHERE id=@id',{id:orderId})).recordset,
          });
          const before=await snapshot();
          const assignment={...operational.draft,action:'assign-mechanic',mechanicId:adminId};
          expect((await call('/orders/'+operationalId,'PUT',assignment,false,randomUUID(),operational.version)).status).toBe(403);
          const assignedResponse=await call('/orders/'+operationalId,'PUT',assignment,true,randomUUID(),operational.version);
          expect(assignedResponse.status,diagnostic).toBe(200);const assigned:Order=await assignedResponse.json();
          expect(assigned.mechanicId).toBe(adminId);expect(assigned.version).not.toBe(operational.version);
          expect(assignedResponse.headers.get('etag')).toBe('"'+assigned.version+'"');expect(await snapshot()).toEqual(before);
          const liveList=await (await call('/orders?status=OPEN&q='+encodeURIComponent(suffix))).json();
          expect(liveList.orders.find((o:Order)=>o.id===operationalId).mechanicId).toBe(adminId);
          const cancel={...assigned.draft,action:'void'};
          expect((await call('/orders/'+operationalId,'PUT',cancel,false,randomUUID(),operational.version)).status).toBe(412);
          expect((await call('/orders/'+operationalId,'PUT',cancel,false,randomUUID(),assigned.version)).status).toBe(403);
          const key=randomUUID(),voidResponse=await call('/orders/'+operationalId,'PUT',cancel,true,key,assigned.version);
          expect(voidResponse.status,diagnostic).toBe(200);const voided:Order=await voidResponse.json();expect(voided.status).toBe('VOID');
          expect(await snapshot()).toEqual(before);expect(voided.draft).toEqual(operational.draft);
          expect((await call('/orders/'+operationalId,'PUT',cancel,true,key,assigned.version)).status).toBe(200);
          expect((await call('/orders/'+operationalId,'PUT',cancel,true,randomUUID(),voided.version)).status).toBe(409);
          expect((await call('/orders/'+operationalId,'PUT',assignment,true,randomUUID(),voided.version)).status).toBe(409);
          expect((await (await call('/orders?status=OPEN&q='+encodeURIComponent(suffix))).json()).orders.some((o:Order)=>o.id===operationalId)).toBe(false);
          expect((await tx.query('SELECT action FROM dbo.AuditLogs WHERE entity_id=@id',{id:operationalId})).recordset.map(r=>r.action)).toEqual(expect.arrayContaining(['ORDER_MECHANIC_CHANGED','ORDER_VOIDED']));
          const ownId=randomUUID(), ownResponse=await call('/orders/'+ownId,'PUT',draft),own:Order=await ownResponse.json();
          expect((await call('/orders/'+ownId,'PUT',{...own.draft,action:'void'},false,randomUUID(),own.version)).status).toBe(200);
          const closedId=randomUUID(), terminalCreated=await call('/orders/'+closedId,'PUT',draft), terminalOpen:Order=await terminalCreated.json();
          const terminalResponse=await call('/orders/'+closedId,'PUT',{...terminalOpen.draft,action:'close'},false,randomUUID(),terminalOpen.version), closedFixture:Order=await terminalResponse.json();
          expect(terminalResponse.status,diagnostic).toBe(200);
          for(const action of ['void','assign-mechanic']) expect((await call('/orders/'+closedId,'PUT',{...closedFixture.draft,action,mechanicId:adminId},true,randomUUID(),closedFixture.version)).status).toBe(409);

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

it.skipIf(!enabled)('SQL history: accent-insensitive partial names, literal patterns, exact identity and 50-row pages (rollback)',async()=>{
 const repo=new SqlRepository(),userId=randomUUID(),customerId=randomUUID(),vehicleId=randomUUID();
 const suffix=randomUUID().slice(0,8), name='José Ramírez '+suffix, plate='HIS'+String(randomInt(0,1000)).padStart(3,'0'), identification=String(randomInt(100000000,999999999));
 const rows=Array.from({length:55},()=>({id:randomUUID()}));
 await repo.runSql(async tx=>{
  await tx.insertUser({id:userId,username:'history-'+suffix,fullName:'History fixture',passwordHash:'unused',role:'MECHANIC',active:true});
  await tx.query("INSERT dbo.Customers(id,full_name,identification,phone) VALUES(@id,@name,@identification,'88888888')",{id:customerId,name,identification});
  await tx.query("INSERT dbo.Vehicles(id,owner_id,plate,make,model,year) VALUES(@id,@owner,@plate,'Toyota','Corolla',2035)",{id:vehicleId,owner:customerId,plate});
  const params={rows:JSON.stringify(rows),userId,customerId,vehicleId,name,plate,data:JSON.stringify({identification,phone:'88888888',make:'Toyota',model:'Corolla',year:2035})};
  await tx.query(`INSERT dbo.Orders(id,customer_id,vehicle_id,mechanic_id,draft_data,customer_name_snapshot,plate_snapshot,mileage,notes,recommendations)
    SELECT id,@customerId,@vehicleId,@userId,@data,@name,@plate,0,N'',N'' FROM OPENJSON(@rows) WITH(id uniqueidentifier '$.id');
    INSERT dbo.OrderItems(id,order_id,description,price) SELECT NEWID(),id,N'Servicio',1 FROM OPENJSON(@rows) WITH(id uniqueidentifier '$.id');
    UPDATE o SET status='CLOSED',total_amount=1,closed_at=SYSUTCDATETIME() FROM dbo.Orders o JOIN OPENJSON(@rows) WITH(id uniqueidentifier '$.id') r ON r.id=o.id;`,params);
  const search='Jose Ramirez '+suffix;
  const first=await tx.listOrders('CLOSED',search);expect(first).toHaveLength(50);expect(first.every(o=>o.taxRate===0 && o.taxAmount===0 && o.totalAmount===1)).toBe(true);
  const second=await tx.listOrders('CLOSED',search,first.at(-1)!.id);expect(second).toHaveLength(5);
  expect(new Set([...first,...second].map(o=>o.id)).size).toBe(55);
  expect(await tx.listOrders('CLOSED',suffix+'%_[')).toEqual([]);
  expect((await tx.listOrders('CLOSED',identification)).filter(o=>rows.some(r=>r.id===o.id))).toHaveLength(50);
  expect((await tx.listOrders('CLOSED',plate.toLowerCase().slice(0,3)+'-'+plate.slice(3))).filter(o=>rows.some(r=>r.id===o.id))).toHaveLength(50);
  expect((await tx.listOrders('CLOSED',identification.slice(0,-1))).some(o=>rows.some(r=>r.id===o.id))).toBe(false);
  expect((await tx.listOrders('CLOSED',plate.slice(0,-1))).some(o=>rows.some(r=>r.id===o.id))).toBe(false);
  expect((await tx.findCustomers(search)).map(c=>c.id)).toContain(customerId);
  expect(await tx.findVehicles(plate.slice(0,-1))).toEqual([]);
  for(const year of [1950,2028,2035,100000,2147483647]){
   await tx.query('UPDATE dbo.Vehicles SET year=@year WHERE id=@id',{year,id:vehicleId});
   expect((await tx.findVehicles(plate))[0]!.year).toBe(year);
  }
 },undefined,true);
 expect(await repo.run(tx=>tx.order(rows[0]!.id))).toBeUndefined();
},60000);
it.skipIf(!enabled)('SQL year constraint rejects 1949 without changing real data',async()=>{
 const repo=new SqlRepository();
 await expect(repo.runSql(async tx=>{
  const customerId=randomUUID();
  await tx.query("INSERT dbo.Customers(id,full_name,identification,phone) VALUES(@id,N'Year fixture',@identification,'88888888')",{id:customerId,identification:String(randomInt(100000000,999999999))});
  await tx.query("INSERT dbo.Vehicles(id,owner_id,plate,make,model,year) VALUES(@id,@owner,@plate,'Toyota','Corolla',1949)",{id:randomUUID(),owner:customerId,plate:'YER'+String(randomInt(0,1000)).padStart(3,'0')});
 },undefined,true)).rejects.toMatchObject({number:547});
},60000);

it.skipIf(!enabled)('SQL rounds IVA by line and persists optional work notes without changing base prices (rollback)',async()=>{
 const repo=new SqlRepository(), userId=randomUUID(),id=randomUUID();
 await repo.runSql(async tx=>{
  await tx.insertUser({id:userId,username:'iva-'+randomUUID().slice(0,8),fullName:'IVA fixture',passwordHash:'unused-fixture',role:'MECHANIC',active:true});
  const draft={customerName:'IVA fixture',plate:'',mileage:null,notes:'',recommendations:'',items:[{description:'A',price:.05,notes:'Detalle opcional'},{description:'B',price:.05}]};
  const saved=await tx.saveOrder(id,userId,draft);expect(saved.subtotalAmount).toBe(.1);expect(saved.taxAmount).toBe(.02);expect(saved.totalAmount).toBe(.12);
  expect(saved.draft.items?.find(i=>i.description==='A')).toEqual({description:'A',price:.05,notes:'Detalle opcional'});
  expect(saved.draft.items?.find(i=>i.description==='B')?.notes).toBe('');
 },undefined,true);expect(await repo.run(tx=>tx.order(id))).toBeUndefined();
},60000);
it.skipIf(!enabled).each([{paymentMethod:undefined},{electronicInvoice:undefined}])('SQL refuses new taxed CLOSED orders missing billing %j (rollback)',async missing=>{
 const repo=new SqlRepository(),userId=randomUUID(),id=randomUUID();
 await expect(repo.runSql(async tx=>{
  await tx.insertUser({id:userId,username:'billing-'+randomUUID().slice(0,8),fullName:'Billing fixture',passwordHash:'unused-fixture',role:'MECHANIC',active:true});
  const draft={customerName:'Billing fixture',identification:String(randomInt(100000000,999999999)),phone:'88888888',plate:'BIL'+String(randomInt(0,1000)).padStart(3,'0'),make:'Toyota',model:'Corolla',year:2020,mileage:0,notes:'',recommendations:'',paymentMethod:'CASH' as const,electronicInvoice:false,items:[{description:'Servicio',price:1}],...missing};
  const open=await tx.saveOrder(id,userId,draft);await tx.saveOrder(id,userId,{...draft,action:'close'},open);
 },undefined,true)).rejects.toMatchObject({number:547});expect(await repo.run(tx=>tx.order(id))).toBeUndefined();
},60000);
