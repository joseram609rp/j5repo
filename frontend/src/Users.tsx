import { useEffect, useState } from 'react';
import { api } from './api';
import type { Session } from './session';

type User = {
  id: string;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'MECHANIC';
  active: boolean;
};
export function Users({ session }: { session: Session }) {
  const [users, setUsers] = useState<User[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [username, setUsername] = useState(''),
    [fullName, setFullName] = useState(''),
    [password, setPassword] = useState(''),
    [role, setRole] = useState<User['role']>('MECHANIC'),
    [busy, setBusy] = useState(false),
    [change, setChange] = useState<{
      user: User;
      patch: object;
      label: string;
    } | null>(null),
    [reset, setReset] = useState<User | null>(null),
    [resetPassword, setResetPassword] = useState('');
  async function load() {
    setLoading(true);
    try {
      setUsers((await api<{ users: User[] }>('/admin/users')).users);
      setError('');
    } catch {
      setError('No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function mutate(path: string, method: string, body: object) {
    setBusy(true);
    setError('');
    try {
      await api(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrf,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      await load();
      return true;
    } catch (error) {
      setError(
        error instanceof Error && error.message === 'LAST_ADMIN'
          ? 'Debe quedar al menos un ADMIN activo.'
          : 'No se pudo guardar. Verifica los datos y recarga para comprobar el resultado.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Usuarios</h2>
      {error && (
        <p role="alert">
          {error}{' '}
          <button disabled={busy} onClick={() => void load()}>
            Recargar
          </button>
        </p>
      )}
      {loading && <p role="status">Cargando usuarios…</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mutate('/admin/users', 'POST', {
            username,
            fullName,
            password,
            role,
          }).then((ok) => {
            setPassword('');
            if (ok) {
              setUsername('');
              setFullName('');
            }
          });
        }}
      >
        <h3>Crear usuario</h3>
        <fieldset disabled={busy}>
          <div className="fields">
            <label>
              Usuario
              <input
                required
                pattern="[a-z0-9._-]{3,64}"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
            </label>
            <label>
              Nombre completo
              <input
                required
                maxLength={200}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>
            <label>
              Contraseña (mínimo 12 caracteres)
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Rol
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as User['role'])}
              >
                <option>MECHANIC</option>
                <option>ADMIN</option>
              </select>
            </label>
          </div>
          <button>Crear usuario</button>
        </fieldset>
      </form>
      <div className="order-list">
        {users.map((user) => (
          <article className="order-card" key={user.id}>
            <h3>{user.fullName}</h3>
            <p>
              {user.username} · {user.role} ·{' '}
              {user.active ? 'Activo' : 'Inactivo'}
            </p>
            <button
              disabled={busy || user.id === session.userId}
              className="quiet"
              onClick={() =>
                setChange({
                  user,
                  patch: { active: !user.active },
                  label: user.active ? 'Desactivar' : 'Activar',
                })
              }
            >
              {user.active ? 'Desactivar' : 'Activar'}
            </button>
            <button
              disabled={busy || user.id === session.userId}
              className="quiet"
              onClick={() =>
                setChange({
                  user,
                  patch: { role: user.role === 'ADMIN' ? 'MECHANIC' : 'ADMIN' },
                  label: 'Cambiar rol',
                })
              }
            >
              Cambiar rol
            </button>
            <button
              disabled={busy || user.id === session.userId}
              className="quiet"
              onClick={() => {
                setReset(user);
                setResetPassword('');
              }}
            >
              Reset de contraseña
            </button>
          </article>
        ))}
      </div>
      {reset && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setChange({
              user: reset,
              patch: { password: resetPassword },
              label: 'Restablecer contraseña',
            });
            setReset(null);
            setResetPassword('');
          }}
        >
          <label>
            Nueva contraseña para {reset.username}
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={72}
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
            />
          </label>
          <button disabled={busy}>Continuar</button>
          <button
            type="button"
            className="quiet"
            onClick={() => setReset(null)}
          >
            Cancelar
          </button>
        </form>
      )}
      {change && (
        <div
          className="confirmation"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar cambio de usuario"
        >
          <p>
            ¿{change.label} para {change.user.username}? Sus sesiones se
            cerrarán si cambian sus permisos o contraseña.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void mutate(
                '/admin/users/' + change.user.id,
                'PATCH',
                change.patch,
              ).then((ok) => {
                if (ok) setChange(null);
              })
            }
          >
            Confirmar
          </button>
          <button
            className="quiet"
            disabled={busy}
            onClick={() => setChange(null)}
          >
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
