const paths = {
  dashboard: '/',
  'new-order': '/ordenes/nueva',
  editor: '/ordenes',
  open: '/ordenes/abiertas',
  history: '/historial',
  legacy: '/historial-j5',
  users: '/usuarios',
  invoices: '/facturas',
  'invoice-order': '/facturas/ordenes',
  operational: '/panel',
  'operational-order': '/panel/ordenes',
} as const;

export type Page = keyof typeof paths;
const detailPath = /^\/(ordenes|facturas\/ordenes|panel\/ordenes)\/([^/]+)$/;
export const isOrderId = (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export function readRoute(): { page: Page; id?: string } {
  if (typeof window === 'undefined') return { page: 'dashboard' };
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') {
    if (params.has('operationalOrder')) return { page: 'operational-order', id: params.get('operationalOrder')! } as const;
    if (params.has('operational')) return { page: 'operational' } as const;
    if (params.has('invoiceOrder')) return { page: 'invoice-order', id: params.get('invoiceOrder')! } as const;
  }
  const page = (Object.keys(paths) as Page[]).find(key => paths[key] === path);
  if (page && page !== 'editor' && page !== 'invoice-order' && page !== 'operational-order') return { page };
  const detail = detailPath.exec(path);
  if (detail) return {
    page: detail[1] === 'ordenes' ? 'editor' : detail[1] === 'facturas/ordenes' ? 'invoice-order' : 'operational-order',
    id: detail[2],
  } as const;
  return { page: 'dashboard' } as const;
}

export function routeUrl(page: Page, id?: string, params?: URLSearchParams) {
  const query = params?.toString();
  return paths[page] + (id ? '/' + encodeURIComponent(id) : '') + (query ? '?' + query : '');
}

type Entry = {
  position: number;
  owner?: string;
  view?: unknown;
  scroll?: number;
  order?: string;
};

export function entry(): Entry | undefined {
  return typeof window === 'undefined' ? undefined : window.history.state?.j5;
}

export function replaceEntry(next: Entry, url = window.location.href) {
  window.history.replaceState({ ...window.history.state, j5: next }, '', url);
}

export function pushRoute(url: string) {
  const current = entry() ?? { position: 0 };
  replaceEntry({ ...current, scroll: window.scrollY });
  window.history.pushState({ j5: { position: current.position + 1 } }, '', url);
}

export function readView<T>(owner?: string): T | undefined {
  const current = entry();
  return owner && current?.owner === owner ? current.view as T : undefined;
}

export function saveView(owner: string, view: unknown, params: Record<string, string | undefined>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  const current = entry() ?? { position: 0 };
  replaceEntry({ ...current, owner, view }, url.href);
}

export function restoreListPosition(section: HTMLElement) {
  const previous = entry();
  if (!previous) return;
  const row = previous.order && section.querySelector<HTMLButtonElement>(
    `[data-order-id="${previous.order}"]`,
  );
  if (row) row.focus({ preventScroll: true });
  else if (previous.order) section.querySelector('h2')?.focus({ preventScroll: true });
  if (previous.scroll !== undefined) window.scrollTo(0, previous.scroll);
  if (previous.order || previous.scroll !== undefined)
    replaceEntry({ ...previous, order: undefined, scroll: undefined });
}

export function rememberOrder(id: string) {
  replaceEntry({ ...(entry() ?? { position: 0 }), order: id, scroll: window.scrollY });
}
