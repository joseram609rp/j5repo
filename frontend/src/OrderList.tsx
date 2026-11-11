import { useEffect, useState } from 'react';
import { z } from 'zod';
import { api } from './api';
import { formatCRC, formatRegistrationDate, formatWorkDate } from './form-validation';
import { canCancelBackfill, storage, type Order } from './autosave';

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
  const [localOrders, setLocalOrders] = useState<(Order & { canCancelDraft: boolean })[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedDates, setAppliedDates] = useState({ from: '', to: '' });
  const [dateError, setDateError] = useState('');
  const [orders, setOrders] = useState<Order[]>([]),
    [query, setQuery] = useState(''),
    [applied, setApplied] = useState(''),
    [loading, setLoading] = useState(status === 'OPEN'),
    [error, setError] = useState(false),
    [reload, setReload] = useState(0),
    [cursor, setCursor] = useState<string | undefined>(),
    [more, setMore] = useState(false);
  const { from: appliedFrom, to: appliedTo } = appliedDates;
  const hasHistorySearch = applied.length >= 2 || !!appliedFrom || !!appliedTo;
  useEffect(() => {
    if (status !== 'OPEN' || !userId) return;
    let current = true;
    void storage.list(userId).then(records => {
      if(current) setLocalOrders(records.filter(r => !r.cancelled && r.order?.status !== 'CLOSED' && r.order?.status !== 'VOID' && (!r.version || r.pending || r.savedRevision < r.revision)).map(r => ({
        ...(r.order ?? {status: 'OPEN' as const, mechanicId: r.draft.mechanicId ?? userId}), id: r.id, draft: r.draft, version: r.version ?? '', canCancelDraft: canCancelBackfill(r),
      })));
    }).catch(() => { if(current) setError(true); });
  return () => { current = false; };
  }, [status, userId, reload]);
  useEffect(() => {
    let current = true;
    if (status === 'CLOSED' && !hasHistorySearch) {
      setOrders([]); setMore(false); setLoading(false); setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ status, q: applied });
    if (cursor) params.set('before', cursor);
    if (status === 'CLOSED') {
      if (appliedFrom) params.set('from', appliedFrom);
      if (appliedTo) params.set('to', appliedTo);
    }
    void api<{ orders: Order[] }>(`/orders?${params}`)
      .then((data) => {
        if (current) {
          setOrders((old) => (cursor ? [...old, ...data.orders] : data.orders));
          setMore(data.orders.length === 50);
        }
      })
      .catch(() => {
        if (current) setError(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [status, applied, appliedFrom, appliedTo, hasHistorySearch, cursor, reload]);
  useEffect(() => {
    if (status !== 'OPEN') return;
    const refresh = () => { if (document.visibilityState !== 'hidden') { setCursor(undefined); setReload(n => n + 1); } };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 30000);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [status]);
  const visible = [...orders, ...localOrders.filter(local => !orders.some(o => o.id === local.id) && (!applied || local.draft.customerName.toLocaleLowerCase().includes(applied.toLocaleLowerCase()) || local.draft.plate === applied.toUpperCase().replace(/[\s-]/g, '')))];
  return (
    <section className="card">
      <h2>{status === 'OPEN' ? 'Órdenes abiertas' : 'Historial'}</h2>
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
          setCursor(undefined);
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
            setCursor(undefined);
            setOrders([]);
            setMore(false);
          }}>Limpiar</button>
        )}
      </form>
      {dateError && <p role="alert">{dateError}</p>}
      {loading && <p role="status">Cargando órdenes…</p>}
      {error && (
        <p role="alert">
          No se pudieron cargar las órdenes.{' '}
          <button onClick={() => setReload((n) => n + 1)}>Reintentar</button>
        </p>
      )}
      {status === 'CLOSED' && !hasHistorySearch && <p>Busca por nombre, cédula, placa, número de orden o fecha para consultar el historial. Si eliges una sola fecha, se busca ese día.</p>}
      {!loading && !error && !visible.length && (status === 'OPEN' || hasHistorySearch) && (
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
              <button disabled={loading || (status === 'OPEN' && !canEdit)} onClick={() => onOpen(order)}>
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
        <button className="quiet" onClick={() => setCursor(orders[orders.length - 1]?.id)}>
          Cargar más
        </button>
      )}
    </section>
  );
}
