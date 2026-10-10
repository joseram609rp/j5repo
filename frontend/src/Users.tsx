import { passwordIssue } from './PasswordInput';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Session } from './session';

type User = {
  id: string;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'MECHANIC';
  active: boolean;
  lockedUntil?: number | null;
  canDelete?: boolean;
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
      method?: 'DELETE';
    } | null>(null),
    [reset, setReset] = useState<User | null>(null),
    [resetPassword, setResetPassword] = useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [confirmReset,setConfirmReset]=useState('');
  const [showInactive,setShowInactive]=useState(false);
  const [passwordError,setPasswordError]=useState('');
  const [resetPasswordError,setResetPasswordError]=useState('');
  const [confirmPasswordTouched,setConfirmPasswordTouched]=useState(false);
  const [confirmResetTouched,setConfirmResetTouched]=useState(false);
  const passwordMismatch=confirmPasswordTouched && password!==confirmPassword;
  const resetMismatch=confirmResetTouched && resetPassword!==confirmReset;
  const createNotice=passwordMismatch ? 'Las contraseñas no coinciden.' : passwordError;
  const resetNotice=resetMismatch ? 'Las contraseñas no coinciden.' : resetPasswordError;
  const loadRevision=useRef(0);
  async function load() {
    const revision=++loadRevision.current;
    setLoading(true);
    try {
      const result=await api<{ users: User[] }>('/admin/users');
      if(revision!==loadRevision.current) return;
      setUsers(result.users);
      setError('');
    } catch {
      if(revision===loadRevision.current) setError('No se pudieron cargar los usuarios.');
    } finally {
      if(revision===loadRevision.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return ()=>{loadRevision.current++;};
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
        error instanceof Error && error.message === 'USERNAME_EXISTS'
          ? `El nombre de usuario ${username.trim().toLowerCase()} ya existe.`
          : error instanceof Error && error.message === 'USER_HAS_HISTORY'
          ? 'Este usuario tiene historial y solo puede desactivarse.'
          : error instanceof Error && error.message === 'USER_MUST_BE_INACTIVE'
          ? 'Desactiva el usuario antes de eliminarlo.'
          : error instanceof Error && error.message === 'CANNOT_DELETE_SELF'
          ? 'No puedes eliminar tu propia cuenta.'
          : error instanceof Error && error.message === 'LAST_ADMIN'
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
          const issue=passwordIssue(password,confirmPassword); setConfirmPasswordTouched(true); setPasswordError(password===confirmPassword ? issue : ''); if(issue) return;
          void mutate('/admin/users', 'POST', {
            username,
            fullName,
            password,
            role,
          }).then((ok) => {
            setPassword(''); setConfirmPassword(''); setConfirmPasswordTouched(false); setPasswordError('');
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
                onChange={(e) => {setPassword(e.target.value);setPasswordError('');}}
              />
            </label>
            <label>Confirmar contraseña<input type="password" required autoComplete="new-password" value={confirmPassword} aria-invalid={passwordMismatch || undefined} aria-describedby={createNotice ? 'create-password-notice' : undefined} onChange={e=>{setConfirmPassword(e.target.value);setConfirmPasswordTouched(true);setPasswordError('');}}/></label>
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
          {createNotice && <p id="create-password-notice" className="password-validation-banner" role="alert">{createNotice}</p>}
          <button>Crear usuario</button>
        </fieldset>
      </form>
      <label className="users-inactive-filter"><input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/>Mostrar usuarios inactivos</label>
      <div className="order-list">
        {users.filter(user=>showInactive || user.active).map((user) => (
          <article className="order-card" key={user.id}>
            <h3>{user.fullName}</h3>
            <p>
              {user.username} · {user.role} ·{' '}
              {!user.active ? 'Inactivo' : (user.lockedUntil ?? 0)>Date.now() ? 'Bloqueado temporalmente' : 'Activo'}
            </p>
            {(user.lockedUntil ?? 0)>Date.now() && <button disabled={busy} onClick={()=>void mutate('/admin/users/'+user.id,'PATCH',{unlock:true})}>Desbloquear</button>}
            {user.canDelete && user.id!==session.userId && <button disabled={busy} onClick={()=>setChange({user,patch:{},label:'Eliminar definitivamente',method:'DELETE'})}>Eliminar definitivamente</button>}
            {!user.active && user.canDelete===false && <p>Este usuario tiene historial y solo puede desactivarse.</p>}
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
                setResetPassword(''); setConfirmReset(''); setConfirmResetTouched(false); setResetPasswordError('');
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
            const issue=passwordIssue(resetPassword,confirmReset); setConfirmResetTouched(true); setResetPasswordError(resetPassword===confirmReset ? issue : ''); if(issue) return;
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
              onChange={(e) => {setResetPassword(e.target.value);setResetPasswordError('');}}
            />
          </label>
          <label>Confirmar nueva contraseña<input type="password" required autoComplete="new-password" value={confirmReset} aria-invalid={resetMismatch || undefined} aria-describedby={resetNotice ? 'reset-password-notice' : undefined} onChange={e=>{setConfirmReset(e.target.value);setConfirmResetTouched(true);setResetPasswordError('');}}/></label>
          {resetNotice && <p id="reset-password-notice" className="password-validation-banner" role="alert">{resetNotice}</p>}
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
                change.method ?? 'PATCH',
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
