import type { Session } from './session';

export function Dashboard({
  session,
  ready,
  onNew,
  onBackfill,
  onPage,
}: {
  session: Session;
  ready: boolean;
  onNew: () => void;
  onBackfill: () => void;
  onPage: (page: 'open' | 'history' | 'users') => void;
}) {
  return (
    <section className="card">
      <h2>Inicio</h2>
      <div className="modules">
        <button disabled={!ready} onClick={onNew}>
          Nueva orden<span>Abrir una orden de trabajo</span>
        </button>
        {session.role === 'ADMIN' && (
          <button disabled={!ready} onClick={onBackfill}>
            Orden anterior<span>Registrar un trabajo ya realizado</span>
          </button>
        )}
        <button onClick={() => onPage('open')}>Órdenes abiertas</button>
        <button onClick={() => onPage('history')}>Historial</button>
        {session.role === 'ADMIN' && (
          <button onClick={() => onPage('users')}>Usuarios</button>
        )}
      </div>
    </section>
  );
}
