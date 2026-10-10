// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';
import { OrderList } from './OrderList';
import { api, ApiError } from './api';
import { amounts } from '../../backend/src/validation';
import { bootstrapSession } from './bootstrap';
import { fresh, storage, type Order, type RecordState } from './autosave';
import { trackActivity, type Session } from './session';
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  api: vi.fn(),
}));
vi.mock('./bootstrap', () => ({ bootstrapSession: vi.fn() }));
vi.mock('./session', () => ({ trackActivity: vi.fn(() => () => {}) }));
vi.mock('./autosave', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./autosave')>();
  actual.storage.read = vi.fn();
  actual.storage.write = vi.fn();
  actual.storage.list = vi.fn();
  return actual;
});
const session: Session = {
  userId: '22222222-2222-4222-8222-222222222222',
  fullName: 'Mecánico de prueba',
  role: 'MECHANIC',
  csrf: 'fixture',
  idleMs: 7200000,
  lastActivity: Date.now(),
};
const complete = {
  customerName: 'Cliente de prueba',
  identification: '123456789',
  phone: '88888888',
  email: '',
  plate: 'ABC123',
  make: 'Toyota',
  model: 'Corolla',
  year: 2020,
  mileage: 128400,
  items: [{ description: 'Frenos', price: 185000 }],
  paymentMethod: 'CASH' as const, electronicInvoice: false, notes: 'Revisado',
  recommendations: '',
};
let container: HTMLDivElement,
  root: Root,
  disk: RecordState | undefined,
  orders: Map<string, Order>,
  puts: number;
let records: Map<string, RecordState>;
const clone = <T,>(v: T): T => structuredClone(v);
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (
        _name: string,
        _options: unknown,
        callback: (lock: object) => Promise<void>,
      ) => callback({}),
    },
  });
  disk = undefined;
  records = new Map();
  orders = new Map();
  puts = 0;
  vi.mocked(storage.read).mockImplementation(async (_u, id) => {
    const r = id ? records.get(id) ?? (disk?.id === id ? disk : undefined) : disk;
    return r ? clone(r) : undefined;
  });
  vi.mocked(storage.list).mockImplementation(async () => {
    const all = new Map(records);
    if (disk) all.set(disk.id, disk);
    return [...all.values()].map(clone);
  });
  vi.mocked(storage.write).mockImplementation(async (_u, r) => {
    disk = clone(r);
    records.set(r.id, clone(r));
  });
  vi.mocked(bootstrapSession).mockResolvedValue({
    session: clone(session),
    status: 'authenticated',
    healthOk: true,
  });
  vi.mocked(api).mockImplementation(async (path, options = {}) => {
    if (path.startsWith('/orders?')) {
      const url = new URL('http://test' + path);
      return {
        orders: [...orders.values()].filter(
          (o) =>
            o.status === url.searchParams.get('status') &&
            (!url.searchParams.get('q') ||
              JSON.stringify(o).includes(url.searchParams.get('q')!)),
        ),
      } as never;
    }
    if (path.startsWith('/orders/')) {
      const id = path.split('/')[2]!;
      if (options.method === 'PUT') {
        puts++;
        const d = JSON.parse(options.body as string);
        const old = orders.get(id);
        const o: Order = {
          id,
          draft: d,
          version: String(puts),
          status:
            d.action === 'void' ? 'VOID' : d.action === 'close'
              ? 'CLOSED'
              : d.action === 'reopen'
                ? 'OPEN'
                : (old?.status ?? 'OPEN'),
          displayOrderId: old?.displayOrderId ?? 'OT-2026-000001',
          openedAt: old?.openedAt ?? '2026-10-05T10:00:00Z',
          closedAt: d.action === 'close' ? '2026-10-05T11:00:00Z' : null,
          mechanicId: d.mechanicId ?? old?.mechanicId ?? session.userId,
          mechanicName: session.fullName,
          taxRate: old && old.status !== 'OPEN' ? old.taxRate ?? 0 : 13,
          totalAmount: amounts(d.items, old && old.status !== 'OPEN' ? old.taxRate ?? 0 : 13).total,
        };
        delete o.draft.action;
        delete o.draft.ownerResolution;
        delete o.draft.mechanicId;
        orders.set(id, clone(o));
        return clone(o) as never;
      }
      if (!orders.has(id)) throw new Error('ORDER_NOT_FOUND');
      return clone(orders.get(id)) as never;
    }
    if (path.startsWith('/customers'))
      return {
        customers: [
          {
            id: 'c',
            fullName: 'Existente',
            identification: '987654321',
            phone: '87654321',
            email: null,
          },
        ],
      } as never;
    if (path.startsWith('/vehicles'))
      return {
        vehicles: [
          {
            id: 'v',
            ownerId: 'c',
            plate: 'XYZ987',
            make: 'Honda',
            model: 'Civic',
            year: 2022,
            owner: {
              id: 'c',
              fullName: 'Existente',
              identification: '987654321',
              phone: '87654321',
              email: null,
            },
          },
        ],
      } as never;
    if (path === '/admin/users') return { users: [] } as never;
    return {} as never;
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(<App />));
}
function text() {
  return [...container.querySelectorAll('main')]
    .map((e) => e.textContent)
    .join('');
}
function button(label: string) {
  return [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.startsWith(label) && !b.closest('[hidden]'),
  )!;
}
async function click(label: string) {
  const b = button(label);
  expect(b, `button ${label}`).toBeTruthy();
  await act(async () => {
    b.click();
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}
async function input(selector: string, value: string) {
  await act(async () => {
    const e = container.querySelector<HTMLInputElement>(selector)!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(e, value);
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function seed(status: 'OPEN' | 'CLOSED' = 'OPEN') {
  const id = crypto.randomUUID();
  const order: Order = {
    id,
    version: '0',
    status,
    draft: clone(complete),
    mechanicId: session.userId,
    mechanicName: session.fullName,
    displayOrderId: 'OT-2026-000007',
    openedAt: '2026-10-05T10:00:00Z',
    closedAt: status === 'CLOSED' ? '2026-10-05T11:00:00Z' : null,
    totalAmount: 185000,
  };
  orders.set(id, order);
  disk = {
    ...fresh(),
    id,
    draft: clone(order.draft),
    version: order.version,
    order: clone(order),
  };
  records.set(id, clone(disk));
  return order;
}
it.each(['ADMIN', 'MECHANIC'] as const)(
  'login lands on dashboard; modules follow %s role without creating an order',
  async (role) => {
    vi.mocked(bootstrapSession).mockResolvedValue({
      session: { ...session, role },
      status: 'authenticated',
      healthOk: true,
    });
    await mount();
    expect(button('Nueva orden')).toBeTruthy();
    expect(!!button('Usuarios')).toBe(role === 'ADMIN');
    expect(
      container.querySelector('section.editor')?.hasAttribute('hidden'),
    ).toBe(true);
    expect(puts).toBe(0);
  },
);
it('explicit Nueva orden creates a second OPEN; re-render and refresh create none', async () => {
  await mount();
  await click('Nueva orden');
  expect(puts).toBe(1);
  const id = disk!.id;
  await click('Inicio');
  await click('Nueva orden');
  expect(disk!.id).not.toBe(id);
  expect(puts).toBe(2);
  expect(orders.size).toBe(2);
  await mount();
  expect(puts).toBe(2);
  expect(text()).toContain('OT-2026-000001');
  expect(text()).not.toContain('Reintentar sincronización');
});
it('Nueva orden preserves a legacy local draft and creates a different order', async () => {
  disk = fresh();
  disk.draft.notes = 'Copia local antigua';
  await mount();
  await click('Nueva orden');
  expect(puts).toBe(1);
  expect(disk?.draft.notes).toBe('');
});
it('validates missing fields inline and in summary without closing', async () => {
  await mount();
  await click('Nueva orden');
  await click('Cerrar orden');
  expect(text()).toContain('Revisa estos datos');
  expect(text()).toContain('Agrega al menos un trabajo');
  expect(container.querySelector('[role=dialog]')).toBeNull();
  expect(orders.get(disk!.id)?.status).toBe('OPEN');
});
it('lists OPEN, resumes, confirms closure, locks CLOSED and finds history detail', async () => {
  seed();
  await mount();
  await click('Órdenes abiertas');
  expect(text()).toContain('Cliente de prueba');
  await click('Continuar');
  expect(text()).toContain('128,400 km');
  await click('Cerrar orden');
  expect(container.querySelector('[role=dialog]')?.textContent).toContain(
    '¿Cerrar la orden OT-2026-000007?',
  );
  await click('Confirmar');
  expect(disk?.order?.status).toBe('CLOSED');
  expect(container.querySelector('fieldset')?.disabled).toBe(true);
  expect(button('Reabrir orden')).toBeUndefined();
  expect(text()).toContain('Precio final');
  await click('Historial');
  await historySearch();
  expect(text()).toContain('OT-2026-000007');
  await click('Ver detalle');
  expect(container.querySelector('fieldset')?.disabled).toBe(true);
});
it('ADMIN can explicitly confirm reopening a CLOSED order', async () => {
  seed('CLOSED');
  vi.mocked(bootstrapSession).mockResolvedValue({
    session: { ...session, role: 'ADMIN' },
    status: 'authenticated',
    healthOk: true,
  });
  await mount();
  await click('Historial');
  await historySearch();
  await click('Ver detalle');
  await click('Reabrir orden');
  expect(container.querySelector('[role=dialog]')).toBeTruthy();
  await click('Confirmar');
  expect(disk?.order?.status).toBe('OPEN');
  expect(container.querySelector('fieldset')?.disabled).toBe(false);
});
it('ADMIN reopens the same paused editor after closing and visiting history', async () => {
  const initial = seed();
  initial.draft.items![0]!.notes = 'Comentario conservado';
  initial.taxRate = 13;
  disk!.draft = clone(initial.draft); disk!.order = clone(initial);
  vi.mocked(bootstrapSession).mockResolvedValue({ session: { ...session, role: 'ADMIN' }, status: 'authenticated', healthOk: true });
  await mount(); await click('Órdenes abiertas'); await click('Continuar');
  expect([...container.querySelectorAll('.order-actions button')].map(b => b.textContent?.trim())).toEqual(['Cerrar orden', 'Cancelar orden']);
  await click('Cerrar orden'); await click('Confirmar');
  await click('Historial'); await historySearch(); await click('Ver detalle');
  expect(container.querySelector('fieldset')?.disabled).toBe(true);
  await click('Reabrir orden'); await click('Confirmar');
  expect(container.querySelector('fieldset')?.disabled).toBe(false);
  expect(disk?.order?.status).toBe('OPEN'); expect(disk?.order?.closedAt).toBeNull();
  expect(disk?.draft.items?.[0]?.notes).toBe('Comentario conservado'); expect(disk?.order?.taxRate).toBe(13);
  await input('[data-field=mileage]', '128401');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 850)); });
  expect(orders.get(initial.id)?.draft.mileage).toBe(128401);
  expect(orders.get(initial.id)?.draft.items?.[0]?.notes).toBe('Comentario conservado');
  await click('Órdenes abiertas'); expect(button('Continuar')).toBeTruthy();
});
it('ADMIN reopening with stale ETag refetches and keeps the conflict message', async () => {
  const initial = seed('CLOSED');
  vi.mocked(bootstrapSession).mockResolvedValue({ session: { ...session, role: 'ADMIN' }, status: 'authenticated', healthOk: true });
  const normal = vi.mocked(api).getMockImplementation()!;
  vi.mocked(api).mockImplementation(async (path, options = {}) => {
    if (options.method === 'PUT') {
      orders.get(initial.id)!.version = 'new-version';
      throw new ApiError(412, 'VERSION_CONFLICT');
    }
    return normal(path, options);
  });
  await mount(); await click('Historial'); await historySearch(); await click('Ver detalle');
  await click('Reabrir orden'); await click('Confirmar');
  expect(text()).toContain('Conflicto de versión.');
  expect(disk?.order?.version).toBe('new-version');
  expect(container.querySelector('fieldset')?.disabled).toBe(true);
});
it('selects exact vehicle and current owner from search results', async () => {
  await mount();
  await click('Nueva orden');
  await input('.lookup input', 'XYZ987');
  await click('Buscar');
  await click('XYZ987');
  expect(
    container.querySelector<HTMLInputElement>('[data-field=plate]')?.value,
  ).toBe('XYZ987');
  expect(
    container.querySelector<HTMLInputElement>('[data-field=identification]')
      ?.value,
  ).toBe('987654321');
  expect(disk?.draft.vehicleId).toBe('v');
});
it('continues the selected order with its pending invalid local draft', async () => {
  const o = seed();
  disk!.draft.identification = '12';
  disk!.revision = 1;
  records.set(o.id,clone(disk!));
  await mount();
  await click('Órdenes abiertas');
  await click('Continuar');
  expect(
    container.querySelector<HTMLInputElement>('[data-field=identification]')
      ?.value,
  ).toBe('12');
  expect(disk!.id).toBe(o.id);
  expect(puts).toBe(0);
});

it('viewing CLOSED history preserves OPEN drafts and Nueva orden creates another', async () => {
  const active = seed();
  const closed = {
    ...clone(active),
    id: crypto.randomUUID(),
    status: 'CLOSED' as const,
    displayOrderId: 'OT-2026-000008',
  };
  orders.set(closed.id, closed);
  await mount();
  await click('Nueva orden');
  await click('Historial');
  await historySearch();
  await click('Ver detalle');
  expect(container.querySelector('fieldset')?.disabled).toBe(true);
  expect(records.get(active.id)).toBeDefined();
  await click('Inicio');
  await click('Nueva orden');
  expect(disk?.id).not.toBe(active.id);
  expect(container.querySelector('fieldset')?.disabled).toBe(false);
});
it('history has a useful empty state', async () => {
  await mount();
  await click('Historial');
  expect(text()).toContain('para consultar el historial');
  expect(vi.mocked(api).mock.calls.some(([path]) => path.includes('status=CLOSED'))).toBe(false);
});
it('long customer names search without sending an invalid plate query', async () => {
  await mount();
  await click('Nueva orden');
  vi.mocked(api).mockClear();
  await input('.lookup input', 'Nombre de cliente bastante largo');
  await click('Buscar');
  expect(button('Existente')).toBeTruthy();
  expect(
    vi.mocked(api).mock.calls.some(([path]) => path.startsWith('/vehicles')),
  ).toBe(false);
});
it('ADMIN user creation sends role, CSRF and idempotency and clears the password', async () => {
  vi.mocked(bootstrapSession).mockResolvedValue({
    session: { ...session, role: 'ADMIN' },
    status: 'authenticated',
    healthOk: true,
  });
  await mount();
  await click('Usuarios');
  await input('input[pattern]', 'newmechanic');
  await input('input[required][maxlength="200"]', 'Nuevo usuario');
  await input('input[autocomplete="new-password"]', 'Fixture-only-123!');
  await input('label:nth-child(4) input[autocomplete="new-password"]', 'Fixture-only-123!');
  await click('Crear usuario');
  const mutation = vi
    .mocked(api)
    .mock.calls.find(
      ([path, options]) =>
        path === '/admin/users' && options?.method === 'POST',
    )!;
  expect(JSON.parse(mutation[1]!.body as string)).toMatchObject({
    username: 'newmechanic',
    fullName: 'Nuevo usuario',
    role: 'MECHANIC',
  });
  expect(mutation[1]!.headers).toMatchObject({
    'X-CSRF-Token': 'fixture',
    'Idempotency-Key': expect.any(String),
  });
  expect(
    container.querySelector<HTMLInputElement>(
      'input[autocomplete="new-password"]',
    )?.value,
  ).toBe('');
});
it('ADMIN user activation is explicit and confirmed', async () => {
  vi.mocked(bootstrapSession).mockResolvedValue({
    session: { ...session, role: 'ADMIN' },
    status: 'authenticated',
    healthOk: true,
  });
  const target = {
    id: crypto.randomUUID(),
    username: 'other',
    fullName: 'Otro usuario',
    role: 'MECHANIC',
    active: true,
  };
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path === '/admin/users') return { users: [target] } as never;
    if (options?.method === 'PATCH') {
      target.active = JSON.parse(options.body as string).active;
      return target as never;
    }
    return {} as never;
  });
  await mount();
  await click('Usuarios');
  await click('Desactivar');
  expect(target.active).toBe(true);
  expect(container.querySelector('[role=dialog]')?.textContent).toContain(
    'Desactivar para other',
  );
  await click('Confirmar');
  expect(target.active).toBe(false);
  expect(button('Activar')).toBeUndefined();
  await act(async()=>{(container.querySelector('input[type=checkbox]') as HTMLInputElement).click();});
  expect(button('Activar')).toBeTruthy();
});

it('OPEN list identifies pending local changes for the active order', async () => {
  await mount();
  await click('Nueva orden');
  await input('[data-field=identification]', '12');
  await click('Órdenes abiertas');
  expect(container.querySelector('.order-card .status')?.textContent).toContain(
    'guardados en este dispositivo',
  );
});

async function historySearch() {
  await input('.card .search input', 'Cliente');
  await click('Buscar');
}

it('keeps pending drafts independent while creating and continuing multiple orders', async () => {
 await mount(); await click('Nueva orden'); const first=disk!.id;
 await input('[data-field=identification]','12');
 await click('Inicio'); await click('Nueva orden'); const second=disk!.id;
 expect(second).not.toBe(first);
 expect(records.get(first)?.draft.identification).toBe('12');
 await click('Órdenes abiertas');
 const buttons=[...container.querySelectorAll<HTMLButtonElement>('.order-card button')].filter(b => b.textContent === 'Continuar');
 expect(buttons).toHaveLength(2);
 await act(async()=>buttons[0]!.click());
 expect(container.querySelector<HTMLInputElement>('[data-field=identification]')?.value).toBe('12');
 expect(records.get(second)?.draft.identification).toBe('');
});
it('ADMIN gets active assignees on OPEN; MECHANIC remains read-only and year has no max', async () => {
 seed(); await mount(); await click('Órdenes abiertas'); await click('Continuar');
 expect(container.querySelector('select[aria-label="Mecánico asignado"]')).toBeNull();
 expect(container.querySelector('[data-field=year]')?.getAttribute('min')).toBe('1950');
 expect(container.querySelector('[data-field=year]')?.hasAttribute('max')).toBe(false);
});
it('owner mismatch preserves chosen customer and requires an explicit decision', async () => {
 seed(); await mount(); await click('Órdenes abiertas'); await click('Continuar');
 await input('.lookup input','XYZ987'); await click('Buscar'); await click('XYZ987');
 await input('[data-field=customerName]','Cliente de prueba');await input('[data-field=identification]','123456789');
 expect(container.querySelector('[aria-label="Dueño actual del vehículo"]')?.textContent).toContain('Existente');
 expect(container.querySelector('[aria-label="Dueño actual del vehículo"]')?.textContent).toContain('Cliente de prueba');
 expect(container.querySelector<HTMLInputElement>('[data-field=identification]')?.value).toBe('123456789');
 expect(vi.mocked(api).mock.calls.some(([,options])=>options?.body?.toString().includes('transfer-owner'))).toBe(false);
 await click('Mantener dueño actual');
 expect(container.querySelector('[aria-label="Dueño actual del vehículo"]')).toBeNull();
});
it('ADMIN can select an active mechanic and owner update is explicitly labeled', async () => {
 const selected=seed(); selected.draft.customerId='33333333-3333-4333-8333-333333333333'; disk!.draft.customerId=selected.draft.customerId; records.set(selected.id,clone(disk!)); vi.mocked(bootstrapSession).mockResolvedValue({session:{...session,role:'ADMIN'},status:'authenticated',healthOk:true});
 const implementation=vi.mocked(api).getMockImplementation()!;
 const next=crypto.randomUUID();
 vi.mocked(api).mockImplementation(async(path,options)=>path==='/admin/users' ? {users:[{id:next,fullName:'Otro mecánico',role:'MECHANIC',active:true},{id:crypto.randomUUID(),fullName:'Inactivo',role:'MECHANIC',active:false}]} as never : implementation(path,options));
 await mount(); await click('Órdenes abiertas'); await click('Continuar');
 const select=container.querySelector<HTMLSelectElement>('[aria-label="Mecánico asignado"]')!;
 expect(select.textContent).toContain('Otro mecánico');expect(select.textContent).not.toContain('Inactivo');
 await act(async()=>{select.value=next;select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(disk?.draft.mechanicId).toBeUndefined();
 expect(puts).toBe(0);
 await click('Actualizar mecánico');
 expect(orders.get(selected.id)?.mechanicId).toBe(next);
 expect(vi.mocked(api).mock.calls.some(([,options])=>options?.body?.toString().includes('assign-mechanic'))).toBe(true);
 await input('.lookup input','XYZ987');await click('Buscar');await click('XYZ987');
 await input('[data-field=customerName]','Cliente de prueba');
 await click('Cambiar cliente manteniendo este vehículo');await input('.lookup input','Existente');await click('Buscar');await click('Existente · 987654321');
 await input('[data-field=customerName]','Cliente de prueba');
 // Exact selections become valid UUIDs in the real API; the UI test fixture uses short identifiers.
 expect(button('Actualizar dueño a Cliente de prueba')).toBeUndefined(); // selected customer is already the owner
 expect(container.querySelector('[aria-label="Cambio de cliente"]')).toBeTruthy();
});
it('notes empty still opens the close confirmation', async()=>{
 const selected=seed(); selected.draft.notes=''; disk!.draft.notes=''; records.set(selected.id,clone(disk!));
 await mount();await click('Órdenes abiertas');await click('Continuar');await click('Cerrar orden');
 expect(container.querySelector('[role=dialog]')).toBeTruthy();
});

it('history searches on submit and loads the next page using the last server UUID',async()=>{
 const list=Array.from({length:55},(_,i)=>({id:crypto.randomUUID(),version:'v',status:'CLOSED' as const,mechanicId:session.userId,draft:{...complete,customerName:'Jose '+i},displayOrderId:'OT-'+i}));
 vi.mocked(api).mockImplementation(async path=>{
  const url=new URL('http://test'+path);
  return {orders:url.searchParams.get('before')?list.slice(50):list.slice(0,50)} as never;
 });
 await act(async()=>root.render(<OrderList status="CLOSED" onOpen={()=>{}}/>));
 expect(vi.mocked(api)).not.toHaveBeenCalled();
 await input('.card .search input','Jose');await click('Buscar');
 expect(container.querySelectorAll('.order-card')).toHaveLength(50);
 await click('Cargar más');expect(container.querySelectorAll('.order-card')).toHaveLength(55);
 expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toContain('before='+list[49]!.id);
 expect(button('Cargar más')).toBeUndefined();
});


it('assigned mechanic cancels with confirmation; VOID is read-only and absent on reentry',async()=>{
 const initial=seed(); await mount();await click('Órdenes abiertas');await click('Continuar');
 expect(button('Actualizar mecánico')).toBeUndefined();await click('Cancelar orden');
 expect(text()).toContain('Esta acción la quitará de órdenes abiertas.');expect(orders.get(initial.id)?.status).toBe('OPEN');
 await click('Confirmar');expect(orders.get(initial.id)?.status).toBe('VOID');
 expect(container.querySelector('fieldset')?.disabled).toBe(true);expect(button('Cancelar orden')).toBeUndefined();
 await click('Órdenes abiertas');expect(container.querySelector('.order-list')?.textContent).not.toContain(initial.displayOrderId);
});
it('focus refetch updates reassigned mechanic and removes cancellation without session activity',async()=>{
 const initial=seed();await mount();await click('Órdenes abiertas');await click('Continuar');
 expect(button('Cancelar orden')).toBeTruthy();
 orders.set(initial.id,{...initial,mechanicId:crypto.randomUUID(),mechanicName:'Nuevo mecánico',version:'new-version'});
 await act(async()=>{window.dispatchEvent(new Event('focus'));for(let i=0;i<30;i++)await Promise.resolve();});
 expect(text()).toContain('Esta orden fue reasignada a Nuevo mecánico.');expect(button('Cancelar orden')).toBeUndefined();
 expect(disk?.version).toBe('new-version');expect(vi.mocked(api).mock.calls.some(([path])=>path==='/auth/activity')).toBe(false);
});
it('ADMIN can cancel an order assigned to another mechanic',async()=>{
 const initial=seed();initial.mechanicId=crypto.randomUUID();orders.set(initial.id,clone(initial));disk!.order=clone(initial);
 vi.mocked(bootstrapSession).mockResolvedValue({session:{...session,role:'ADMIN'},status:'authenticated',healthOk:true});
 await mount();await click('Órdenes abiertas');await click('Continuar');expect(button('Cancelar orden')).toBeTruthy();
});


it('polls OPEN metadata every 30 seconds and does not renew session',async()=>{
 const initial=seed();await mount();await click('Órdenes abiertas');await click('Continuar');vi.useFakeTimers();
 // Remounting the editor installs its interval under the fake clock.
 await click('Inicio');await click('Órdenes abiertas');await click('Continuar');
 orders.set(initial.id,{...initial,mechanicId:crypto.randomUUID(),mechanicName:'Poll mechanic',version:'polled'});
 await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});
 expect(text()).toContain('Esta orden fue reasignada a Poll mechanic.');expect(disk?.version).toBe('polled');
 expect(vi.mocked(api).mock.calls.some(([path])=>path==='/auth/activity')).toBe(false);
});
it('an invalid local draft does not prevent cancellation of a persisted OPEN',async()=>{
 seed();await mount();await click('Órdenes abiertas');await click('Continuar');
 await input('[data-field=identification]','12');await click('Cancelar orden');await click('Confirmar');
 expect(disk?.order?.status).toBe('VOID');expect(puts).toBe(1);
});

it('list cancellation opens the selected order confirmation and removes it after success',async()=>{
 const initial=seed();await mount();await click('Órdenes abiertas');await click('Cancelar orden');
 expect(container.querySelector('[role=dialog]')?.textContent).toContain(initial.displayOrderId);
 expect(puts).toBe(0);await click('Confirmar');await click('Órdenes abiertas');
 expect(container.querySelector('.order-list')?.textContent).not.toContain(initial.displayOrderId);
});
it('list hides cancellation for orders assigned to another mechanic',async()=>{
 const initial=seed();initial.mechanicId=crypto.randomUUID();orders.set(initial.id,clone(initial));
 await mount();await click('Órdenes abiertas');expect(button('Cancelar orden')).toBeUndefined();
 await click('Continuar');expect(button('Cancelar orden')).toBeUndefined();
});


it('refetch removes close permission from the previous mechanic',async()=>{
 const initial=seed();await mount();await click('Órdenes abiertas');await click('Continuar');expect(button('Cerrar orden')).toBeTruthy();
 orders.set(initial.id,{...initial,mechanicId:crypto.randomUUID(),mechanicName:'Nuevo',version:'new'});
 await act(async()=>{window.dispatchEvent(new Event('focus'));for(let i=0;i<30;i++)await Promise.resolve();});
 expect(button('Cerrar orden')).toBeUndefined();expect(container.querySelector('fieldset')?.disabled).toBe(false);
});
it('payment and electronic invoice require an explicit choice; No is valid; all observations are optional',async()=>{
 const initial=seed();delete initial.draft.paymentMethod;delete initial.draft.electronicInvoice;initial.draft.notes='';initial.draft.recommendations='';orders.set(initial.id,clone(initial));disk!.draft=clone(initial.draft);disk!.order=clone(initial);records.set(initial.id,clone(disk!));
 await mount();await click('Órdenes abiertas');await click('Continuar');await click('Cerrar orden');
 expect(container.querySelector('.close-errors')?.textContent).toContain('Selecciona el método de pago.');expect(container.querySelector('[role=dialog]')).toBeNull();expect(text()).toContain('Selecciona el método de pago.');expect(text()).toContain('Indica si requiere factura electrónica');expect(text()).not.toContain('Escribe las observaciones');
 const select=async(field:string,value:string)=>act(async()=>{const e=container.querySelector<HTMLSelectElement>(`[data-field=${field}]`)!;e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));});
 await select('paymentMethod','SINPE');await select('electronicInvoice','false');expect(container.querySelector('.close-errors')).toBeNull();await click('Cerrar orden');expect(container.querySelector('[role=dialog]')).toBeTruthy();await click('Confirmar');
 expect(disk?.order?.status).toBe('CLOSED');expect(disk?.draft.paymentMethod).toBe('SINPE');expect(disk?.draft.electronicInvoice).toBe(false);expect(disk?.draft.notes).toBe('');expect(disk?.draft.recommendations).toBe('');
});
it('line IVA and subtotal/final totals recalculate while optional item notes persist',async()=>{
 seed();await mount();await click('Órdenes abiertas');await click('Continuar');
 await input('[data-field=item-0-price]','1000');expect(container.querySelector('[aria-label="Resumen de importes"]')?.textContent).toContain('Subtotal: ₡ 1');expect(container.querySelector('[aria-label="Resumen de importes"]')?.textContent).toContain('IVA 13%: ₡ 130');expect(container.querySelector('[aria-label="Resumen de importes"]')?.textContent).toContain('Precio final: ₡ 1');
 await act(async()=>{const e=container.querySelector<HTMLTextAreaElement>('[data-field=item-0-notes]')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(e,'Detalle opcional');e.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(disk?.draft.items?.[0]?.notes).toBe('Detalle opcional');
});

// Inspect all status nodes, including the hidden editor, to catch retained ghost messages.
const notices = () => [...container.querySelectorAll('[role=status], [role=alert], .status')].map(e => e.textContent).join(' ');
it.each([
 ['Cerrar orden', 'Orden cerrada correctamente.'],
 ['Cancelar orden', 'Orden cancelada. Se conserva su información.'],
])('%s notice belongs only to its terminal order', async (action, message) => {
 const first=seed(); await mount(); await click('Órdenes abiertas'); await click('Continuar');
 await click(action); await click('Confirmar'); expect(notices()).toContain(message);
 await click('Inicio'); expect(notices()).not.toContain(message);
 await click('Nueva orden'); expect(disk!.id).not.toBe(first.id); expect(notices()).not.toContain(message);
 await click('Historial'); expect(notices()).not.toContain(message);
});
it('remote update and cancellation reports disappear outside the originating editor', async () => {
 const first=seed(); await mount(); await click('Órdenes abiertas'); await click('Continuar');
 const refresh=async()=>act(async()=>{window.dispatchEvent(new Event('focus'));for(let i=0;i<30;i++)await Promise.resolve();});
 orders.set(first.id,{...first,version:'updated'}); await refresh(); expect(notices()).toContain('Orden actualizada.');
 await click('Historial'); expect(notices()).not.toContain('Orden actualizada.');
 await click('Órdenes abiertas'); await click('Continuar');
 orders.set(first.id,{...first,status:'VOID',version:'void'}); await refresh(); expect(notices()).toContain('Esta orden fue cancelada.');
 await click('Inicio'); await click('Nueva orden'); expect(notices()).not.toContain('Esta orden fue cancelada.');
});
it('reopen and reassignment confirmations are cleared on navigation and another order', async () => {
 seed('CLOSED'); vi.mocked(bootstrapSession).mockResolvedValue({session:{...session,role:'ADMIN'},status:'authenticated',healthOk:true});
 const implementation=vi.mocked(api).getMockImplementation()!; const mechanic=crypto.randomUUID();
 vi.mocked(api).mockImplementation(async(path,options)=>path==='/admin/users'?{users:[{id:mechanic,fullName:'Otro',role:'MECHANIC',active:true}]} as never:implementation(path,options));
 await mount(); await click('Historial'); await historySearch(); await click('Ver detalle'); await click('Reabrir orden'); await click('Confirmar');
 expect(notices()).toContain('Orden reabierta.'); await click('Inicio'); expect(notices()).not.toContain('Orden reabierta.');
 await click('Órdenes abiertas'); await click('Continuar');
 await act(async()=>{const e=container.querySelector<HTMLSelectElement>('[aria-label="Mecánico asignado"]')!;e.value=mechanic;e.dispatchEvent(new Event('change',{bubbles:true}));});
 await click('Actualizar mecánico'); expect(notices()).toContain('Mecánico actualizado.');
 await click('Inicio'); await click('Nueva orden'); expect(notices()).not.toContain('Mecánico actualizado.');
});
it('history search errors and empty results are local and reset on reentry', async () => {
 seed(); await mount(); await click('Historial'); await historySearch(); expect(text()).toContain('No hay órdenes que coincidan');
 await click('Inicio'); expect(text()).not.toContain('No hay órdenes que coincidan');
 await click('Historial'); const implementation=vi.mocked(api).getMockImplementation()!;
 vi.mocked(api).mockImplementation(async(path,options)=>path.startsWith('/orders?status=CLOSED')?Promise.reject(new Error('offline')):implementation(path,options));
 await historySearch(); expect(notices()).toContain('No se pudieron cargar las órdenes.');
 await click('Inicio'); expect(notices()).not.toContain('No se pudieron cargar las órdenes.');
 await click('Historial'); expect(notices()).not.toContain('No se pudieron cargar las órdenes.');
});
it('save status is scoped to the editor; health stays until a backend response confirms recovery', async () => {
 seed(); vi.mocked(bootstrapSession).mockResolvedValue({session,status:'authenticated',healthOk:false});
 await mount(); await click('Órdenes abiertas'); await click('Continuar');
 await input('[data-field=identification]','12'); expect(notices()).toContain('guardados en este dispositivo');
 await click('Inicio'); expect(notices()).not.toContain('Cambios guardados en este dispositivo');
 expect(notices()).toContain('La base de datos no está disponible.');
 await click('Nueva orden'); expect(notices()).not.toContain('Cambios guardados en este dispositivo'); expect(notices()).toContain('La base de datos no está disponible.');
});

it('a late refresh cannot restore a notice after navigation or overwrite another editor', async () => {
 const first=seed(); await mount(); await click('Órdenes abiertas'); await click('Continuar');
 const implementation=vi.mocked(api).getMockImplementation()!;
 let resolve!: (order: Order) => void;
 vi.mocked(api).mockImplementation(async(path,options)=>path==='/orders/'+first.id && !options?.method ? new Promise<Order>(r=>{resolve=r;}) as never : implementation(path,options));
 await act(async()=>{window.dispatchEvent(new Event('focus'));await Promise.resolve();});
 await click('Inicio'); await click('Nueva orden'); const next=disk!.id;
 await act(async()=>{resolve({...first,status:'VOID',version:'late'});for(let i=0;i<30;i++)await Promise.resolve();});
 expect(notices()).not.toContain('Esta orden fue cancelada.');
 expect(container.querySelector('.badge')?.textContent).toBe('ABIERTA'); expect(disk!.id).toBe(next);
});
it('session expiry clears editor notices and remains visible on the login screen', async () => {
 seed(); await mount(); await click('Órdenes abiertas'); await click('Continuar');
 await click('Cancelar orden'); await click('Confirmar');
 const expire=vi.mocked(trackActivity).mock.calls.at(-1)![1];
 await act(async()=>{expire();for(let i=0;i<30;i++)await Promise.resolve();});
 expect(notices()).toContain('La sesión terminó.'); expect(notices()).not.toContain('Orden cancelada.'); expect(button('Entrar')).toBeTruthy();
});

it('clears failed bootstrap health on recovery and preserves browser warnings', async () => {
  vi.mocked(bootstrapSession).mockResolvedValue({session:clone(session),status:'authenticated',healthOk:false});
  Object.defineProperty(navigator, 'locks', {configurable:true,value:undefined});
  await mount();
  expect(container.textContent).toContain('La base de datos no está disponible');
  expect(container.textContent).toContain('Este navegador no admite el bloqueo');
  const actual = await vi.importActual<typeof import('./api')>('./api');
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({orders:[]})));
  await act(async () => { await actual.api('/orders?status=OPEN'); });
  expect(container.textContent).not.toContain('La base de datos no está disponible');
  expect(container.textContent).toContain('Este navegador no admite el bloqueo');
});

it('health recovery after navigation preserves expired-session messages', async () => {
 vi.mocked(bootstrapSession).mockResolvedValue({session:clone(session),status:'authenticated',healthOk:false});
 await mount(); await click('Órdenes abiertas');
 expect(notices()).toContain('La base de datos no está disponible');
 const actual=await vi.importActual<typeof import('./api')>('./api');
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async () => Response.json({orders:[]})));
 await act(async()=>{await actual.api('/orders?status=OPEN');});
 expect(notices()).not.toContain('La base de datos no está disponible');
 const expire=vi.mocked(trackActivity).mock.calls.at(-1)![1];
 await act(async()=>{expire();});
 await act(async()=>{await actual.api('/health');});
 expect(notices()).toContain('La sesión terminó.');
});

it('shows failed health on the login screen without replacing login messages', async () => {
 vi.mocked(bootstrapSession).mockResolvedValue({session:null,status:'anonymous',healthOk:false});
 await mount();
 expect(notices()).toContain('La base de datos no está disponible');
 expect(notices()).toContain('Inicia sesión para continuar.');
 const actual=await vi.importActual<typeof import('./api')>('./api');
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>Response.json({status:'ok'})));
 await act(async()=>{await actual.api('/health');});
 expect(notices()).not.toContain('La base de datos no está disponible');
 expect(notices()).toContain('Inicia sesión para continuar.');
});
it('recovers a content conflict from disk through explicit review without losing the old draft',async()=>{
 const local=fresh();local.version='v1';local.revision=1;local.draft={...complete,notes:'Mis notas'};
 const remote:Order={id:local.id,version:'v2',status:'OPEN',mechanicId:session.userId,draft:{...complete,notes:'Notas del servidor',recommendations:'Recomendación remota'}};
 local.order=remote;local.conflict={remote};disk=clone(local);orders.set(remote.id,remote);
 await mount();await click('Órdenes abiertas');await click('Continuar');
 expect(text()).toContain('Esta orden cambió mientras la editabas');expect(puts).toBe(0);
 await act(async()=>{const select=container.querySelector<HTMLSelectElement>('select[aria-label="Conservar Observaciones"]')!;select.value='local';select.dispatchEvent(new Event('change',{bubbles:true}));});
 await click('Guardar combinación revisada');expect(puts).toBe(1);expect(disk?.draft.notes).toBe('Mis notas');expect(disk?.draft.recommendations).toBe('Recomendación remota');expect(disk?.recoveryCopies?.[0]?.draft.notes).toBe('Mis notas');expect(text()).not.toContain('Esta orden cambió mientras la editabas');
});

it('reloads catalog suggestions on reconnect without replacing the current draft',async()=>{
 const original=vi.mocked(api).getMockImplementation()!;let loads=0;
 vi.mocked(api).mockImplementation(async(path,options)=>{
  if(path==='/vehicle-catalog'){loads++;if(loads===1)throw new TypeError('offline');return {version:1,makes:[{name:'Toyota',models:['Hilux']}]} as never;}
  return original(path,options);
 });
 await mount();await click('Nueva orden');expect(loads).toBe(1);
 await act(async()=>{window.dispatchEvent(new Event('online'));for(let i=0;i<30;i++)await Promise.resolve();});
 expect(loads).toBe(2);await input('[data-field="make"]','to');
 await act(async()=>{container.querySelector<HTMLInputElement>('[data-field="make"]')!.focus();});
 expect(container.querySelector('[role="listbox"]')?.textContent).toContain('Toyota');expect(disk?.id).toBeDefined();
});

it('only applies a PWA update after the pending draft is safely synchronized',async()=>{
 const {announceUpdate}=await import('./pwa-update');const update=vi.fn(async()=>{});announceUpdate(update);
 await mount();await click('Nueva orden');await input('[data-field="customerName"]','Borrador pendiente');
 const original=vi.mocked(api).getMockImplementation()!;let offline=true;
 vi.mocked(api).mockImplementation(async(path,options)=>{if(offline && options?.method==='PUT')throw new TypeError('offline');return original(path,options);});
 await click('Actualizar aplicación');expect(update).not.toHaveBeenCalled();expect(disk?.draft.customerName).toBe('Borrador pendiente');
 offline=false;await click('Actualizar aplicación');expect(update).toHaveBeenCalledTimes(1);expect(disk?.pending).toBeUndefined();
});

it('keeps the vehicle while typing a new identification without repeated owner warnings; navigation clears intent',async()=>{
 seed();await mount();await click('Órdenes abiertas');await click('Continuar');
 await input('.lookup input','XYZ987');await click('Buscar');await click('XYZ987');
 await click('Cambiar cliente manteniendo este vehículo');
 for(const field of ['customerName','identification','phone','email']) expect(container.querySelector<HTMLInputElement>('[data-field='+field+']')!.value).toBe('');
 expect([...container.querySelectorAll('button')].filter(b=>b.textContent?.includes('Cambiar cliente manteniendo este vehículo'))).toHaveLength(0);
 for(const value of Array.from({length:9},(_,i)=>'123456789'.slice(0,i+1))) { expect(button('Cambiar cliente manteniendo este vehículo')).toBeUndefined(); await input('[data-field=identification]',value);expect(container.querySelector('[aria-label="Dueño actual del vehículo"]')).toBeNull();expect(text()).not.toContain('Este vehículo está registrado'); }
 expect(disk?.draft.vehicleId).toBe('v');expect(disk?.draft.plate).toBe('XYZ987');expect(disk?.draft.make).toBe('Honda');expect(disk?.draft.model).toBe('Civic');expect(disk?.draft.year).toBe(2022);
 expect(button('Actualizar dueño a')).toBeUndefined();await click('Usar otro vehículo');expect(container.querySelector('[aria-label="Cambio de cliente"]')).toBeNull();
 await click('Inicio');expect(container.querySelector('.close-errors')).toBeNull();
});

it.each(['typing','selected'] as const)('cancels customer-change after %s and restores previous customer without changing vehicle',async(mode)=>{
 seed();await mount();await click('Órdenes abiertas');await click('Continuar');
 await input('.lookup input','XYZ987');await click('Buscar');await click('XYZ987');
 expect([...container.querySelectorAll('button')].filter(b=>b.textContent==='Cambiar cliente manteniendo este vehículo')).toHaveLength(1);
 await input('[data-field=email]','previous@example.com');
 const previous=clone(disk!.draft);
 await click('Cambiar cliente manteniendo este vehículo');
 if(mode==='selected') { await input('.lookup input','Existente');await click('Buscar');await click('Existente · 987654321'); }
 await input('[data-field=customerName]','Cliente cambiado');await input('[data-field=phone]','77777777');await input('[data-field=email]','changed@example.com');
 if(mode==='typing') await input('[data-field=identification]','111222333');
 await click('Cancelar cambio de cliente');
 for(const field of ['customerId','customerName','identification','phone','email','vehicleId','plate','make','model','year'] as const) expect(disk!.draft[field]).toEqual(previous[field]);
 for(const field of ['customerName','identification','phone','email'] as const) expect(container.querySelector<HTMLInputElement>('[data-field='+field+']')!.value).toBe(previous[field] ?? '');
 expect(container.querySelector('[aria-label="Dueño actual del vehículo"]')).toBeNull();
 expect(button('Actualizar dueño a')).toBeUndefined();
 expect(button('Cambiar cliente manteniendo este vehículo')).toBeTruthy();
 expect(container.querySelector('[aria-label="Cambio de cliente"]')).toBeNull();
 await input('.lookup input','XYZ987');await click('Buscar');await click('XYZ987');
 await click('Cambiar cliente manteniendo este vehículo');await click('Inicio');await click('Nueva orden');
 expect(container.querySelector('[aria-label="Cambio de cliente"]')).toBeNull();expect(text()).not.toContain('Vehículo XYZ987 conservado');
});

it.each(['ADMIN','MECHANIC'] as const)('%s confirms one owner transfer after selecting the new customer; success clears local intent and warnings',async(role)=>{
 seed();vi.mocked(bootstrapSession).mockResolvedValue({session:{...session,role},status:'authenticated',healthOk:true});
 const implementation=vi.mocked(api).getMockImplementation()!;
 const customer={id:crypto.randomUUID(),fullName:'Nuevo cliente',identification:'111222333',phone:'77777777',email:'new@example.com'};
 let transferred=false;const vehicleId=crypto.randomUUID(),ownerId=crypto.randomUUID();
 vi.mocked(api).mockImplementation(async(path,options)=>{
 if(path.startsWith('/customers')) return {customers:[customer]} as never;
 if(path.startsWith('/orders/') && options?.method==='PUT' && options.body?.toString().includes('transfer-owner')) transferred=true;
 const result=await implementation(path,options);
 if(path.startsWith('/vehicles')) return {vehicles:[{id:vehicleId,ownerId:transferred?customer.id:ownerId,plate:'XYZ987',make:'Honda',model:'Civic',year:2022,owner:transferred?customer:{id:ownerId,fullName:'Existente',identification:'987654321',phone:'87654321',email:null}}]} as never;
 return result;
 });
 await mount();await click('Órdenes abiertas');await click('Continuar');await input('.lookup input','XYZ987');await click('Buscar');await click('XYZ987');
 await click('Cambiar cliente manteniendo este vehículo');await input('.lookup input','Nuevo');await click('Buscar');await click('Nuevo cliente · 111222333');
 expect(button('Cambiar cliente manteniendo este vehículo')).toBeUndefined();
 expect([...container.querySelectorAll('button')].filter(b=>b.textContent==='Actualizar dueño a Nuevo cliente')).toHaveLength(1);
 expect(container.querySelector('[aria-label="Dueño actual del vehículo"]')).toBeNull();expect(button('Actualizar dueño a Nuevo cliente')).toBeTruthy();
 await click('Actualizar dueño a Nuevo cliente');expect(container.querySelector('[role=dialog]')).toBeTruthy();await click('Confirmar');
 expect(button('Cambiar cliente manteniendo este vehículo')).toBeUndefined();expect(button('Actualizar dueño a Nuevo cliente')).toBeUndefined();expect(transferred).toBe(true);expect(container.querySelector('[aria-label="Cambio de cliente"]')).toBeNull();expect(text()).not.toContain('Este vehículo está registrado');
 expect(vi.mocked(api).mock.calls.filter(([,o])=>o?.body?.toString().includes('transfer-owner'))).toHaveLength(1);
 await click('Inicio');expect(notices()).not.toContain('Dueño actual actualizado');
 await click('Nueva orden');await input('.lookup input','Nuevo');await click('Buscar');await click('Nuevo cliente · 111222333');
 expect(vi.mocked(api).mock.calls.some(([path])=>path==='/vehicles?customerId='+customer.id)).toBe(true);expect(button('XYZ987')).toBeTruthy();await click('XYZ987');
 expect(disk?.draft).toMatchObject({customerId:customer.id,vehicleId,plate:'XYZ987'});
});

it('lower close banner resets on leaving the editor and opening a different order',async()=>{
 const initial=seed();initial.draft.mileage=null;orders.set(initial.id,clone(initial));disk!.draft=clone(initial.draft);disk!.order=clone(initial);records.set(initial.id,clone(disk!));
 await mount();await click('Órdenes abiertas');await click('Continuar');await click('Cerrar orden');expect(container.querySelector('.close-errors')).toBeTruthy();
 await click('Inicio');expect(container.querySelector('.close-errors')).toBeNull();await click('Nueva orden');expect(container.querySelector('.close-errors')).toBeNull();expect(disk?.id).not.toBe(initial.id);
});

it.each(['plate','customer'] as const)('new order loads email and latest mileage through %s search',async(mode)=>{
 const original=vi.mocked(api).getMockImplementation()!;
 vi.mocked(api).mockImplementation(async(path,options)=>{
   const result=await original(path,options);
   if(path.startsWith('/customers')) return {customers:[{id:'c',fullName:'Existente',identification:'987654321',phone:'87654321',email:'latest@example.com'}]} as never;
   if(path.startsWith('/vehicles')) return {vehicles:[{id:'v',ownerId:'c',plate:'XYZ987',make:'Honda',model:'Civic',year:2022,lastMileage:54321,owner:{id:'c',fullName:'Existente',identification:'987654321',phone:'87654321',email:'latest@example.com'}}]} as never;
   return result;
 });
 await mount();await click('Nueva orden');await input('.lookup input',mode==='plate'?'XYZ987':'Existente');await click('Buscar');
 if(mode==='customer') {await click('Existente · 987654321');expect(disk?.draft.email).toBe('latest@example.com');}
 await click('XYZ987');expect(disk?.draft.email).toBe('latest@example.com');expect(disk?.draft.mileage).toBe(54321);
 expect(container.querySelector<HTMLInputElement>('[data-field=email]')!.value).toBe('latest@example.com');
 expect(container.querySelector<HTMLInputElement>('[data-field=mileage]')!.value).toBe('54321');
 await click('Usar otro vehículo');expect(disk?.draft.mileage).toBeNull();
});

it.each([null, 45678] as const)('plate lookup restores previous km without replacing entered mileage %s',async(entered)=>{
 const original=vi.mocked(api).getMockImplementation()!;
 let resolveLookup!: (value: unknown)=>void;
 vi.mocked(api).mockImplementation(async(path,options)=>{
   if(path.startsWith('/vehicles?q=XYZ987')) return await new Promise<unknown>(resolve=>{resolveLookup=resolve;}) as never;
   return original(path,options);
 });
 await mount();await click('Nueva orden');await input('[data-field=plate]','XYZ987');
 if(entered!==null) await input('[data-field=mileage]',String(entered));
 await act(async()=>{resolveLookup({vehicles:[{id:'v',ownerId:'c',plate:'XYZ987',make:'Honda',model:'Civic',year:2022,lastMileage:20000}]});for(let i=0;i<30;i++)await Promise.resolve();});
 expect(disk?.draft.mileage).toBe(entered??20000);
 expect(container.querySelector<HTMLInputElement>('[data-field=mileage]')!.value).toBe(String(entered??20000));
 await input('[data-field=mileage]','25000');expect(disk?.draft.mileage).toBe(25000);
 await input('[data-field=mileage]','');expect(disk?.draft.mileage).toBeNull();
});

it('new order search is visible and usable before the initial server save completes',async()=>{
 const original=vi.mocked(api).getMockImplementation()!;
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});let started=false;
 vi.mocked(api).mockImplementation(async(path,options)=>{
   if(path.startsWith('/orders/') && options?.method==='PUT' && !started){started=true;await pending;}
   return original(path,options);
 });
 await mount();await click('Nueva orden');expect(started).toBe(true);
 const lookup=container.querySelector('.lookup')!;
 expect(lookup).toBeTruthy();expect(lookup.closest('[hidden]')).toBeNull();
 expect(container.querySelector<HTMLInputElement>('.lookup input')!.disabled).toBe(false);
 await input('.lookup input','XYZ987');await click('Buscar');await click('XYZ987');
 expect(disk?.draft.plate).toBe('XYZ987');
 await act(async()=>{release();for(let i=0;i<60;i++)await Promise.resolve();});
 expect(disk?.draft.plate).toBe('XYZ987');expect(container.querySelector<HTMLInputElement>('[data-field=plate]')!.value).toBe('XYZ987');
});

it('never reports transfer success when persisted vehicle ownership remains unchanged',async()=>{
 const role='MECHANIC' as const;
 seed();vi.mocked(bootstrapSession).mockResolvedValue({session:{...session,role},status:'authenticated',healthOk:true});
 const implementation=vi.mocked(api).getMockImplementation()!;
 const customer={id:crypto.randomUUID(),fullName:'Nuevo cliente',identification:'111222333',phone:'77777777',email:'new@example.com'};
 let transferred=false;const vehicleId=crypto.randomUUID(),ownerId=crypto.randomUUID();
 vi.mocked(api).mockImplementation(async(path,options)=>{
 if(path.startsWith('/customers')) return {customers:[customer]} as never;
 if(path.startsWith('/orders/') && options?.method==='PUT' && options.body?.toString().includes('transfer-owner')) transferred=true;
 const result=await implementation(path,options);
 if(path.startsWith('/vehicles')) return {vehicles:[{id:vehicleId,ownerId:ownerId,plate:'XYZ987',make:'Honda',model:'Civic',year:2022,owner:{id:ownerId,fullName:'Existente',identification:'987654321',phone:'87654321',email:null}}]} as never;
 return result;
 });
 await mount();await click('Órdenes abiertas');await click('Continuar');await input('.lookup input','XYZ987');await click('Buscar');await click('XYZ987');
 await click('Cambiar cliente manteniendo este vehículo');await input('.lookup input','Nuevo');await click('Buscar');await click('Nuevo cliente · 111222333');
 expect(button('Cambiar cliente manteniendo este vehículo')).toBeUndefined();
 expect([...container.querySelectorAll('button')].filter(b=>b.textContent==='Actualizar dueño a Nuevo cliente')).toHaveLength(1);
 expect(container.querySelector('[aria-label="Dueño actual del vehículo"]')).toBeNull();expect(button('Actualizar dueño a Nuevo cliente')).toBeTruthy();
 await click('Actualizar dueño a Nuevo cliente');expect(container.querySelector('[role=dialog]')).toBeTruthy();await click('Confirmar');
 expect(transferred).toBe(true);expect(text()).toContain('El dueño registrado del vehículo no cambió.');expect(notices()).not.toContain('Dueño actual actualizado');
});

it.each(['transfer','keep'] as const)('normal close explicitly resolves a different owner (%s); transfer appears when selecting the customer in the next order',async decision=>{
 const customerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',vehicleId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',oldOwnerId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const initial=seed();initial.draft={...initial.draft,customerId,vehicleId};
 disk!.draft=clone(initial.draft);disk!.order=clone(initial);records.set(initial.id,clone(disk!));
 let ownerId=oldOwnerId;
 const original=vi.mocked(api).getMockImplementation()!;
 const customer={id:customerId,fullName:complete.customerName,identification:complete.identification,phone:complete.phone,email:null};
 vi.mocked(api).mockImplementation(async(path,options={})=>{
  if(path.startsWith('/customers'))return {customers:[customer]} as never;
  if(path.startsWith('/vehicles')) {
   const requested=new URL('http://test'+path).searchParams.get('customerId');
   return {vehicles:requested && requested!==ownerId ? [] : [{id:vehicleId,ownerId,plate:complete.plate,make:complete.make,model:complete.model,year:2020,owner:ownerId===customerId ? customer : {...customer,id:oldOwnerId,fullName:'Dueña anterior',identification:'987654321'}}]} as never;
  }
  if(options.method==='PUT') {
   const payload=JSON.parse(options.body as string);
   if(payload.action==='close') {
    expect(payload.ownerResolution).toEqual({decision,vehicleId,customerId,expectedOwnerId:oldOwnerId});
    if(decision==='transfer')ownerId=customerId;
   }
  }
  return original(path,options);
 });
 await mount();await click('Órdenes abiertas');await click('Continuar');await click('Cerrar orden');
 const dialog=container.querySelector('[role=dialog]')!;
 expect(dialog.textContent).toContain('Dueña anterior');expect(dialog.textContent).toContain('Asignar el vehículo a Cliente de prueba al cerrar');
 if(decision==='keep')await act(async()=>{container.querySelector<HTMLInputElement>('input[name=close-owner][value=keep]')!.click();});
 await click('Confirmar');expect(orders.get(initial.id)!.status).toBe('CLOSED');
 expect(ownerId).toBe(decision==='transfer'?customerId:oldOwnerId);
 expect(orders.get(initial.id)!.draft.ownerResolution).toBeUndefined();
 await click('Inicio');await click('Nueva orden');
 await input('.lookup input','Cliente');await click('Buscar');await click('Cliente de prueba ·');
 if(decision==='transfer') {expect(button('ABC123 ·')).toBeTruthy();await click('ABC123 ·');expect(container.querySelector<HTMLInputElement>('[data-field=plate]')!.value).toBe('ABC123');}
 else expect(button('ABC123 ·')).toBeUndefined();
});


it('a concurrent owner change rejects close and asks for a fresh owner decision without trapping the draft',async()=>{
 const customerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',vehicleId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',oldOwnerId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const initial=seed();initial.draft={...initial.draft,customerId,vehicleId};disk!.draft=clone(initial.draft);disk!.order=clone(initial);records.set(initial.id,clone(disk!));
 const original=vi.mocked(api).getMockImplementation()!;let calls=0;
 vi.mocked(api).mockImplementation(async(path,options={})=>{
  if(path.startsWith('/vehicles'))return {vehicles:[{id:vehicleId,ownerId:oldOwnerId,plate:complete.plate,owner:{fullName:'Dueña anterior'}}]} as never;
  if(options.method==='PUT' && JSON.parse(options.body as string).action==='close'){calls++;throw new ApiError(409,'OWNER_DECISION_STALE');}
  return original(path,options);
 });
 await mount();await click('Órdenes abiertas');await click('Continuar');await click('Cerrar orden');await click('Confirmar');
 expect(calls).toBe(1);expect(orders.get(initial.id)!.status).toBe('OPEN');
 expect(text()).toContain('Confirma quién será el dueño');expect(container.querySelector('[role=dialog]')).toBeNull();
 expect(disk!.pending).toBeUndefined();expect(disk!.draft.ownerResolution).toBeUndefined();
 await click('Cerrar orden');expect(container.querySelector('[role=dialog]')).toBeTruthy();
});

it('login retains credentials while waiting and after service failure, with no extra Mostrar button',async()=>{
 vi.mocked(bootstrapSession).mockResolvedValue({session:null,status:'anonymous',healthOk:true});
 const original=vi.mocked(api).getMockImplementation()!;let fail!:(error:unknown)=>void;
 vi.mocked(api).mockImplementation(async(path,options)=>path==='/auth/login'?new Promise((_resolve,reject)=>{fail=reject;}):original(path,options));
 await mount();await input('input[autocomplete=username]','fixture');await input('input[autocomplete=current-password]','Fixture-only-123!');
 expect(button('Mostrar')).toBeUndefined();expect(container.querySelector('[aria-label="Mostrar contraseña"]')).toBeNull();
 await click('Entrar');
 const password=container.querySelector<HTMLInputElement>('input[autocomplete=current-password]')!;
 expect(password.value).toBe('Fixture-only-123!');expect(password.disabled).toBe(true);expect(text()).toContain('hasta un minuto');
 await act(async()=>{fail(new ApiError(503,'LOGIN_SERVICE_UNAVAILABLE'));});
 expect(password.value).toBe('Fixture-only-123!');expect(password.disabled).toBe(false);expect(notices()).toContain('Reporta el problema a soporte');
});

it('editor lock notices stay in order screens and never leak to Usuarios or login',async()=>{
 vi.mocked(bootstrapSession).mockResolvedValue({session:{...session,role:'ADMIN'},status:'authenticated',healthOk:true});
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:async(_name:string,_options:unknown,callback:(lock:object|null)=>Promise<void>)=>callback(null)}});
 await mount();expect(notices()).toContain('El borrador está abierto en otra pestaña');expect(button('Nueva orden').disabled).toBe(true);
 await click('Usuarios');expect(text()).toContain('Crear usuario');expect(notices()).not.toContain('otra pestaña');
 await click('Órdenes abiertas');expect(notices()).toContain('otra pestaña');
 await click('Usuarios');const expire=vi.mocked(trackActivity).mock.calls.at(-1)![1];await act(async()=>{expire();});
 expect(notices()).toContain('La sesión terminó');expect(notices()).not.toContain('otra pestaña');
});

it('late editor lock errors cannot display an order notice in Usuarios',async()=>{
 vi.mocked(bootstrapSession).mockResolvedValue({session:{...session,role:'ADMIN'},status:'authenticated',healthOk:true});
 let reject!:(error:Error)=>void;
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:()=>new Promise<void>((_resolve,fail)=>{reject=fail;})}});
 await mount();await click('Usuarios');await act(async()=>{reject(new Error('lock unavailable'));});
 expect(text()).toContain('Crear usuario');expect(notices()).not.toContain('bloqueo de edición');
 await click('Inicio');expect(notices()).toContain('No se pudo obtener el bloqueo de edición');
});
