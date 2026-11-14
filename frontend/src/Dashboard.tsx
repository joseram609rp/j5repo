import type { Session } from './session';
import { InvoiceCount } from './InvoiceTracking';

export function Dashboard({
  session,
  ready,
  choosingOrder,
  onNew,
  onBackfill,
  onPage,
}: {
  session: Session;
  ready: boolean;
  choosingOrder: boolean;
  onNew: () => void;
  onBackfill: () => void;
  onPage: (page: 'dashboard' | 'open' | 'history' | 'users' | 'invoices' | 'operational') => void;
}) {
  const admin = session.role === 'ADMIN';

  if (admin && choosingOrder) {
    return (
      <section className="card">
        <h2>Nueva orden</h2>
        <p>Elegí el tipo de orden.</p>
        <div className="modules">
          <button disabled={!ready} onClick={onNew}>
            Orden del día<span>Abrir una orden de trabajo</span>
          </button>
          <button disabled={!ready} onClick={onBackfill}>
            Orden anterior<span>Registrar un trabajo ya realizado</span>
          </button>
        </div>
        <button className="quiet" onClick={() => onPage('dashboard')}>Volver a Inicio</button>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Inicio</h2>
      <div className="modules">
        <button disabled={!ready} onClick={onNew}>
          Nueva orden
        </button>
        <button onClick={() => onPage('open')}>Órdenes abiertas</button>
        <button onClick={() => onPage('history')}>Historial</button>
        {admin && <>
          <button onClick={() => onPage('operational')}>Panel operativo<span>Ventas y productividad del taller</span></button>
          <button onClick={() => onPage('invoices')}>Facturas electrónicas<InvoiceCount key={session.userId} /></button>
          <button onClick={() => onPage('users')}>Usuarios</button>
        </>}
      </div>
    </section>
  );
}
