import { CatalogInput } from './CatalogInput';
import { ConflictReview, downloadRecovery } from './ConflictReview';
import { applyUpdate, onUpdateAvailable, updateAvailable } from './pwa-update';
import { loadVehicleCatalog, normalizeCatalog, type VehicleCatalog } from './vehicle-catalog';
import { SyncStatus } from './SyncStatus';
import { SessionGate } from './SessionGate';
import { amounts } from '../../backend/src/validation';
import { bootstrapSession, type SessionStatus } from './bootstrap';
import { Dashboard } from './Dashboard';
import { OrderList } from './OrderList';
import { EntitySearch } from './EntitySearch';
import { Users } from './Users';
import { visibleErrors, formatCRC, formatMileage } from './form-validation';
import { useEffect, useRef, useState } from 'react';
import { api, onBackendSuccess } from './api';
import { loginErrorMessage } from './login-error';
import {
  Autosave,
  fresh,
  storage,
  type Draft,
  type Order,
  type RecordState,
} from './autosave';
import { trackActivity, type Session } from './session';
import './style.css';
export function App() {
  const [hasUpdate, setHasUpdate] = useState(updateAvailable);
  useEffect(()=>onUpdateAvailable(()=>setHasUpdate(true)),[]);
  const [conflict, setConflict] = useState<RecordState['conflict']>();
  const [catalog, setCatalog] = useState<VehicleCatalog>({makes:[]});
  const [page, setPage] = useState<
    'dashboard' | 'editor' | 'open' | 'history' | 'users'
  >('dashboard');
  const [ownerRevision, setOwnerRevision] = useState(0);
  const [selectedMechanic, setSelectedMechanic] = useState('');
  const [mechanics, setMechanics] = useState<{id: string; fullName: string; role: string}[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [closing, setClosing] = useState(false);

  const [confirmAction, setConfirmAction] = useState<
    'close' | 'reopen' | 'transfer-owner' | 'void' | null
  >(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking');
  const [bootstrapError, setBootstrapError] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [globalMessage, setGlobalMessage] = useState('');
  const [healthMessage, setHealthMessage] = useState('');
  useEffect(() => onBackendSuccess(() => setHealthMessage('')), []);
  const [editorId, setEditorId] = useState<string | null>(null);
  useEffect(() => { setClosing(false); }, [page, editorId]);
  const [notice, setNotice] = useState<{ page: typeof page; orderId: string | null; message: string; retryable: boolean } | null>(null);
  const noticeGeneration = useRef(0);
  const generation = noticeGeneration.current;
  const message = notice?.page === page && notice.orderId === (page === 'editor' ? editorId : null) ? notice.message : '';
  const retryable = !!message && !!notice?.retryable;
  function setMessage(next: string | ((previous: string) => string)) {
    if (generation !== noticeGeneration.current) return;
    setNotice(previous => ({ page, orderId: page === 'editor' ? editorId : null,
      message: typeof next === 'function' ? next(previous?.message ?? '') : next, retryable: false }));
  }
  function clearNotice() {
    noticeGeneration.current++;
    setNotice(null);
  }
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!session || page !== 'editor') return;
    let live=true;
    const load=()=>{void loadVehicleCatalog(data=>{if(live)setCatalog(data);});};
    load(); window.addEventListener('online',load);
    return ()=>{live=false;window.removeEventListener('online',load);};
  }, [session?.userId, page]);
  const saver = useRef<Autosave | null>(null);
  const creating = useRef(false);
  useEffect(() => {
    if (session?.role !== 'ADMIN' || page !== 'editor' || order?.status !== 'OPEN') return;
    let current = true;
    void api<{users: {id: string; fullName: string; role: string; active: boolean}[]}>('/admin/users')
      .then(data => { if (current) setMechanics(data.users.filter(u => u.active && ['ADMIN', 'MECHANIC'].includes(u.role))); })
      .catch(() => { if (current) setMessage('No se pudieron cargar los mecánicos. Reabre la orden para reintentar.'); });
    return () => { current = false; };
  }, [session, page, order?.id, order?.status]);
  useEffect(() => { setSelectedMechanic(order?.mechanicId ?? ''); }, [order?.id, order?.mechanicId]);
  useEffect(() => {
    if (page !== 'editor' || !order || order.status !== 'OPEN') return;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void saver.current?.refresh().catch(() => undefined);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 30000);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [page, order?.id, order?.status]);
  async function updateMechanic() {
    if (!saver.current || !order || !session || busy) return;
    setBusy(true);
    try {
      await saver.current.flush();
      await saver.current.edit({ ...saver.current.state.draft, mechanicId: selectedMechanic, action: 'assign-mechanic' });
      await saver.current.flush();
      if (saver.current.state.order?.mechanicId !== selectedMechanic) throw new Error('ASSIGNMENT_FAILED');
      setMessage('Mecánico actualizado.');
    } catch { setMessage('No se pudo actualizar el mecánico. Revisa la orden y sincroniza los cambios pendientes.'); }
    finally { setBusy(false); }
  }
  async function checkSession() {
    setGlobalMessage('');
    setHealthMessage('');
    setBootstrapError(false);
    setSessionStatus('checking');
    try {
      const result = await bootstrapSession();
      setSession(result.session);
      setSessionStatus(result.status);
      if (result.status === 'anonymous')
        setGlobalMessage('Inicia sesión para continuar.');
      if (!result.healthOk)
        setHealthMessage(
          'La base de datos no está disponible. Tu copia local está protegida.',
        );
    } catch {
      setBootstrapError(true);
    }
  }
  useEffect(() => {
    void checkSession();
  }, []);
  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let release: (() => void) | undefined;
    const expire = () => {
      if (disposed) return;
      void saver.current?.pause().catch(() => undefined);
      clearNotice();
      setDraft(null);
      setOrder(null);
      setPage('dashboard');
      setSession(null);
      setPage('dashboard');
      setOrder(null);
      setSessionStatus('anonymous');
      setTouched(new Set());
      setGlobalMessage(
        'La sesión terminó. Vuelve a entrar para recuperar tu borrador.',
      );
    };
    const stop = trackActivity(session, expire);
    if (!navigator.locks) {
      setGlobalMessage(
        'Este navegador no admite el bloqueo de edición. Usa una versión reciente.',
      );
      return stop;
    }
    void navigator.locks.request(
      `j5-editor-${session.userId}`,
      { ifAvailable: true },
      async (lock) => {
        if (disposed) return;
        if (!lock) {
          setGlobalMessage(
            'El borrador está abierto en otra pestaña. Ciérrala y recarga aquí.',
          );
          return;
        }
        try {
          if (disposed) return;
          setEditorReady(true);
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          await saver.current?.pause();
        } catch {
          setGlobalMessage(
            'No se pudo abrir el almacenamiento local. Revisa los permisos del navegador.',
          );
        }
      },
    );
    const online = () => void saver.current?.sync();
    window.addEventListener('online', online);
    return () => {
      disposed = true;
      setEditorReady(false);
      stop();
      void saver.current?.pause().catch(() => undefined);
      release?.();
      saver.current = null;
      window.removeEventListener('online', online);
    };
  }, [session]);
  async function login() {
    setBusy(true);
    try {
      setSession(
        await api<Session>('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        }),
      );
      setGlobalMessage('');
      setSessionStatus('authenticated');
      setPage('dashboard');
    } catch (error) {
      setGlobalMessage(loginErrorMessage(error));
    } finally {
      setPassword('');
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await saver.current?.pause();
      await api('/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': session!.csrf },
      });
      setSession(null);
      setSessionStatus('anonymous');
      setTouched(new Set());
      clearNotice();
      setDraft(null);
      setGlobalMessage('Sesión cerrada. Borrador conservado en este dispositivo.');
    } catch {
      setGlobalMessage(
        'No se pudo cerrar la sesión. Reintenta antes de dejar el dispositivo.',
      );
    }
  }
  async function attach(record: RecordState) {
    if (!session) return;
    await saver.current?.pause();
    await storage.write(session.userId, record);
    clearNotice();
    setEditorId(record.id);
    const serviceGeneration = noticeGeneration.current;
    const service = new Autosave(
      record,
      session.userId,
      session.csrf,
      (text, retry = false) => {
        // Ignore UI reports from an editor left or replaced while work was in flight.
        if (serviceGeneration !== noticeGeneration.current || saver.current !== service) return;
        setNotice({ page: 'editor', orderId: record.id, message: text, retryable: retry });
        setOrder(service.state.order ?? null);
        setConflict(service.state.conflict ? {...service.state.conflict} : undefined);
        if (service.state.conflict || !service.state.pending && !service.state.draft.action)
          setConfirmAction(null);
        setDraft({ ...service.state.draft });
      },
      () => {
        setSession(null);
        setSessionStatus('anonymous');
        setGlobalMessage('La sesión terminó. Vuelve a entrar para recuperar tu borrador.');
        clearNotice();
        setPage('dashboard');
      },
    );
    saver.current = service;
    setDraft(record.draft);
    setConflict(record.conflict);
    setOrder(record.order ?? null);
    setTouched(new Set());
    setClosing(false);
    setConfirmAction(
      record.conflict ? null : record.pending?.draft.action === 'void' ? 'void' : record.pending?.draft.action === 'close'
        ? 'close'
        : record.pending?.draft.action === 'reopen'
          ? 'reopen'
          : record.pending?.draft.action === 'transfer-owner'
            ? 'transfer-owner'
            : null,
    );
    setPage('editor');
    if (!record.order || record.order.status === 'OPEN') {
      await service.sync();
      setOrder(service.state.order ?? null);
    }
  }
  async function navigate(next: typeof page) {
    if (busy) return;
    if (confirmAction) {
      setMessage('Confirma o cancela la acción pendiente.');
      return;
    }
    // Leaving the module preserves local changes and the editor lock; entering another order requires sync.
    if (next !== page) clearNotice();
    setPage(next);
  }
  async function newOrder() {
    if (!session || !editorReady || busy || creating.current || confirmAction) return;
    creating.current = true;
    setBusy(true);
    try {
      await storage.read(session.userId); // Migrate the legacy draft without reusing it.
      const record = fresh();
      record.revision = 1;
      await attach(record);
    } catch {
      setMessage(
        'No se pudo abrir la orden. Tu borrador local está conservado.',
      );
    } finally {
      creating.current = false;
      setBusy(false);
    }
  }
  async function openOrder(selected: Order) {
    if (!session || !editorReady || busy) return;
    setBusy(true);
    try {
      const local = saver.current?.state.id === selected.id
        ? saver.current.state : await storage.read(session.userId, selected.id);
      if (
        local?.id === selected.id &&
        (local.pending || local.savedRevision < local.revision || !local.version)
      ) {
        await attach(local);
        return;
      }
      await saver.current?.pause();
      const remote = await api<Order>('/orders/' + selected.id);
      if (remote.status !== 'OPEN') {
        clearNotice();
        setEditorId(remote.id);
        setDraft(remote.draft);
        setConflict(undefined);
        setOrder(remote);
        setTouched(new Set());
        setClosing(false);
        setConfirmAction(null);
        setPage('editor');
      } else
        await attach({
          id: remote.id,
          draft: remote.draft,
          version: remote.version,
          order: remote,
          revision: 0,
          savedRevision: 0,
        });
    } catch {
      setMessage(
        'No se pudo abrir otra orden. Revisa la conexión o sincroniza el borrador pendiente.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function performAction() {
    if (!confirmAction || !order || !session) return;
    const action = confirmAction;
    setBusy(true);
    try {
      // History pauses the previous saver, including when it owns this same order.
      // Keep only a pending reopen receipt; otherwise attach a fresh active editor.
      if (action === 'reopen' && (saver.current?.state.id !== order.id || saver.current.state.pending?.draft.action !== 'reopen'))
        await attach({
          id: order.id,
          draft: order.draft,
          version: order.version,
          order,
          revision: 0,
          savedRevision: 0,
        });
      if (!saver.current) throw new Error('EDITOR_NOT_READY');
      const saved = await saver.current.action(action);
      if (action === 'transfer-owner') setOwnerRevision(n => n + 1);
      if (action === 'close') setClosing(false);
      setOrder(saved ?? null);
      setDraft(saver.current.state.draft);
      setConfirmAction(null);
      setNotice({ page: 'editor', orderId: saver.current.state.id, retryable: false, message:
        action === 'void'
          ? 'Orden cancelada. Se conserva su información.'
          : action === 'close'
          ? 'Orden cerrada correctamente.'
          : action === 'reopen'
            ? 'Orden reabierta.'
            : 'Dueño actual actualizado. El historial anterior se conserva.',
      });
    } catch {
      if (!saver.current?.state.pending) setConfirmAction(null);
      setMessage(
        previous => previous.includes('Conflicto de versión.') ? previous : 'La acción no se confirmó. La copia local está protegida; reintenta para recuperar el resultado.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function resolveConflict(version: string, selected?: Draft) {
    const service=saver.current;
    if(!service || busy) return;
    setBusy(true);
    try {
      await service.resolveConflict(version,selected);
      setConfirmAction(null);
      setClosing(false);
    } catch(error) {
      setMessage(error instanceof Error && error.message==='REVIEW_CHANGED'
        ? 'La orden cambió nuevamente. Revisa los datos actualizados antes de guardar.'
        : 'No se pudo resolver el conflicto. Tu borrador sigue protegido; revisa la conexión y vuelve a intentar.');
    } finally {
      if(saver.current===service) {
        setConflict(service.state.conflict ? {...service.state.conflict} : undefined);
        setDraft({...service.state.draft});setOrder(service.state.order ?? null);
      }
      setBusy(false);
    }
  }
  async function updateApp() {
    if(busy || confirmAction || conflict) return;
    setBusy(true);
    try { await saver.current?.flush(); await applyUpdate(); }
    catch { setHealthMessage('Sincroniza tus cambios antes de actualizar. Tu copia local está protegida.'); }
    finally { setBusy(false); }
  }
  function saveDraft(next: Draft) {
    if (busy || confirmAction || conflict || (order && order.status !== 'OPEN')) return;
    setDraft(next);
    void saver.current
      ?.edit(next)
      .catch(() =>
        setMessage(
          'La orden tiene una acción pendiente; recupera el resultado antes de editar.',
        ),
      );
  }
  function editItem(
    index: number,
    field: 'description' | 'price' | 'notes',
    value: string,
  ) {
    if (!draft) return;
    saveDraft({
      ...draft,
      items: draft.items?.map((item, i) =>
        i === index
          ? { ...item, [field]: field === 'price' ? Number(value) : value }
          : item,
      ),
    });
  }
  function edit(field: keyof Draft, value: string) {
    if (!draft) return;
    const next = {
      ...draft,
      ...(field === 'identification' ? { customerId: undefined } : {}),
      ...(field === 'plate' ? { vehicleId: undefined } : {}),
      [field]:
        field === 'mileage' || field === 'year'
          ? value === ''
            ? null
            : Number(value)
          : value,
    };
    saveDraft(next);
  }
  const canFinish = !order || session?.role === 'ADMIN' || order.mechanicId === session?.userId;
  const taxRate = order && order.status !== 'OPEN' ? order.taxRate ?? 0 : 13;
  const totals = amounts(draft?.items, taxRate);
  const errors = draft ? visibleErrors(draft, touched, closing) : [];
  const readOnly =
    (!!order && order.status !== 'OPEN') ||
    !!confirmAction ||
    !!conflict ||
    busy ||
    !!saver.current?.state.pending?.draft.action;
  const editor = page === 'editor';
  function validation(field: string) {
    const error = errors.find((e) => e.field === field);
    return error ? (
      <small className="validation" id={`${field}-error`}>
        {error.message}
      </small>
    ) : null;
  }
  function accessibility(field: string) {
    return {
      'aria-invalid': errors.some((e) => e.field === field),
      'aria-describedby': errors.some((e) => e.field === field)
        ? `${field}-error`
        : undefined,
    };
  }
  return (
    <div className="layout">
      <header>
        <a
          className="brand"
          href="/"
          aria-label="Frenos La Bandera, inicio"
          onClick={(e) => {
            if (session) {
              e.preventDefault();
              void navigate('dashboard');
            }
          }}
        >
          <img
            className="brand-logo"
            src="/logo.png"
            alt="J5 Taller de Frenos La Bandera"
          />
        </a>
        <span className="tag">
          {session &&
            `${session.fullName ?? session.username} · ${session.role}`}
        </span>
        {session && (
          <button className="quiet" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        )}
      </header>
      <main>
        {hasUpdate && <p role="status">Hay una actualización disponible. <button type="button" disabled={busy || !!confirmAction || !!conflict} onClick={()=>void updateApp()}>Actualizar aplicación</button></p>}
        {healthMessage && <p role="status">{healthMessage}</p>}
        {sessionStatus === 'authenticated' && session && (
          <>
            <nav aria-label="Navegación principal">
              <button
                className="quiet"
                onClick={() => void navigate('dashboard')}
              >
                Inicio
              </button>
              <button className="quiet" onClick={() => void navigate('open')}>
                Órdenes abiertas
              </button>
              <button
                className="quiet"
                onClick={() => void navigate('history')}
              >
                Historial
              </button>
              {session.role === 'ADMIN' && (
                <button
                  className="quiet"
                  onClick={() => void navigate('users')}
                >
                  Usuarios
                </button>
              )}
            </nav>
            {page === 'dashboard' && (
              <Dashboard
                session={session}
                ready={editorReady && !busy}
                onNew={() => void newOrder()}
                onPage={(next) => void navigate(next)}
              />
            )}
            {(page === 'open' || page === 'history') && (
              <OrderList
                key={page}
                userId={session.userId}
                role={session.role}
                onCancel={async selected => {
                  await openOrder(selected);
                  const current = saver.current?.state.order;
                  if (current?.id === selected.id && current.status === 'OPEN' && (session.role === 'ADMIN' || current.mechanicId === session.userId)) setConfirmAction('void');
                }}
                status={page === 'open' ? 'OPEN' : 'CLOSED'}
                onOpen={(o) => void openOrder(o)}
              />
            )}
            {page === 'users' && session.role === 'ADMIN' && (
              <Users session={session} />
            )}
            {globalMessage && <p role="status">{globalMessage}</p>}

            {!editor && message && <p role="status">{message}</p>}
          </>
        )}

        <section
          hidden={sessionStatus === 'authenticated' && !editor}
          className={
            sessionStatus === 'authenticated' ? 'card editor' : 'card login'
          }
        >
          <div className="card-top">
            <h2>
              {sessionStatus === 'authenticated'
                ? (order?.displayOrderId ?? 'Orden local')
                : 'Iniciar sesión'}
            </h2>
            {sessionStatus === 'authenticated' && (
              <span className="badge">
                {order?.status === 'VOID' ? 'CANCELADA' : order?.status === 'CLOSED' ? 'CERRADA' : 'ABIERTA'}
              </span>
            )}
          </div>
          {sessionStatus === 'authenticated' && order && (
            <p>
              Apertura:{' '}
              {order.openedAt
                ? new Date(order.openedAt).toLocaleString('es-CR')
                : 'Pendiente de sincronización'}
              {order.closedAt && (
                <>
                  {' '}
                  · Cierre: {new Date(order.closedAt).toLocaleString('es-CR')}
                </>
              )}
            </p>
          )}
          <SessionGate
            status={sessionStatus}
            checking={
              <div className="session-loading" role="status" aria-live="polite">
                <img
                  className="login-logo"
                  src="/logo.png"
                  alt="J5 Taller de Frenos La Bandera"
                />
                <h3>
                  {bootstrapError
                    ? 'No se pudo comprobar la sesión'
                    : 'Comprobando sesión…'}
                </h3>
                {bootstrapError && (
                  <button onClick={() => void checkSession()}>
                    Reintentar
                  </button>
                )}
              </div>
            }
            anonymous={
              <form
                className="empty"
                onSubmit={(e) => {
                  e.preventDefault();
                  void login();
                }}
              >
                <img
                  className="login-logo"
                  src="/logo.png"
                  alt="Frenos La Bandera"
                />
                <label>
                  Usuario
                  <input
                    autoComplete="username"
                    required
                    maxLength={64}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </label>
                <label>
                  Contraseña
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={72}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button disabled={busy} type="submit">
                  {busy ? 'Ingresando…' : 'Entrar'}
                </button>
              </form>
            }
            authenticated={
              draft && session ? (
                <form
                  noValidate
                  onSubmit={(e) => e.preventDefault()}
                  onBlur={(e) => {
                    const field = e.target.getAttribute('data-field');
                    if (field)
                      setTouched((current) => new Set(current).add(field));
                  }}
                >
                  {closing && errors.length > 0 && (
                    <div role="alert" className="error-summary">
                      <h3>Revisa estos datos antes de cerrar</h3>
                      <ul>
                        {errors.map((error) => (
                          <li key={error.field}>
                            {error.section}: {error.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {conflict && saver.current && <ConflictReview key={editorId+':'+conflict.remote.version} record={saver.current.state} busy={busy} onResolve={(version,selected)=>void resolveConflict(version,selected)} />}
                  {!!saver.current?.state.recoveryCopies?.length && <button type="button" className="quiet" onClick={()=>{if(saver.current)downloadRecovery(saver.current.state);}}>Descargar copias de recuperación</button>}
                  {(!order || order.status === 'OPEN') && !conflict && (
                    <div hidden={!!confirmAction || busy}><EntitySearch key={`${page}:${editorId}`} ownerRevision={ownerRevision} draft={draft} onSelect={saveDraft} allowTransfer={(session.role === 'ADMIN' || session.role === 'MECHANIC')} onTransfer={() => {
                      setBusy(true);
                      void saver.current?.flush().then(() => { setOrder(saver.current?.state.order ?? null); setConfirmAction('transfer-owner'); })
                        .catch(() => setMessage('Sincroniza la orden antes de actualizar el dueño.')).finally(() => setBusy(false));
                    }} /></div>
                  )}
                  <fieldset disabled={readOnly}>
                    <h3>Datos del cliente</h3>
                    <label>
                      Nombre completo
                      <input
                        data-field="customerName"
                        {...accessibility('customerName')}
                        value={draft.customerName}
                        maxLength={200}
                        onChange={(e) => edit('customerName', e.target.value)}
                      />
                      {validation('customerName')}
                    </label>
                    <div className="fields">
                      <label>
                        Cédula (9 dígitos)
                        <input
                          data-field="identification"
                          {...accessibility('identification')}
                          inputMode="numeric"
                          maxLength={9}
                          value={draft.identification ?? ''}
                          onChange={(e) =>
                            edit('identification', e.target.value)
                          }
                        />
                        {validation('identification')}
                      </label>
                      <label>
                        Teléfono (8 dígitos)
                        <input
                          data-field="phone"
                          {...accessibility('phone')}
                          inputMode="numeric"
                          maxLength={8}
                          value={draft.phone ?? ''}
                          onChange={(e) => edit('phone', e.target.value)}
                        />
                        {validation('phone')}
                      </label>
                    </div>
                    <label>
                      Correo opcional
                      <input
                        data-field="email"
                        {...accessibility('email')}
                        type="email"
                        maxLength={254}
                        value={draft.email ?? ''}
                        onChange={(e) => edit('email', e.target.value)}
                      />
                      {validation('email')}
                    </label>
                    <h3>Datos del vehículo</h3>
                    <div className="fields">
                      <label>
                        Placa
                        <input
                          data-field="plate"
                          {...accessibility('plate')}
                          value={draft.plate}
                          placeholder="ABC123"
                          maxLength={20}
                          onChange={(e) =>
                            edit(
                              'plate',
                              e.target.value
                                .toUpperCase()
                                .replace(/[\s-]/g, ''),
                            )
                          }
                        />
                        {validation('plate')}
                      </label>
                      <label>
                        Kilometraje
                        <input
                          data-field="mileage"
                          {...accessibility('mileage')}
                          type="number"
                          min={0}
                          max={10000000}
                          step={1}
                          value={draft.mileage ?? ''}
                          onChange={(e) => edit('mileage', e.target.value)}
                        />
                        <small className="currency-preview">
                          {formatMileage(draft.mileage)}
                        </small>
                        {validation('mileage')}
                      </label>
                    </div>
                    <div className="fields">
                      <label>
                        Marca
                        <CatalogInput
                          data-field="make"
                          {...accessibility('make')}
                          maxLength={100}
                          value={draft.make ?? ''}
                          values={catalog.makes.map(m=>m.name)}
                          onValue={value => edit('make', value)}
                        />
                        {validation('make')}
                      </label>
                      <label>
                        Modelo
                        <CatalogInput
                          data-field="model"
                          {...accessibility('model')}
                          maxLength={100}
                          placeholder="Fortuner, Corolla, Hilux"
                          value={draft.model ?? ''}
                          values={catalog.makes.find(m=>normalizeCatalog(m.name)===normalizeCatalog(draft.make ?? ''))?.models ?? []}
                          onValue={value => edit('model', value)}
                        />
                        {validation('model')}
                      </label>
                    </div>
                    <div className="fields">
                      <label>
                        Año
                        <input
                          data-field="year"
                          {...accessibility('year')}
                          type="number"
                          min={1950}
                          step={1}
                          value={draft.year ?? ''}
                          onChange={(e) => edit('year', e.target.value)}
                        />
                        {validation('year')}
                      </label>
                    </div>
                    {session.role === 'ADMIN' && order?.status === 'OPEN' && <label>Mecánico asignado
                      <select aria-label="Mecánico asignado" value={selectedMechanic} onChange={e => setSelectedMechanic(e.target.value)}>
                        {!mechanics.some(u => u.id === order.mechanicId) && <option value={order.mechanicId}>{order.mechanicName}</option>}
                        {mechanics.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>)}
                      </select>
                    <button type="button" disabled={readOnly || !selectedMechanic || selectedMechanic === order.mechanicId} onClick={() => void updateMechanic()}>Actualizar mecánico</button>
                    </label>}
                    <p>
                      Mecánico:{' '}
                      {order?.mechanicName ??
                        session.fullName ??
                        session.username}
                    </p>
                    <h3>Trabajos realizados · CRC</h3>
                    {validation('items')}
                    {(draft.items ?? []).map((item, index) => (
                      <div className="fields" key={index}>
                        <label>
                          Descripción
                          <input
                            data-field={`item-${index}-description`}
                            {...accessibility(`item-${index}-description`)}
                            maxLength={500}
                            value={item.description}
                            onChange={(e) =>
                              editItem(index, 'description', e.target.value)
                            }
                          />
                          {validation(`item-${index}-description`)}
                        </label>
                        <label>
                          Precio sin IVA
                          <input
                            data-field={`item-${index}-price`}
                            {...accessibility(`item-${index}-price`)}
                            type="number"
                            min={0.01}
                            max={9999999999.99}
                            step={0.01}
                            value={item.price || ''}
                            onChange={(e) =>
                              editItem(index, 'price', e.target.value)
                            }
                          />
                          <small className="currency-preview">
                            {formatCRC(item.price)}
                          </small>
                          {validation(`item-${index}-price`)}
                          <small className="currency-preview">IVA {taxRate}%: {formatCRC(amounts([item], taxRate).tax)}</small>
                        </label>
                        <label>Observación del trabajo (opcional)
                          <textarea data-field={`item-${index}-notes`} rows={2} maxLength={2000} value={item.notes ?? ''} onChange={e => editItem(index, 'notes', e.target.value)} />
                        </label>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => {
                            setTouched(
                              (current) =>
                                new Set(
                                  [...current].filter(
                                    (field) => !field.startsWith('item-'),
                                  ),
                                ),
                            );
                            saveDraft({
                              ...draft,
                              items: draft.items?.filter((_, i) => i !== index),
                            });
                          }}
                        >
                          Quitar trabajo
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        saveDraft({
                          ...draft,
                          items: [
                            ...(draft.items ?? []),
                            { description: '', price: 0 },
                          ],
                        })
                      }
                    >
                      Agregar trabajo
                    </button>
                    <div className="totals" aria-label="Resumen de importes">
                      <p>Subtotal: {formatCRC(order && order.status !== 'OPEN' ? order.subtotalAmount ?? totals.subtotal : totals.subtotal)}</p>
                      <p>IVA {taxRate}%: {formatCRC(order && order.status !== 'OPEN' ? order.taxAmount ?? totals.tax : totals.tax)}</p>
                      <p className="total">Precio final: {formatCRC(order && order.status !== 'OPEN' ? order.totalAmount ?? totals.total : totals.total)}</p>
                    </div>
                    <h3>Pago y factura</h3>
                    <label>Método de pago (obligatorio)
                      <select data-field="paymentMethod" {...accessibility('paymentMethod')} value={draft.paymentMethod ?? ''} onChange={e => saveDraft({...draft, paymentMethod: e.target.value ? e.target.value as Draft['paymentMethod'] : undefined})}>
                        <option value="">Selecciona un método</option><option value="SINPE">SINPE</option><option value="CREDIT_CARD">Tarjeta de crédito</option><option value="DEBIT_CARD">Tarjeta de débito</option><option value="CASH">Efectivo</option><option value="BANK_TRANSFER">Transferencia bancaria</option>
                      </select>{validation('paymentMethod')}
                    </label>
                    <label>¿Requiere factura electrónica? (obligatorio)
                      <select data-field="electronicInvoice" {...accessibility('electronicInvoice')} value={draft.electronicInvoice === undefined ? '' : String(draft.electronicInvoice)} onChange={e => saveDraft({...draft, electronicInvoice: e.target.value === '' ? undefined : e.target.value === 'true'})}>
                        <option value="">Selecciona Sí o No</option><option value="true">Sí</option><option value="false">No</option>
                      </select>{validation('electronicInvoice')}
                    </label>
                    <small>
                      El servidor calcula el total oficial al guardar.
                    </small>
                    <label>
                      Observaciones generales (opcional)
                      <textarea
                        data-field="notes"
                        {...accessibility('notes')}
                        rows={3}
                        maxLength={5000}
                        value={draft.notes ?? ''}
                        onChange={(e) => edit('notes', e.target.value)}
                      />
                      {validation('notes')}
                    </label>
                    <label>
                      Recomendaciones generales (opcional)
                      <textarea
                        rows={3}
                        maxLength={5000}
                        value={draft.recommendations ?? ''}
                        onChange={(e) =>
                          edit('recommendations', e.target.value)
                        }
                      />
                    </label>
                  </fieldset>
                  {editor && closing && (!order || order.status === 'OPEN') && visibleErrors(draft, touched, true).length > 0 && (
                    <div className="close-errors confirmation" role="alert">
                      <p>Para cerrar la orden, completa:</p>
                      <ul>{visibleErrors(draft, touched, true).map(error => <li key={error.field}>{error.section}: {error.message}</li>)}</ul>
                    </div>
                  )}
                  <div className="order-actions">
                  {(!order || order.status === 'OPEN') && !conflict && canFinish && (
                    <button
                      type="button"
                      className="danger"
                      disabled={busy || !!confirmAction}
                      onClick={() => {
                        setClosing(true);
                        if (visibleErrors(draft, touched, true).length === 0) {
                          setBusy(true);
                          void saver.current
                            ?.flush()
                            .then(() => {
                              setOrder(saver.current?.state.order ?? null);
                              setConfirmAction('close');
                            })
                            .catch(() =>
                              setMessage(
                                'Sincroniza la orden antes de confirmar su cierre.',
                              ),
                            )
                            .finally(() => setBusy(false));
                        }
                      }}
                    >
                      Cerrar orden
                    </button>
                  )}
                  {order?.status === 'OPEN' && !conflict && (session.role === 'ADMIN' || order.mechanicId === session.userId) && (
                    <button type="button" className="danger" disabled={busy || !!confirmAction} onClick={() => setConfirmAction('void')}>Cancelar orden</button>
                  )}
                  </div>
                  {order?.status === 'CLOSED' && !conflict && session.role === 'ADMIN' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmAction('reopen')}
                    >
                      Reabrir orden
                    </button>
                  )}
                  {confirmAction && (
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-label="Confirmar acción"
                      className="confirmation"
                    >
                      <p>
                        {confirmAction === 'void'
                          ? `¿Cancelar la orden ${order?.displayOrderId}? Esta acción la quitará de órdenes abiertas.`
                          : confirmAction === 'close'
                          ? `¿Cerrar la orden ${order?.displayOrderId ?? 'local'}?`
                          : confirmAction === 'reopen'
                            ? `¿Reabrir la orden ${order?.displayOrderId}?`
                            : `¿Asignar el vehículo ${draft.plate} a ${draft.customerName} (${draft.identification})? Las órdenes anteriores conservan su cliente.`}
                      </p>
                      <p>Total: {formatCRC(totals.total)}</p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void performAction()}
                      >
                        {busy ? 'Procesando…' : 'Confirmar'}
                      </button>
                      <button
                        type="button"
                        className="quiet"
                        disabled={
                          busy || !!saver.current?.state.pending?.draft.action
                        }
                        onClick={() => setConfirmAction(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </form>
              ) : (
                <div className="session-loading" role="status">
                  Preparando borrador…
                </div>
              )
            }
          />
          <SyncStatus
            message={sessionStatus === 'authenticated' ? (editor ? message : '') : globalMessage}
            retryable={
              retryable && !!draft && sessionStatus === 'authenticated'
            }
            onRetry={() => void saver.current?.sync()}
          />
        </section>
      </main>
    </div>
  );
}
