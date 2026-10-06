import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApi, tokenHash } from '../src/api.js';
import { FakeRepository } from './fake-repository.js';
const userId = '22222222-2222-4222-8222-222222222222';
function setup() {
  const repo = new FakeRepository(),
    raw = randomBytes(32).toString('base64url'),
    origin = 'http://localhost:5173';
  repo.accounts.set(userId, {
    id: userId,
    username: 'fixture',
    fullName: 'Fixture',
    passwordHash: 'unused',
    role: 'MECHANIC',
    active: true,
  });
  repo.sessions.set(tokenHash(raw), {
    tokenHash: tokenHash(raw),
    userId,
    csrf: 'fixture',
    lastActivity: repo.clock,
    revoked: false,
  });
  const api = createApi({ repository: repo, origin });
  const call = (path: string, cookie = true) =>
    api(
      new Request(origin + '/api' + path, {
        headers: cookie ? { cookie: 'j5_session=' + raw } : {},
      }),
    );
  return { repo, call };
}
it('lists orders from any mechanic, filters CLOSED history and requires auth', async () => {
  const { repo, call } = setup();
  const a = await repo.saveOrder(randomUUID(), 'another-mechanic', {
    customerName: 'Ana',
    identification: '123456789',
    plate: 'ABC123',
    mileage: 0,
    notes: 'Revisado',
    recommendations: '',
  });
  const b = await repo.saveOrder(randomUUID(), userId, {
    customerName: 'Beto',
    plate: 'XYZ987',
    mileage: 0,
    notes: 'Revisado',
    recommendations: '',
    action: 'close',
  });
  expect((await call('/orders', false)).status).toBe(401);
  expect(
    (await (await call('/orders?status=OPEN')).json()).orders.map(
      (o: { id: string }) => o.id,
    ),
  ).toEqual([a.id]);
  expect(
    (await (await call('/orders?status=CLOSED&q=XYZ987')).json()).orders.map(
      (o: { id: string }) => o.id,
    ),
  ).toEqual([b.id]);
  expect(
    (await (await call('/orders?status=CLOSED&q=nobody')).json()).orders,
  ).toEqual([]);
});
it('bounds lookup input and passes exact selections to the repository', async () => {
  const { repo, call } = setup();
  const customers = vi.spyOn(repo, 'findCustomers').mockResolvedValue([
    {
      id: randomUUID(),
      fullName: 'Ana',
      identification: '123456789',
      phone: '88888888',
      email: null,
    },
  ]);
  const vehicles = vi.spyOn(repo, 'findVehicles').mockResolvedValue([]);
  expect((await call('/customers?q=1')).status).toBe(400);
  expect((await call('/vehicles?q=AB')).status).toBe(400);
  expect((await call('/customers?q=' + 'x'.repeat(201))).status).toBe(400);
  expect((await call('/customers?q=123456789')).status).toBe(200);
  expect(customers).toHaveBeenCalledWith('123456789');
  const id = randomUUID();
  expect((await call('/vehicles?customerId=' + id)).status).toBe(200);
  expect(vehicles).toHaveBeenCalledWith('', id);
  expect((await call('/vehicles?customerId=bad')).status).toBe(400);
  expect((await call('/orders?before=bad')).status).toBe(400);
});
it('a mechanic cannot transfer vehicle ownership using order actions', async () => {
  const { repo } = setup();
  const id = randomUUID();
  await repo.saveOrder(id, userId, {
    customerName: 'Ana',
    plate: 'ABC123',
    mileage: 0,
    notes: 'Revisado',
    recommendations: '',
  });
  const raw = randomBytes(32).toString('base64url');
  repo.sessions.set(tokenHash(raw), {
    tokenHash: tokenHash(raw),
    userId,
    csrf: 'fixture',
    lastActivity: repo.clock,
    revoked: false,
  });
  const origin = 'http://localhost:5173',
    api = createApi({ repository: repo, origin });
  const response = await api(
    new Request(origin + '/api/orders/' + id, {
      method: 'PUT',
      headers: {
        origin,
        cookie: 'j5_session=' + raw,
        'content-type': 'application/json',
        'x-csrf-token': 'fixture',
        'idempotency-key': randomUUID(),
        'if-match': '"' + repo.orders.get(id)!.version + '"',
      },
      body: JSON.stringify({
        ...repo.orders.get(id)!.draft,
        action: 'transfer-owner',
      }),
    }),
  );
  expect(response.status).toBe(403);
});

it('history rejects missing criteria before reaching the repository', async()=>{
 const {repo,call}=setup();const spy=vi.spyOn(repo,'listOrders');
 for(const q of ['', ' ', 'a']) expect((await call('/orders?status=CLOSED&q='+encodeURIComponent(q))).status).toBe(400);
 expect(spy).not.toHaveBeenCalled();
});
it('partial names are accent/case insensitive, exact identity and pages remain bounded',async()=>{
 const {repo,call}=setup();const ids=[];
 for(let i=0;i<55;i++){
   const order=await repo.saveOrder(randomUUID(),userId,{customerName:i%2?'José Ramírez':'Jose Mora',identification:'123456789',plate:'ABC123',mileage:0,notes:'',recommendations:'',action:'close'});
   ids.push(order.id);
 }
 const search=async(q:string,before?:string)=>(await (await call('/orders?status=CLOSED&q='+encodeURIComponent(q)+(before?'&before='+before:''))).json()).orders;
 const first=await search('JOSE');expect(first).toHaveLength(50);
 const next=await search('Jose',first.at(-1).id);expect(next).toHaveLength(5);
 expect(new Set([...first,...next].map(o=>o.id)).size).toBe(55);
 expect(await search('Jose Ramirez')).toHaveLength(27);
 expect(await search('12345678')).toEqual([]);expect(await search('ABC12')).toEqual([]);
 expect(await search('abc-123')).toHaveLength(50);
 expect(await search('%_[')).toEqual([]);
});
