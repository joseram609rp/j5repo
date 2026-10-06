// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';
import { OrderList } from './OrderList';
import { api } from './api';
import { bootstrapSession } from './bootstrap';
import { fresh, storage, type Order, type RecordState } from './autosave';
import type { Session } from './session';
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  api: vi.fn(),
}));
vi.mock('./bootstrap', () => ({ bootstrapSession: vi.fn() }));
vi.mock('./session', () => ({ trackActivity: () => () => {} }));
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
  notes: 'Revisado',
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
            d.action === 'close'
              ? 'CLOSED'
              : d.action === 'reopen'
                ? 'OPEN'
                : (old?.status ?? 'OPEN'),
          displayOrderId: old?.displayOrderId ?? 'OT-2026-000001',
          openedAt: old?.openedAt ?? '2026-10-05T10:00:00Z',
          closedAt: d.action === 'close' ? '2026-10-05T11:00:00Z' : null,
          mechanicId: d.mechanicId ?? old?.mechanicId ?? session.userId,
          mechanicName: session.fullName,
          totalAmount:
            d.items?.reduce(
              (sum: number, i: { price: number }) => sum + i.price,
              0,
            ) ?? 0,
        };
        delete o.draft.action;
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
  expect(text()).toContain('Total oficial');
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
 const buttons=[...container.querySelectorAll<HTMLButtonElement>('.order-card button')];
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
 expect(disk?.draft.mechanicId).toBe(next);
 await input('.lookup input','XYZ987');await click('Buscar');await click('XYZ987');
 // Exact selections become valid UUIDs in the real API; the UI test fixture uses short identifiers.
 expect(button('Actualizar dueño a Cliente de prueba')).toBeTruthy();
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
