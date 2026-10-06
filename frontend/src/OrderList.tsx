import { useEffect, useState } from 'react';
import { api } from './api';
import { formatCRC } from './form-validation';
import { storage, type Order } from './autosave';

export function OrderList({
  status,
  onOpen,
  active,
  userId,
}: {
  userId?: string;
  status: 'OPEN' | 'CLOSED';
  onOpen: (order: Order) => void;
  active?: { id: string; message: string };
}) {
  const [localOrders, setLocalOrders] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>([]),
    [query, setQuery] = useState(''),
    [applied, setApplied] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [reload, setReload] = useState(0),
    [cursor, setCursor] = useState<string | undefined>(),
    [more, setMore] = useState(false);
  useEffect(() => {
    if (status !== 'OPEN' || !userId) return;
    let current = true;
    void storage.list(userId).then(records => {
      if(current) setLocalOrders(records.filter(r => r.order?.status !== 'CLOSED' && r.order?.status !== 'VOID' && (!r.version || r.pending || r.savedRevision < r.revision)).map(r => ({
        ...(r.order ?? {status: 'OPEN' as const, mechanicId: userId}), id: r.id, draft: r.draft, version: r.version ?? '',
      })));
    }).catch(() => { if(current) setError(true); });
  return () => { current = false; };
  }, [status, userId, reload]);
  useEffect(() => {
    let current = true;
    if (status === 'CLOSED' && applied.length < 2) {
      setOrders([]); setMore(false); setLoading(false); setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    void api<{ orders: Order[] }>(
      `/orders?status=${status}&q=${encodeURIComponent(applied)}${cursor ? '&before=' + encodeURIComponent(cursor) : ''}`,
    )
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
  }, [status, applied, cursor, reload]);
  const visible = [...orders, ...localOrders.filter(local => !orders.some(o => o.id === local.id) && (!applied || local.draft.customerName.toLocaleLowerCase().includes(applied.toLocaleLowerCase()) || local.draft.plate === applied.toUpperCase().replace(/[\s-]/g, '')))];
  return (
    <section className="card">
      <h2>{status === 'OPEN' ? 'Órdenes abiertas' : 'Historial'}</h2>
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
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
        <button type="submit" disabled={status === 'CLOSED' && query.trim().length < 2}>Buscar</button>
      </form>
      {loading && <p role="status">Cargando órdenes…</p>}
      {error && (
        <p role="alert">
          No se pudieron cargar las órdenes.{' '}
          <button onClick={() => setReload((n) => n + 1)}>Reintentar</button>
        </p>
      )}
      {status === 'CLOSED' && !applied && <p>Busca por nombre, cédula, placa o número de orden para consultar el historial.</p>}
      {!loading && !error && !visible.length && (status === 'OPEN' || !!applied) && (
        <p>
          No hay órdenes
          {applied
            ? ' que coincidan con la búsqueda'
            : status === 'OPEN'
              ? ' abiertas'
              : ' cerradas'}
          .
        </p>
      )}
      <div className="order-list">
        {visible.map((order) => (
          <article className="order-card" key={order.id}>
            <h3>{order.displayOrderId ?? "Orden local pendiente de sincronizar"}</h3>
            <p>{order.draft.customerName || 'Cliente pendiente'}</p>
            <p>
              {[order.draft.make, order.draft.model, order.draft.plate]
                .filter(Boolean)
                .join(' · ') || 'Vehículo pendiente'}
            </p>
            <p>Mecánico: {order.mechanicName}</p>
            <p>
              Apertura:{' '}
              {order.openedAt &&
                new Date(order.openedAt).toLocaleString('es-CR')}
            </p>
            <p className="total">{formatCRC(order.totalAmount ?? 0)}</p>
            {active?.id === order.id && (
              <p className="status">{active.message}</p>
            )}
            <button disabled={loading} onClick={() => onOpen(order)}>
              {status === 'OPEN' ? 'Continuar' : 'Ver detalle'}
            </button>
          </article>
        ))}
      </div>
      {more && !loading && !error && (
        <button className="quiet" onClick={() => setCursor(orders.at(-1)?.id)}>
          Cargar más
        </button>
      )}
    </section>
  );
}
