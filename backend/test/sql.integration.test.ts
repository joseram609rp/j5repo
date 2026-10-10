import { config } from '../src/config.js';
import { expect, it } from 'vitest';
import { randomInt, randomUUID } from 'node:crypto';
import { createApi, tokenHash } from '../src/api.js';
import { hashPassword } from '../src/password.js';
import { SqlRepository } from '../src/sql.js';
import type { Repository } from '../src/domain.js';

const enabled = process.env.J5_SQL_INTEGRATION === '1';
const sql = new SqlRepository();
const origin = 'http://localhost:5173';
it.skipIf(!enabled)('executes auth, receipts, rowversion and historical customer against SQL, then rolls back all fixtures', async () => {
  // This fixture groups dozens of API requests in one rollback-only transaction.
  // Its aggregate duration is not the production budget for an individual request.
  const requestBudget = config.sql.retryBudgetMs;
  config.sql.retryBudgetMs = 55000;
  try {
  const adminId = randomUUID(); const mechanicId = randomUUID();
  const customerId = randomUUID(); const nextOwnerId = randomUUID(); const vehicleId = randomUUID(); const orderId = randomUUID();
  const username = 'sql-test-' + randomUUID().slice(0, 8);
  const password = 'Fixture-' + randomUUID();
  const identification=String(randomInt(100000000,999999999)); const nextIdentification=String(randomInt(100000000,999999999)); const plate='SQL'+String(randomInt(0,1000)).padStart(3,'0');
  const passwordHash = await hashPassword(password);
  await sql.runSql(async tx => {
    await tx.insertUser({ id: adminId, username, fullName: 'Test user', passwordHash, role: 'ADMIN', active: true });
    await tx.insertUser({ id: mechanicId, username: username + '-m', fullName: 'Test user', passwordHash, role: 'MECHANIC', active: true });
    await tx.query("INSERT dbo.Customers(id,full_name,identification,phone) VALUES(@a,N'Integration fixture',@identification,'88888888'),(@b,N'Next owner fixture',@nextIdentification,'88888888')", { a: customerId, b: nextOwnerId, identification, nextIdentification });
    await tx.query("INSERT dbo.Vehicles(id,owner_id,plate,make,model,year) VALUES(@id,@owner,@plate,'Toyota','Corolla',2020)", { id: vehicleId, owner: customerId, plate });
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
    const draft = { customerName: 'Integration fixture', plate, mileage: null, paymentMethod: 'CASH' as const, electronicInvoice: false, notes: '', recommendations: '', vehicleId };
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
    expect((await save(key, undefined, { ...draft, paymentMethod: 'CASH' as const, electronicInvoice: false, notes: 'changed' })).status).toBe(409);
    expect((await save(randomUUID())).status).toBe(428);
    await tx.query('UPDATE dbo.Vehicles SET owner_id=@owner WHERE id=@id', { owner: nextOwnerId, id: vehicleId });
    const update = await save(randomUUID(), etag);
    expect(update.status).toBe(200);
    expect((await update.json()).draft.customerId).toBe(customerId);
    expect((await save(randomUUID(), etag)).status).toBe(412);
    const closeDraft={...draft,ownerResolution:{decision:'keep',vehicleId,customerId,expectedOwnerId:nextOwnerId},paymentMethod: 'CASH' as const, electronicInvoice: false, notes: 'Frenos revisados',identification,phone:'88888888',make:'Toyota',model:'Corolla',year:2020,mileage:100,items:[{description:'Frenos',price:100.10},{description:'Ajuste',price:0.20}],action:'close'};
    const latest=(await tx.order(orderId))!;
    const close=(payload:unknown,expected=latest.version)=>call('/orders/'+orderId,'PUT',payload,{...mechanic.headers,'idempotency-key':randomUUID(),'if-match':'"'+expected+'"'});
    expect((await close({...closeDraft,items:[]})).status).toBe(400);
    expect((await close({...closeDraft,mileage:null})).status).toBe(400);
    for (const missing of [{customerName:'   '},{year:null},{model:''}]) expect((await close({...closeDraft,...missing})).status).toBe(400);
    expect((await close({...closeDraft,totalAmount:1})).status).toBe(400);
    const closedResponse=await close(closeDraft);
    expect(closedResponse.status).toBe(200);
    const closed=await closedResponse.json();
    expect(closed.totalAmount).toBe(113.34);
    expect(closed.status).toBe('CLOSED');
    expect(closed.closedAt).toBeTruthy();
    expect(closed.displayOrderId).toMatch(/^OT-\d{8}-\d{2,}$/);
    expect((await close({...closeDraft,action:undefined},closed.version)).status).toBe(409);
    expect((await close({...closeDraft,action:'reopen'},closed.version)).status).toBe(403);
    const edited=await call('/orders/'+orderId,'PUT',{...closeDraft,paymentMethod: 'CASH' as const, electronicInvoice: false, notes: 'Admin correction',action:'admin-edit'},{...admin.headers,'idempotency-key':randomUUID(),'if-match':'"'+closed.version+'"'});
    expect(edited.status).toBe(200);
    const editedData=await edited.json();expect(editedData.status).toBe('CLOSED');expect(editedData.closedAt).toBe(closed.closedAt);
    const reopened=await call('/orders/'+orderId,'PUT',{...closeDraft,action:'reopen'},{...admin.headers,'idempotency-key':randomUUID(),'if-match':'"'+editedData.version+'"'});
    expect(reopened.status).toBe(200);
    expect((await reopened.json()).status).toBe('OPEN');
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
  } finally { config.sql.retryBudgetMs = requestBudget; }
}, 90000);

it.skipIf(!enabled)('database rejects closing an order without mileage; rolls back fixture transaction', async () => {
  const id = randomUUID(); const customerId = randomUUID(); const vehicleId = randomUUID();
  const plate='SQL'+String(randomInt(0,1000)).padStart(3,'0');
  const identification=String(randomInt(100000000,999999999));
  const passwordHash = await hashPassword('Fixture-' + randomUUID());
  await expect(sql.runSql(async tx => {
    await tx.insertUser({ id, username: 'constraint-' + randomUUID().slice(0, 8), fullName: 'Test user', passwordHash, role: 'MECHANIC', active: true });
    await tx.query("INSERT dbo.Customers(id,full_name,identification,phone) VALUES(@id,N'Fixture',@identification,'88888888')", { id: customerId, identification });
    await tx.query("INSERT dbo.Vehicles(id,owner_id,plate,make,model,year) VALUES(@id,@owner,@plate,'Toyota','Corolla',2020)", { id: vehicleId, owner: customerId, plate: 'SQL123' });
    const order = await tx.saveOrder(randomUUID(), id, { customerId, vehicleId, customerName: 'Fixture', plate: 'SQL123', mileage: null, paymentMethod: 'CASH' as const, electronicInvoice: false, notes: '', recommendations: '' });
    await tx.query("UPDATE dbo.Orders SET status='CLOSED' WHERE id=@id", { id: order.id });
  }, undefined, true)).rejects.toMatchObject({ number: 547 });
  expect(await sql.run(tx => tx.userById(id))).toBeUndefined();
}, 60000);

it.skipIf(!enabled).each([
 {status:'CLOSED',query:"UPDATE dbo.Orders SET notes=N'illegal' WHERE id=@id",number:51001},
 {status:'CLOSED',query:"INSERT dbo.OrderItems(id,order_id,description,price) VALUES(NEWID(),@id,N'illegal',1)",number:51005},
 {status:'OPEN',query:"UPDATE dbo.Orders SET total_amount=999 WHERE id=@id",number:51003}
])('SQL guard rejects direct mutation $number and rolls back fixture',async test=>{
 const userId=randomUUID();const orderId=randomUUID();const passwordHash=await hashPassword('Fixture-'+randomUUID());
 await expect(sql.runSql(async tx=>{
  await tx.insertUser({id:userId,username:'guard-'+randomUUID().slice(0,8),fullName:'Guard fixture',passwordHash,role:'MECHANIC',active:true});
  const draft={customerName:'Guard fixture',identification:String(randomInt(100000000,999999999)),phone:'88888888',plate:'GRD'+String(randomInt(0,1000)).padStart(3,'0'),make:'Toyota',model:'Corolla',year:2020,mileage:0,paymentMethod: 'CASH' as const, electronicInvoice: false, notes: 'Frenos revisados',recommendations:'',items:[{description:'Frenos',price:1}]};
  const open=await tx.saveOrder(orderId,userId,draft);
  if(test.status==='CLOSED') await tx.saveOrder(orderId,userId,{...draft,action:'close'},open);
  await tx.query(test.query,{id:orderId});
 },undefined,true)).rejects.toMatchObject({number:test.number});
 expect(await sql.run(tx=>tx.userById(userId))).toBeUndefined();
},60000);

 it.skipIf(!enabled)('persists model end-to-end and preserves legacy unknown model until explicit closing',async()=>{
  const userId=randomUUID();const orderId=randomUUID();
  await sql.runSql(async tx=>{
   await tx.insertUser({id:userId,username:'model-'+randomUUID().slice(0,8),fullName:'Model fixture',passwordHash:await hashPassword('Fixture-'+randomUUID()),role:'MECHANIC',active:true});
   const draft={customerName:'Model fixture',identification:String(randomInt(100000000,999999999)),phone:'88888888',plate:'MDL'+String(randomInt(0,1000)).padStart(3,'0'),make:'Toyota',model:'Hilux',year:2020,mileage:0,paymentMethod: 'CASH' as const, electronicInvoice: false, notes: 'Frenos revisados',recommendations:'',items:[{description:'Frenos',price:125000}]};
   const open=await tx.saveOrder(orderId,userId,draft);
   expect(open.draft.model).toBe('Hilux');expect(open.totalAmount).toBe(141250);
   const vehicleId=open.draft.vehicleId!;
   expect((await tx.query<{model:string}>('SELECT model FROM dbo.Vehicles WHERE id=@id',{id:vehicleId})).recordset[0]!.model).toBe('Hilux');
   const nullable=(await tx.query<{is_nullable:boolean}>("SELECT is_nullable FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Vehicles') AND name='model'")).recordset[0]!.is_nullable;
   if(nullable) {
    await tx.query('UPDATE dbo.Vehicles SET model=NULL WHERE id=@id',{id:vehicleId});
    const updated=await tx.saveOrder(orderId,userId,draft,open);
    expect((await tx.query<{model:null}>('SELECT model FROM dbo.Vehicles WHERE id=@id',{id:vehicleId})).recordset[0]!.model).toBeNull();
    await tx.saveOrder(orderId,userId,{...draft,action:'close'},updated);
    expect((await tx.query<{model:string}>('SELECT model FROM dbo.Vehicles WHERE id=@id',{id:vehicleId})).recordset[0]!.model).toBe('Hilux');
   }
  },undefined,true);
  expect(await sql.run(tx=>tx.order(orderId))).toBeUndefined();
 },60000);

it.skipIf(!enabled).each(['','   ','\t\n','\u00a0'])('SQL permits CLOSED with optional notes %j and rolls back',async notes=>{
 const userId=randomUUID();const orderId=randomUUID();
 await sql.runSql(async tx=>{
  await tx.insertUser({id:userId,username:'notes-'+randomUUID().slice(0,8),fullName:'Notes fixture',passwordHash:await hashPassword('Fixture-'+randomUUID()),role:'MECHANIC',active:true});
  const draft={customerName:'Notes fixture',identification:String(randomInt(100000000,999999999)),phone:'88888888',plate:'NTS'+String(randomInt(0,1000)).padStart(3,'0'),make:'Toyota',model:'Corolla',year:2020,mileage:128400,paymentMethod:'CASH' as const,electronicInvoice:false,notes,recommendations:'',items:[{description:'Frenos',price:1}]};
  const open=await tx.saveOrder(orderId,userId,draft);expect(open.status).toBe('OPEN');expect(open.draft.notes).toBe(notes);expect(open.draft.mileage).toBe(128400);
  const closed=await tx.saveOrder(orderId,userId,{...draft,action:'close'},open);expect(closed.status).toBe('CLOSED');expect(closed.draft.notes).toBe(notes);
 },undefined,true);
 expect(await sql.run(tx=>tx.order(orderId))).toBeUndefined();
},60000);

it.skipIf(!enabled)('catalog schema, counts, samples, authentication and idle behavior against SQL, rollback only', async()=>{
 await sql.runSql(async tx=>{
  const catalog=await tx.vehicleCatalog();expect(catalog.makes).toHaveLength(57);expect(catalog.makes.reduce((n,m)=>n+m.models.length,0)).toBe(986);
  for(const [make,models] of [['Toyota',['Hilux','Fortuner']],['Suzuki',['Jimny']]] as const) expect(catalog.makes.find(m=>m.name===make)?.models).toEqual(expect.arrayContaining([...models]));
  for(const make of ['BYD','Geely','Changan']) expect(catalog.makes.some(m=>m.name===make)).toBe(true);
  expect((await tx.query('SELECT normalized_name FROM dbo.VehicleMakes GROUP BY normalized_name HAVING COUNT(*)>1')).recordset).toHaveLength(0);
  expect((await tx.query('SELECT make_id,normalized_name FROM dbo.VehicleModels GROUP BY make_id,normalized_name HAVING COUNT(*)>1')).recordset).toHaveLength(0);
  expect((await tx.query('SELECT v.id FROM dbo.VehicleModels v LEFT JOIN dbo.VehicleMakes m ON m.id=v.make_id WHERE m.id IS NULL')).recordset).toHaveLength(0);
  const id=randomUUID(),token='a'.repeat(43);const hash=tokenHash(token);
  await tx.insertUser({id,username:'cat-'+randomUUID().slice(0,8),fullName:'Catalog fixture',passwordHash:'unused',role:'MECHANIC',active:true});
  const before=await tx.time();await tx.insertSession({tokenHash:hash,userId:id,csrf:'fixture',lastActivity:before,revoked:false});
  const api=createApi({repository:{run:work=>work(tx)},origin});
  expect((await api(new Request(origin+'/api/vehicle-catalog'))).status).toBe(401);
  const response=await api(new Request(origin+'/api/vehicle-catalog',{headers:{cookie:'j5_session='+token}}));expect(response.status).toBe(200);expect(await response.json()).toEqual(catalog);expect((await tx.session(hash))?.lastActivity).toBe(before);
 },undefined,true);
},60000);

it.skipIf(!enabled)('rejected close rolls back entity creation before persisting its idempotent receipt without consuming order numbers',async()=>{
 const userId=randomUUID(),customerId=randomUUID(),vehicleId=randomUUID(),orderId=randomUUID();
 await sql.runSql(async tx=>{
  const sequenceBefore=(await tx.query("SELECT CONVERT(varchar(30),current_value) AS n FROM sys.sequences WHERE name='OrderNumber'")).recordset[0].n;
  const identification=String(randomInt(100000000,999999999)),nextIdentification=String(randomInt(100000000,999999999));
  const token=randomUUID().replaceAll('-','')+'a'.repeat(11),hash=tokenHash(token),key=randomUUID();
  await tx.insertUser({id:userId,username:'atomic-'+randomUUID().slice(0,8),fullName:'Atomic fixture',passwordHash:'unused',role:'MECHANIC',active:true});
  await tx.insertSession({tokenHash:hash,userId,csrf:'fixture',lastActivity:await tx.time(),revoked:false});
  await tx.query("INSERT dbo.Customers(id,full_name,identification,phone) VALUES(@id,N'Fixture',@identification,'88888888')",{id:customerId,identification});
  await tx.query("INSERT dbo.Vehicles(id,owner_id,plate,make,model,year) VALUES(@id,@owner,'ATM999','Toyota','Hilux',2020)",{id:vehicleId,owner:customerId});
  const draft={customerName:'Fixture',identification,phone:'88888888',plate:'ATM999',make:'Toyota',model:'Hilux',year:2020,mileage:1,notes:'',recommendations:'',customerId,vehicleId,items:[],paymentMethod:'CASH',electronicInvoice:false};
  await tx.query("INSERT dbo.Orders(id,order_number,customer_id,vehicle_id,mechanic_id,draft_data,customer_name_snapshot,plate_snapshot,mileage,notes,recommendations,tax_rate) VALUES(@id,@number,@customer,@vehicle,@mechanic,@data,N'Fixture','ATM999',1,'','',13)",{id:orderId,number:900000000+randomInt(10000000),customer:customerId,vehicle:vehicleId,mechanic:userId,data:JSON.stringify(draft)});
  const before=(await tx.order(orderId))!;
  const api=createApi({repository:{run:work=>work(tx)},origin});
  const next={...draft,customerId:undefined,identification:nextIdentification,plate:'ATM998',items:[{description:'Fixture',price:1}],action:'close'};
  const call=()=>api(new Request(origin+'/api/orders/'+orderId,{method:'PUT',headers:{origin,'content-type':'application/json',cookie:'j5_session='+token,'x-csrf-token':'fixture','idempotency-key':key,'if-match':'"'+before.version+'"'},body:JSON.stringify(next)}));
  const response=await call();expect(response.status).toBe(409);expect(await response.json()).toEqual({code:'ORDER_IDENTITY_MISMATCH'});
  expect((await tx.query('SELECT id FROM dbo.Customers WHERE identification=@identification',{identification:nextIdentification})).recordset).toHaveLength(0);
  expect(await tx.order(orderId)).toEqual(before);expect(await tx.receipt(userId,key)).toBeDefined();expect((await call()).status).toBe(409);
  const accepted=await api(new Request(origin+'/api/orders/'+orderId,{method:'PUT',headers:{origin,'content-type':'application/json',cookie:'j5_session='+token,'x-csrf-token':'fixture','idempotency-key':randomUUID(),'if-match':'"'+before.version+'"'},body:JSON.stringify({...draft,items:[{description:'Fixture',price:1}],action:'close'})}));
  expect(accepted.status).toBe(200);expect(await accepted.json()).toMatchObject({status:'CLOSED',totalAmount:1.13});
  expect((await tx.query("SELECT CONVERT(varchar(30),current_value) AS n FROM sys.sequences WHERE name='OrderNumber'")).recordset[0].n).toBe(sequenceBefore);
 },undefined,true);
 expect(await sql.run(tx=>tx.order(orderId))).toBeUndefined();expect(await sql.run(tx=>tx.userById(userId))).toBeUndefined();
},60000);
it.skipIf(!enabled)('active catalog counts may change without breaking reads and preserve the seed after rollback',async()=>{
 await sql.runSql(async tx=>{
  const initial=await tx.vehicleCatalog();
  await tx.query('UPDATE dbo.VehicleModels SET active=0 WHERE id=(SELECT MIN(id) FROM dbo.VehicleModels)');
  const catalog=await tx.vehicleCatalog();expect(catalog.version).toBe(1);expect(catalog.makes.reduce((n,m)=>n+m.models.length,0)).toBe(985);
  await tx.query('UPDATE dbo.VehicleMakes SET active=0 WHERE id=(SELECT MIN(id) FROM dbo.VehicleMakes)');
  expect((await tx.vehicleCatalog()).makes).toHaveLength(initial.makes.length-1);
 },undefined,true);
 expect(await sql.run(tx=>tx.vehicleCatalog())).toMatchObject({version:1});
},60000);
it.skipIf(!enabled)('SQL lockout, canonical duplicates, admin reset/unlock, safe deletion and user-list identity (rollback only)',async()=>{
 const oldBudget=config.sql.retryBudgetMs;config.sql.retryBudgetMs=100000;
 const password='SQL-fixture-only-123!',passwordHash=await hashPassword(password),adminId=randomUUID(),userId=randomUUID(),suffix=randomUUID().slice(0,8),username='lock-'+suffix;
 try{await sql.runSql(async tx=>{
  await tx.insertUser({id:adminId,username:'admin-'+suffix,fullName:'Fixture admin',role:'ADMIN',active:true,passwordHash});
  await tx.insertUser({id:userId,username,fullName:'Fixture user',role:'MECHANIC',active:true,passwordHash});
  const scoped:Repository={run:work=>work(tx)};
  let api=createApi({repository:scoped,origin});
  const call=(path:string,method='GET',body?:unknown,headers:Record<string,string>={})=>api(new Request(origin+'/api'+path,{method,headers:{origin,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  const login=(name=username,pwd=password)=>call('/auth/login','POST',{username:name,password:pwd});
  const admin=await login('admin-'+suffix);const data=await admin.json();const headers={cookie:admin.headers.get('set-cookie')!.split(';')[0]!,'x-csrf-token':data.csrf,'idempotency-key':randomUUID()};
  for(let i=0;i<4;i++)expect((await login(username,'incorrect')).status).toBe(401);
  expect(await tx.userById(userId)).toMatchObject({active:true,failedLoginAttempts:4,lockedUntil:null});
  const before=await tx.time();expect((await login(username,'incorrect')).status).toBe(401);const locked=(await tx.userById(userId))!;
  expect(locked.lockedUntil!-before).toBeGreaterThanOrEqual(900000);expect(locked.lockedUntil!-before).toBeLessThan(902000);
  api=createApi({repository:scoped,origin});expect((await login()).status).toBe(401);expect((await tx.userById(userId))!.failedLoginAttempts).toBe(5);
  await tx.query('UPDATE dbo.Users SET locked_until=DATEADD(second,-1,SYSUTCDATETIME()) WHERE id=@id',{id:userId});expect((await login()).status).toBe(200);expect(await tx.userById(userId)).toMatchObject({failedLoginAttempts:0,lockedUntil:null});
  for(let i=0;i<2;i++)await login(username,'incorrect');expect((await login()).status).toBe(200);expect((await tx.userById(userId))!.failedLoginAttempts).toBe(0);
  const patch=(body:unknown)=>call('/admin/users/'+userId,'PATCH',body,{...headers,'idempotency-key':randomUUID()});
  await tx.query('UPDATE dbo.Users SET failed_login_attempts=5,locked_until=DATEADD(minute,15,SYSUTCDATETIME()) WHERE id=@id',{id:userId});expect((await patch({unlock:true})).status).toBe(200);expect(await tx.userById(userId)).toMatchObject({failedLoginAttempts:0,lockedUntil:null});
  await tx.query('UPDATE dbo.Users SET failed_login_attempts=5,locked_until=DATEADD(minute,15,SYSUTCDATETIME()) WHERE id=@id',{id:userId});expect((await patch({password:'Reset-fixture-only-123!'})).status).toBe(200);expect(await tx.userById(userId)).toMatchObject({failedLoginAttempts:0,lockedUntil:null});
  expect((await tx.query<{count:number}>('SELECT COUNT(*) AS count FROM dbo.Sessions WHERE user_id=@id AND revoked_at IS NULL',{id:userId})).recordset[0]!.count).toBe(0);
  expect((await patch({active:false})).status).toBe(200);expect((await login(username,'Reset-fixture-only-123!')).status).toBe(401);
  const remove=(id:string,key=randomUUID())=>call('/admin/users/'+id,'DELETE',undefined,{...headers,'idempotency-key':key});
  expect(await (await remove(userId)).json()).toEqual({code:'USER_HAS_HISTORY'});expect(await (await remove(adminId)).json()).toEqual({code:'CANNOT_DELETE_SELF'});
  const unused=randomUUID();await tx.insertUser({id:unused,username:'unused-'+suffix,fullName:'Unused fixture',role:'MECHANIC',active:false,passwordHash});
  const key=randomUUID();expect((await remove(unused,key)).status).toBe(200);expect(await tx.userById(unused)).toBeUndefined();expect((await remove(unused,key)).status).toBe(200);
  const users=(await (await call('/admin/users','GET',undefined,headers)).json()).users;expect(new Set(users.map((u:{id:string})=>u.id)).size).toBe(users.length);expect(users.find((u:{id:string})=>u.id===userId).canDelete).toBe(false);
  for(const name of [username,username.toUpperCase(),' '+username+' ']){const response=await call('/admin/users','POST',{username:name,fullName:'Other name',role:'ADMIN',password},{...headers,'idempotency-key':randomUUID()});expect(response.status).toBe(409);expect(await response.json()).toEqual({code:'USERNAME_EXISTS'});}
  const racing='race-'+suffix;const create=()=>call('/admin/users','POST',{username:racing,fullName:'Race fixture',role:'MECHANIC',password},{...headers,'idempotency-key':randomUUID()});
  // A shared SQL transaction requires a serialized request queue, like the real SERIALIZABLE repository.
  let queue=Promise.resolve();scoped.run=work=>{const next=queue.then(()=>work(tx));queue=next.then(()=>undefined,()=>undefined);return next;};
  expect((await Promise.all([create(),create()])).map(r=>r.status).sort()).toEqual([201,409]);
 },undefined,true);}finally{config.sql.retryBudgetMs=oldBudget;}
},120000);
it.skipIf(!enabled)('SQL unique username constraint rejects the same name under a different role (rollback)',async()=>{
 const id=randomUUID(),name='unique-'+randomUUID().slice(0,8);
 await expect(sql.runSql(async tx=>{await tx.insertUser({id,username:name,fullName:'One',passwordHash:'fixture',role:'ADMIN',active:false});await tx.query("INSERT dbo.Users(id,username,full_name,password_hash,role,active) VALUES(@id,@name,'Two','fixture','MECHANIC',0)",{id:randomUUID(),name});},undefined,true)).rejects.toMatchObject({number:2627});
},15000);
it.skipIf(!enabled)('SQL accepts approved plate formats and preserves normalized lookup (rollback)',async()=>{
 await sql.runSql(async tx=>{const owner=randomUUID();await tx.query("INSERT dbo.Customers(id,full_name,identification,phone) VALUES(@id,'Plate fixture',@identification,'88888888')",{id:owner,identification:String(randomInt(100000000,999999999))});
 for(const plate of ['ABC111','ABC1234','CL111111','C111111','111111']){const existing=await tx.findVehicles(plate);if(existing.length)continue;const id=randomUUID();await tx.query("INSERT dbo.Vehicles(id,owner_id,plate,make,model,year) VALUES(@id,@owner,@plate,'Toyota','Corolla',2020)",{id,owner,plate});expect((await tx.findVehicles(plate.toLowerCase().split('').join('-')))[0]!.id).toBe(id);}
 },undefined,true);
},20000);
it.skipIf(!enabled).each(['','AB','ABC!123','ABC🚘','ABCDEFGHIJKLM','ÁBC123'])('SQL rejects invalid plate %s (rollback)',async plate=>{
 await expect(sql.runSql(async tx=>{const owner=randomUUID();await tx.query("INSERT dbo.Customers(id,full_name,identification,phone) VALUES(@id,'Plate fixture',@identification,'88888888')",{id:owner,identification:String(randomInt(100000000,999999999))});await tx.query("INSERT dbo.Vehicles(id,owner_id,plate,make,model,year) VALUES(@id,@owner,@plate,'Toyota','Corolla',2020)",{id:randomUUID(),owner,plate});},undefined,true)).rejects.toMatchObject({number:547});
},15000);
