import { useEffect, useRef, useState } from 'react';
import { isOrderId, readView, restoreListPosition, saveView } from './navigation';
import { useVisibleRefresh } from './refresh';
import { z } from 'zod';
import { api } from './api';
import { formatCRC, formatRegistrationDate, formatWorkDate } from './form-validation';
import { canCancelBackfill, draftUpgradeMessage, storage, type Order } from './autosave';
import { onDraftChange } from './draft-changes';

const historyDate = z.iso.date().refine((value) => value.slice(0, 4) !== '0000');

export function OrderList({
  status,
  onOpen,
  userId,
  userName,
  mechanicRoster = [],
  role,
  onCancel,
  canEdit = true,
}: {
  role?: 'ADMIN' | 'MECHANIC';
  onCancel?: (order: Order) => void;
  canEdit?: boolean;
  userId?: string;
  userName?: string;
  mechanicRoster?: { id: string; fullName: string }[];
  status: 'OPEN' | 'CLOSED';
  onOpen: (order: Order) => void;
}) {
  const [initial] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const date = (key: string) => {
      const value = params.get(key) ?? '';
      return historyDate.safeParse(value).success ? value : '';
    };
    const saved = readView<{ query: string; cursors: string[] }>(userId);
    const before = params.get('before');
    return {
      from: date('from'), to: date('to'), query: saved?.query ?? '',
      cursors: saved?.cursors ?? (before && isOrderId(before) ? [before] : []),
    };
  });
  const section = useRef<HTMLElement>(null);
  const request = useRef<AbortController | null>(null);
  const loaded = useRef<{ filters: string; pages: Map<string | undefined, Order[]> } | undefined>(undefined);
  const [localOrders, setLocalOrders] = useState<(Order & { canCancelDraft: boolean })[]>([]);
  const [localError, setLocalError] = useState('');
  const [localRevision, setLocalRevision] = useState(0);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [appliedDates, setAppliedDates] = useState({ from: initial.from, to: initial.to });
  const [dateError, setDateError] = useState('');
  const [orders, setOrders] = useState<Order[]>([]),
    [query, setQuery] = useState(initial.query),
    [applied, setApplied] = useState(initial.query),
    [loading, setLoading] = useState(status === 'OPEN'),
    [error, setError] = useState(false),
    [reload, setReload] = useState(0),
    [cursors, setCursors] = useState(initial.cursors),
    [more, setMore] = useState(false);
  const { from: appliedFrom, to: appliedTo } = appliedDates;
  const hasHistorySearch = applied.length >= 2 || !!appliedFrom || !!appliedTo;
  const cursor = cursors.at(-1);
  const refresh = () => {
    if (request.current) return false;
    setReload(value => value + 1);
    return true;
  };
  useVisibleRefresh({ enabled: status === 'OPEN', interval: 120_000, resources: ['orders'], refresh });
  useEffect(() => {
    if (status !== 'OPEN' || !userId) return;
    let current = true;
    setLocalError('');
    void storage.list(userId).then(records => {
      if(current) setLocalOrders(records.filter(r => !r.cancelled && r.order?.status !== 'CLOSED' && r.order?.status !== 'VOID' && (!r.version || r.pending || r.savedRevision < r.revision)).map(r => ({
        ...(r.order ?? {status: 'OPEN' as const, mechanicId: r.draft.mechanicId ?? userId}), id: r.id, draft: r.draft, version: r.version ?? '', canCancelDraft: canCancelBackfill(r),
      })));
    }).catch(error => {
      if (current) setLocalError(draftUpgradeMessage(error) ?? 'No se pudieron consultar los borradores en este dispositivo.');
    });
  return () => { current = false; };
  }, [status, userId, localRevision]);
  useEffect(() => {
    if (status === 'CLOSED' && !hasHistorySearch) {
      loaded.current = undefined;
      setOrders([]); setMore(false); setLoading(false); setError(false);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ status, q: applied });
    if (status === 'CLOSED') {
      if (appliedFrom) params.set('from', appliedFrom);
      if (appliedTo) params.set('to', appliedTo);
    }
    const filters = params.toString();
    if (loaded.current?.filters !== filters) {
      loaded.current = { filters, pages: new Map() };
      setOrders([]);
    }
    const pages = loaded.current.pages;
    const wanted = [undefined, ...cursors];
    const missing = wanted.filter(before => before === cursor || !pages.has(before));
    void Promise.all(missing.map(async before => {
      const query = new URLSearchParams(params);
      if (before) query.set('before', before);
      const result = await api<{ orders: Order[] }>(`/orders?${query}`, { signal: controller.signal });
      return { before, orders: result.orders };
    }))
      .then(results => {
        if (controller.signal.aborted) return;
        for (const result of results) pages.set(result.before, result.orders);
        const unique = new Map(wanted.flatMap(before => pages.get(before) ?? []).map(order => [order.id, order]));
        setOrders([...unique.values()]);
        setMore(pages.get(cursor)?.length === 50);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (request.current === controller) request.current = null;
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      if (request.current === controller) request.current = null;
    };
  }, [status, applied, appliedFrom, appliedTo, hasHistorySearch, cursor, cursors, reload]);
  useEffect(() => {
    if (status !== 'OPEN') return;
    return onDraftChange(() => setLocalRevision(value => value + 1));
  }, [status]);
  useEffect(() => {
    if (userId) saveView(userId, { query: applied, cursors }, {
      from: appliedFrom, to: appliedTo, before: cursor,
    });
  }, [userId, applied, cursors, cursor, appliedFrom, appliedTo]);
  useEffect(() => {
    if (!loading && !error && section.current && orders.length) restoreListPosition(section.current);
  }, [loading, error, orders]);
  const search = applied.toLocaleLowerCase();
  const pending = localOrders.filter(local => !orders.some(order => order.id === local.id) &&
    (!search || local.draft.customerName.toLocaleLowerCase().includes(search) ||
      local.displayOrderId?.toLocaleLowerCase().startsWith(search) || local.draft.identification === search ||
      local.draft.plate.toUpperCase().replace(/[\s-]/g, '') === search.toUpperCase().replace(/[\s-]/g, '')));
  const visible = [...orders, ...pending];
  return (
    <section ref={section} className="card">
      <h2 tabIndex={-1}>{status === 'OPEN' ? 'Órdenes abiertas' : 'Historial'}</h2>
      <form
        className={status === 'CLOSED' ? 'search history-search' : 'search'}
        onSubmit={(e) => {
          e.preventDefault();
          if (status === 'CLOSED') {
            if ([from, to].some((value) => value && !historyDate.safeParse(value).success)) {
              setDateError('Ingresa fechas válidas en formato AAAA-MM-DD.');
              return;
            }
            if (from && to && from > to) {
              setDateError('La fecha Desde debe ser anterior o igual a Hasta.');
              return;
            }
            if (!from && !to && query.trim().length < 2) return;
            setDateError('');
            setAppliedDates({ from, to });
            setOrders([]);
            setMore(false);
          }
           setCursors([]);
          setApplied(query.trim());
          setReload((n) => n + 1);
        }}
      >
        <label>
          Buscar por orden, placa, cédula o nombre
          <input
            value={query}
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {status === 'CLOSED' && (
          <>
            <label>
              Desde
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setDateError(''); }} />
            </label>
            <label>
              Hasta
              <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setDateError(''); }} />
            </label>
          </>
        )}
        <button type="submit" disabled={status === 'CLOSED' && query.trim().length < 2 && !from && !to}>Buscar</button>
        {status === 'CLOSED' && (
          <button type="button" className="quiet" onClick={() => {
            setQuery('');
            setFrom('');
            setTo('');
            setApplied('');
            setAppliedDates({ from: '', to: '' });
            setDateError('');
             setCursors([]);
            setOrders([]);
            setMore(false);
          }}>Limpiar</button>
        )}
      </form>
      {(status === 'OPEN' || hasHistorySearch) && <button type="button" className="quiet" disabled={loading} onClick={() => {
        loaded.current?.pages.clear();
        refresh();
      }}>Actualizar órdenes</button>}
      {dateError && <p role="alert">{dateError}</p>}
      {loading && <p role="status">Cargando órdenes…</p>}
      {error && (
        <p role="alert">
          No se pudieron cargar las órdenes.{' '}
          <button onClick={() => setReload((n) => n + 1)}>Reintentar</button>
        </p>
      )}
      {localError && <p role="alert">{localError}{' '}
        <button onClick={() => setLocalRevision(value => value + 1)}>Reintentar</button>
      </p>}
      {status === 'CLOSED' && !hasHistorySearch && <p>Busca por nombre, cédula, placa, número de orden o fecha para consultar el historial. Si eliges una sola fecha, se busca ese día.</p>}
      {!loading && !error && !localError && !visible.length && (status === 'OPEN' || hasHistorySearch) && (
        <p>
          No hay órdenes
          {applied || hasHistorySearch ? ' que coincidan con la búsqueda' : ' abiertas'}
          .
        </p>
      )}
      <div className="order-list">
        {visible.map((order) => {
          const local = localOrders.find(draft => draft.id === order.id);
          const workDate = order.orderDate || order.draft.workDate;
          const historical = order.isBackfilled || order.draft.workDate !== undefined;
          const localDraft = !order.version && historical;
          const mechanicName = order.mechanicName || mechanicRoster.find(user => user.id === order.mechanicId)?.fullName ||
            (order.mechanicId === userId ? userName : undefined);
          return (
            <article className="order-card" key={order.id}>
              <h3>{order.displayOrderId ?? (localDraft ? 'Borrador de orden anterior' : 'Borrador de orden')}</h3>
              <p>{order.draft.customerName || 'Cliente pendiente'}</p>
              <p>
                {[order.draft.make, order.draft.model, order.draft.plate]
                  .filter(Boolean)
                  .join(' · ') || 'Vehículo pendiente'}
              </p>
              <p>Mecánico: {mechanicName || 'Nombre no disponible'}</p>
              {historical ? (
                <>
                  <p>{workDate ? `Trabajo realizado el ${formatWorkDate(workDate)}` : 'Fecha del trabajo pendiente'}</p>
                  {order.status === 'CLOSED' && <p>Estado: CERRADA</p>}
                  {order.openedAt && <p>Orden ingresada en J5 el {formatRegistrationDate(order.openedAt)}</p>}
                </>
              ) : (
                <>
                  {order.openedAt && <p>Apertura: {new Date(order.openedAt).toLocaleString('es-CR')}</p>}
                  {order.status === 'CLOSED' && order.closedAt && (
                    <p>Cierre: {new Date(order.closedAt).toLocaleString('es-CR')}</p>
                  )}
                </>
              )}
              <p className="total">{formatCRC(order.totalAmount ?? 0)}</p>
              {local && (
                <p className="status">
                  {localDraft && local.canCancelDraft
                    ? 'Guardado en este dispositivo. Elegí Continuar para terminar la orden.'
                    : 'Cambios guardados en este dispositivo. Pendientes de enviarse a J5.'}
                </p>
              )}
              <button data-order-id={order.id} disabled={status === 'OPEN' && !canEdit} onClick={() => onOpen(order)}>
                {status === 'OPEN' ? 'Continuar' : 'Ver detalle'}
              </button>
              {order.status === 'OPEN' && onCancel && (order.version
                ? role === 'ADMIN' || order.mechanicId === userId
                : role === 'ADMIN' && local?.canCancelDraft) && (
                <button className="quiet" disabled={loading || !canEdit} onClick={() => onCancel(order)}>Cancelar orden</button>
              )}
            </article>
          );
        })}
      </div>
      {more && !loading && !error && (
        <button className="quiet" onClick={() => {
          const last = loaded.current?.pages.get(cursor)?.at(-1)?.id;
          if (last && !cursors.includes(last)) setCursors([...cursors, last]);
        }}>
          Cargar más
        </button>
      )}
    </section>
  );
}
