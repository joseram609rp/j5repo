import { useEffect, useState } from 'react';
import { api } from './api';
import { formatCRC } from './form-validation';
import type { Order } from './autosave';

export function OrderList({
  status,
  onOpen,
  active,
}: {
  status: 'OPEN' | 'CLOSED';
  onOpen: (order: Order) => void;
  active?: { id: string; message: string };
}) {
  const [orders, setOrders] = useState<Order[]>([]),
    [query, setQuery] = useState(''),
    [applied, setApplied] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [reload, setReload] = useState(0),
    [cursor, setCursor] = useState<string | undefined>(),
    [more, setMore] = useState(false);
  useEffect(() => {
    let current = true;
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
        <button type="submit">Buscar</button>
      </form>
      {loading && <p role="status">Cargando órdenes…</p>}
      {error && (
        <p role="alert">
          No se pudieron cargar las órdenes.{' '}
          <button onClick={() => setReload((n) => n + 1)}>Reintentar</button>
        </p>
      )}
      {!loading && !error && !orders.length && (
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
        {orders.map((order) => (
          <article className="order-card" key={order.id}>
            <h3>{order.displayOrderId}</h3>
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
