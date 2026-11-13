import { LegacyHistory } from './LegacyHistory';
import { YearPicker } from './YearPicker';
import { CatalogInput } from './CatalogInput';
import { ConflictReview, downloadRecovery } from './ConflictReview';
import { applyUpdate, onUpdateAvailable, updateAvailable } from './pwa-update';
import { loadVehicleCatalog, normalizeCatalog, type VehicleCatalog } from './vehicle-catalog';
import { SyncStatus } from './SyncStatus';
import { SessionGate } from './SessionGate';
import { onDraftChange } from './draft-changes';
import { amounts, latestBackfillDate } from '../../backend/src/validation';
import { bootstrapSession, type SessionStatus } from './bootstrap';
import { Dashboard } from './Dashboard';
import { InvoiceTracking } from './InvoiceTracking';
import { OrderList } from './OrderList';
import { OrderPreview } from './OrderPreview';
import { EntitySearch } from './EntitySearch';
import { Users } from './Users';
import { visibleErrors, formatCRC, formatMileage, formatRegistrationDate, formatWorkDate } from './form-validation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, ApiError, onBackendSuccess } from './api';
import { loginErrorMessage } from './login-error';
import {
  Autosave,
  CloseReviewChanged,
  LocalConflict,
  canCancelBackfill,
  draftUpgradeMessage,
  fresh,
  matchesCloseRevision,
  storage,
  validCloseDraft,
  type CloseRevision,
  type Draft,
  type Order,
  type RecordState,
} from './autosave';
import { trackActivity, type Session } from './session';
import './style.css';

function invoiceOrderId() {
  return typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('invoiceOrder');
}

export function App() {
  const [hasUpdate, setHasUpdate] = useState(updateAvailable);
  useEffect(()=>onUpdateAvailable(()=>setHasUpdate(true)),[]);
  const [conflict, setConflict] = useState<RecordState['conflict']>();
  const [catalog, setCatalog] = useState<VehicleCatalog>({makes:[]});
  const [page, setPage] = useState<
    'dashboard' | 'new-order' | 'editor' | 'open' | 'history' | 'legacy' | 'users' | 'invoices' | 'invoice-order'
  >(() => invoiceOrderId() === null ? 'dashboard' : 'invoice-order');
  const invoiceDetail = page === 'invoice-order';
  const [invoiceDetailError, setInvoiceDetailError] = useState('');
  const [invoiceDetailRevision, setInvoiceDetailRevision] = useState(0);
  const [ownerRevision, setOwnerRevision] = useState(0);
  const [selectedMechanic, setSelectedMechanic] = useState('');
  const [mechanicRoster, setMechanicRoster] = useState<{id: string; fullName: string; role: string; active: boolean}[]>([]);
  const mechanics = mechanicRoster.filter(user => user.active);
  const [order, setOrder] = useState<Order | null>(null);
  const activeSession = useRef<Session | null>(null);
  const [backfillStartError, setBackfillStartError] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeOwner,setCloseOwner]=useState<{vehicleId:string;customerId:string;expectedOwnerId:string;ownerName:string;decision:'transfer'|'keep'} | null>(null);
  const [preview, setPreview] = useState<{
    draft: Draft; revision: CloseRevision; businessDate?: string; stale?: boolean;
  } | null>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const restorePreviewFocus = useRef(false);
  useLayoutEffect(() => {
    if (!preview && restorePreviewFocus.current) {
      restorePreviewFocus.current = false;
      previewButton.current?.focus();
    }
  }, [preview]);

  const [confirmAction, setConfirmAction] = useState<
    'close' | 'reopen' | 'transfer-owner' | 'void' | null
  >(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking');
  useEffect(() => {
    if (!invoiceDetail || sessionStatus !== 'authenticated' || session?.role !== 'ADMIN') return;
    const id = invoiceOrderId();
    if (!id || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      setInvoiceDetailError('El enlace de la orden es inválido.');
      return;
    }
    const controller = new AbortController();
    setInvoiceDetailError('');
    void api<Order>('/admin/invoice-tracking/orders/' + id, { signal: controller.signal }).then(remote => {
      if (controller.signal.aborted) return;
      setOrder(remote);
      setDraft(remote.draft);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setInvoiceDetailError(error instanceof ApiError && error.status === 404
        ? 'La orden ya no está cerrada, no requiere factura electrónica o no existe.'
        : error instanceof ApiError && error.status === 403
          ? 'Esta sección es exclusiva para administradores.'
          : 'No se pudo consultar la orden.');
    });
    return () => controller.abort();
  }, [invoiceDetail, sessionStatus, session, invoiceDetailRevision]);
  const [bootstrapError, setBootstrapError] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [terminalRecovery, setTerminalRecovery] = useState<RecordState>();
  const historical = !!order?.isBackfilled || draft?.workDate !== undefined;
  const [loginMessage, setLoginMessage] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [healthMessage, setHealthMessage] = useState('');
  useEffect(() => onBackendSuccess(() => setHealthMessage('')), []);
  const [editorId, setEditorId] = useState<string | null>(null);
  useEffect(() => { setClosing(false); setCloseOwner(null); setPreview(null); }, [page, editorId]);
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
    setBackfillStartError(false);
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
  const orderOperation = useRef(false);
  const canFollowDraft = useRef(false);
  useLayoutEffect(() => {
    canFollowDraft.current = page === 'editor' && !busy && !confirmAction;
  }, [page, busy, confirmAction]);
  useLayoutEffect(() => {
    setLogoutError('');
    setUpdateError('');
  }, [page, editorId, session]);
  useEffect(() => {
    const assigningMechanic = page === 'editor' && (order?.status === 'OPEN' || (historical && !order));
    if (session?.role !== 'ADMIN' || (page !== 'open' && !assigningMechanic)) return;
    let current = true;
    void api<{users: {id: string; fullName: string; role: string; active: boolean}[]}>('/admin/users')
      .then(data => { if (current) setMechanicRoster(data.users.filter(u => ['ADMIN', 'MECHANIC'].includes(u.role))); })
      .catch(() => { if (current && assigningMechanic) setMessage('No se pudieron cargar los mecánicos. Reabre la orden para reintentar.'); });
    return () => { current = false; };
  }, [session, page, editorId, historical, order?.id, order?.status]);
  useEffect(() => { setSelectedMechanic(order?.mechanicId ?? ''); }, [order?.id, order?.mechanicId]);
  useEffect(() => {
    if (page !== 'editor' || busy || confirmAction) return;
    let current = true;
    const canApply = () => current && canFollowDraft.current && !orderOperation.current && document.visibilityState !== 'hidden';
    const refreshLocal = () => {
      const service = saver.current;
      if (canApply()) void service?.refreshLocal(canApply).catch(() => undefined);
    };
    const refresh = () => {
      const service = saver.current;
      if (!service || !canApply()) return;
      void (async () => {
        await service.refreshLocal(canApply).catch(() => undefined);
        if (canApply() && saver.current === service) await service.refresh(false, true, canApply);
      })().catch(() => undefined);
    };
    const stop = onDraftChange(refreshLocal);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 30000);
    refreshLocal();
    return () => {
      current = false;
      stop();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [page, editorId, busy, confirmAction]);
  async function updateMechanic() {
    const service = saver.current;
    if (!service || !order || !session || busy) return;
    setBusy(true);
    try {
      await service.flush(true);
      await service.edit({ ...service.state.draft, mechanicId: selectedMechanic, action: 'assign-mechanic' });
      await service.flush();
      if (service.state.order?.mechanicId !== selectedMechanic) throw new Error('ASSIGNMENT_FAILED');
      setMessage('Mecánico actualizado.');
    } catch { setMessage('No se pudo actualizar el mecánico. Revisa la orden y sincroniza los cambios pendientes.'); }
    finally { setBusy(false); }
  }
  async function checkSession(isCurrent = () => true) {
    setLoginMessage('');
    setHealthMessage('');
    setBootstrapError(false);
    setSessionStatus('checking');
    try {
      const result = await bootstrapSession();
      if (!isCurrent()) return;
      setSession(result.session);
      setSessionStatus(result.status);
      if (result.status === 'anonymous')
        setLoginMessage('Inicia sesión para continuar.');
      if (!result.healthOk)
        setHealthMessage(
          'La base de datos no está disponible. Tu copia local está protegida.',
        );
    } catch {
      if (isCurrent()) setBootstrapError(true);
    }
  }
  useEffect(() => {
    let current = true;
    void checkSession(() => current);
    return () => { current = false; };
  }, []);
  function detachSaver() {
    const service = saver.current;
    saver.current = null;
    void service?.pause(true).catch(() => undefined);
  }
  function expireSession(expected: Session) {
    if (activeSession.current !== expected) return;
    activeSession.current = null;
    detachSaver();
    clearNotice();
    setConfirmAction(null);
    setConflict(undefined);
    setDraft(null);
    setOrder(null);
    setPage(invoiceOrderId() === null ? 'dashboard' : 'invoice-order');
    setSession(null);
    setSessionStatus('anonymous');
    setTouched(new Set());
    setLoginMessage(invoiceOrderId() === null
      ? 'La sesión terminó. Vuelve a entrar para recuperar tu borrador.'
      : 'La sesión terminó. Volvé a entrar para consultar la orden.');
  }
  useLayoutEffect(() => {
    if (!session) return;
    activeSession.current = session;
    const stop = trackActivity(session, () => expireSession(session));
    const online = () => { void saver.current?.sync(); };
    const hide = () => saver.current?.setBackground(true);
    const visibility = () => {
      const service = saver.current;
      if (!service) return;
      const hidden = document.visibilityState === 'hidden';
      service.setBackground(hidden, false);
      if (!hidden) {
        void service.refreshLocal(() => saver.current === service && canFollowDraft.current && !orderOperation.current)
          .catch(() => undefined).then(() => service.sync());
      }
    };
    window.addEventListener('online', online);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibility);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      activeSession.current = null;
      detachSaver();
      stop();
      window.removeEventListener('online', online);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', visibility);
      document.removeEventListener('visibilitychange', visibility);
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
      setLoginMessage('');
      setSessionStatus('authenticated');
      setPassword('');
      setPage(invoiceOrderId() === null ? 'dashboard' : 'invoice-order');
    } catch (error) {
      setLoginMessage(loginErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!session || busy || orderOperation.current) return;
    orderOperation.current = true;
    setLogoutError('');
    const service = saver.current;
    service?.setBackground(true);
    setBusy(true);
    try {
      await service?.settleLocal();
      if (activeSession.current !== session) return;
      await api('/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': session.csrf },
      });
      if (activeSession.current !== session) return;
      activeSession.current = null;
      detachSaver();
      setConfirmAction(null);
      setConflict(undefined);
      setOrder(null);
      setSession(null);
      setSessionStatus('anonymous');
      setTouched(new Set());
      clearNotice();
      setDraft(null);
      setLoginMessage('Sesión cerrada.');
    } catch {
      if (activeSession.current !== session) return;
      service?.setBackground(document.visibilityState === 'hidden');
      setLogoutError(
        'No se pudo cerrar la sesión. Reintenta antes de dejar el dispositivo.',
      );
    }
    finally { orderOperation.current = false; setBusy(false); }
  }
  async function attach(record: RecordState, syncInBackground = false, syncOnOpen = true) {
    if (!session || activeSession.current !== session) return;
    if (record.localRevision === undefined) {
      try {
        record.localRevision = await storage.write(session.userId, record, true);
      } catch (error) {
        if (!(error instanceof LocalConflict)) throw error;
        const current = await storage.read(session.userId, record.id);
        if (!current || current.cancelled) throw error;
        record = current;
      }
    }
    if (activeSession.current !== session) return;
    clearNotice();
    setPreview(null);
    setTerminalRecovery(undefined);
    setEditorId(record.id);
    const serviceGeneration = noticeGeneration.current;
    const service = new Autosave(
      record,
      session.userId,
      session.csrf,
      (text, retry = false) => {
        // Ignore UI reports from an editor left or replaced while work was in flight.
        if (serviceGeneration !== noticeGeneration.current || saver.current !== service) return;
        setNotice(text && !service.localConflict ? { page: 'editor', orderId: record.id, message: text, retryable: retry } : null);
        setOrder(service.state.order ?? null);
        setConflict(service.state.conflict ? {...service.state.conflict} : undefined);
        if (service.state.cancelled) { setClosing(false); setCloseOwner(null); setConfirmAction(null); setTouched(new Set()); }
        else if (service.localConflict) setConfirmAction(null);
        else if (service.state.conflict || !service.state.pending && !service.state.draft.action)
          setConfirmAction(current => current === 'void' && canCancelBackfill(service.state) ? current : null);
        setDraft({ ...service.state.draft });
      },
      () => {
        if (saver.current === service) expireSession(session);
      },
    );
    saver.current = service;
    if (document.visibilityState === 'hidden') service.setBackground(true);
    setDraft(record.draft);
    setConflict(record.conflict);
    setOrder(record.order ?? null);
    setTouched(new Set());
    setClosing(false);
    setCloseOwner(null);
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
    if (syncOnOpen && (!record.order || record.order.status === 'OPEN' || record.pending?.draft.action === 'reopen')) {
      const syncing = service.sync();
      if (syncInBackground) {
        void syncing.catch(() => {
          if (saver.current === service && noticeGeneration.current === serviceGeneration)
            setNotice({ page: 'editor', orderId: record.id, message: 'La orden está guardada en este dispositivo. Reintenta la sincronización.', retryable: true });
        });
      } else {
        await syncing;
        if (saver.current === service) setOrder(service.state.order ?? null);
      }
    }
  }
  async function navigate(next: typeof page) {
    if (busy || orderOperation.current) return;
    if (confirmAction) {
      setMessage('Confirma o cancela la acción pendiente.');
      return;
    }
    // A draft may continue synchronizing after leaving the editor.
    if (next !== page) clearNotice();
    if (invoiceDetail && next !== page) {
      const url = new URL(window.location.href);
      url.searchParams.delete('invoiceOrder');
      window.history.replaceState(window.history.state, '', url);
      setOrder(null);
      setDraft(null);
    }
    setPage(next);
  }
  async function newOrder(backfill = false) {
    if (!session || activeSession.current !== session || busy || orderOperation.current || confirmAction || (backfill && session.role !== 'ADMIN')) return;
    orderOperation.current = true;
    setBackfillStartError(false);
    setBusy(true);
    try {
      await saver.current?.settleLocal();
      if (activeSession.current !== session) return;
      await storage.read(session.userId);
      const record = fresh();
      record.revision = 1;
      if (backfill) record.draft.workDate = '';
      await saver.current?.pause();
      await attach(record, true);
    } catch (error) {
      if (backfill) setBackfillStartError(true);
      if (!backfill || draftUpgradeMessage(error))
        setMessage(draftUpgradeMessage(error) ?? 'No se pudo abrir la orden. Tu borrador local está conservado.');
    } finally {
      orderOperation.current = false;
      setBusy(false);
    }
  }
  async function openOrder(selected: Order) {
    if (!session || activeSession.current !== session || busy || orderOperation.current) return;
    orderOperation.current = true;
    setBusy(true);
    try {
      await saver.current?.settleLocal();
      if (saver.current?.state.id === selected.id) await saver.current.pause();
      const local = await storage.read(session.userId, selected.id);
      if (activeSession.current !== session) return;
      if (local?.cancelled) {
        await saver.current?.pause();
        saver.current = null;
        clearNotice();
        setConfirmAction(null);
        setPage('open');
        return;
      }
      const hasLocalWork = local && (local.conflict || local.pending || local.savedRevision < local.revision || !local.version);
      if ((selected.status === 'OPEN' || saver.current?.localConflict) && hasLocalWork) {
        await saver.current?.pause();
        await attach(local);
        return;
      }
      const remote = await api<Order>('/orders/' + selected.id);
      await saver.current?.pause();
      if (activeSession.current !== session) return;
      const current = await storage.read(session.userId, selected.id);
      if (activeSession.current !== session || current?.cancelled) return;
      const currentHasWork = current && (current.conflict || current.pending || current.savedRevision < current.revision || !current.version);
      if (currentHasWork && remote.status === 'OPEN') {
        await attach(current);
      } else if (currentHasWork && remote.status !== 'OPEN') {
        // Show the terminal server detail and allow downloading the pending device copy.
        // Keep the canonical pending request in IndexedDB with its original key.
        detachSaver();
        clearNotice();
        setEditorId(remote.id);
        setDraft(remote.draft);
        setOrder(remote);
        setTerminalRecovery(current);
        setConflict(undefined);
        setTouched(new Set());
        setConfirmAction(null);
        setPage('editor');
      } else {
        const advanced = remote.status === 'OPEN' && current?.order?.status === 'OPEN' &&
          current.localRevision !== local?.localRevision;
        await attach(advanced ? current : current ? { ...current, draft: remote.draft, order: remote, version: remote.version } : {
          id: remote.id,
          draft: remote.draft,
          version: remote.version,
          order: remote,
          revision: 0,
          savedRevision: 0,
        }, false, remote.status === 'OPEN');
      }
    } catch (error) {
      setMessage(
        draftUpgradeMessage(error) ?? 'No se pudo abrir otra orden. Revisa la conexión o sincroniza el borrador pendiente.',
      );
    } finally {
      orderOperation.current = false;
      setBusy(false);
    }
  }
  async function openPreview() {
    const service = saver.current;
    if (!service || !session || activeSession.current !== session || busy || orderOperation.current) return;
    setClosing(true);
    if (service.state.pending?.draft.action || service.state.draft.action) return;
    if (visibleErrors(service.state.draft, touched, true).length) return;
    if (!validCloseDraft(service.state.draft)) {
      setMessage('Revisa los datos de la orden y el total antes de continuar.');
      return;
    }
    const backfill = service.state.draft.workDate !== undefined;
    orderOperation.current = true;
    setBusy(true);
    try {
      if (backfill) await service.settleLocal();
      else await service.flush(true);
      const { draft: current, localRevision, revision, version, order: saved } = service.state;
      const reviewed = { localRevision, revision, version };
      await service.verifyCloseRevision(reviewed);
      if (!validCloseDraft(current)) return;
      let owner: typeof closeOwner = null;
      if (!backfill) {
        const lookup = await api<{ vehicles: { id: string; ownerId: string; owner?: { fullName: string } }[] }>(
          `/vehicles?q=${encodeURIComponent(current.plate)}`,
        );
        const vehicle = lookup.vehicles.find(v => !current.vehicleId || v.id.toLowerCase() === current.vehicleId.toLowerCase());
        if (current.vehicleId && (!vehicle || !current.customerId)) throw new Error('OWNER_LOOKUP_REQUIRED');
        if (vehicle && current.customerId && vehicle.ownerId.toLowerCase() !== current.customerId.toLowerCase()) {
          owner = { vehicleId: vehicle.id, customerId: current.customerId, expectedOwnerId: vehicle.ownerId,
            ownerName: vehicle.owner?.fullName ?? 'dueño actual', decision: 'transfer' };
        }
        await service.verifyCloseRevision(reviewed);
      }
      if (saver.current !== service || activeSession.current !== session) return;
      setCloseOwner(owner);
      setPreview({ draft: structuredClone(current), revision: reviewed, businessDate: saved?.orderDate });
      setClosing(false);
    } catch (error) {
      if (saver.current !== service || activeSession.current !== session) return;
      if (error instanceof CloseReviewChanged) {
        await service.refreshLocal(() => saver.current === service).catch(() => undefined);
        if (activeSession.current !== session) return;
        setMessage('La orden cambió o tiene cambios pendientes. Revisa los datos y vuelve a abrir la vista previa.');
      } else {
        setMessage(backfill ? 'No se pudo preparar la vista previa. Revisa que el borrador esté guardado.'
          : 'No se pudo preparar la vista previa. Sincroniza la orden y comprueba la conexión para verificar el dueño del vehículo.');
      }
    } finally {
      orderOperation.current = false;
      setBusy(false);
    }
  }
  async function performAction(reviewed?: CloseRevision) {
    if (!session || activeSession.current !== session || busy || orderOperation.current) return;
    const action = reviewed ? 'close' : confirmAction;
    if (!action || (reviewed && previewStale)) return;
    const localDraft = saver.current;
    const cancelDraft = action === 'void' && !order && session.role === 'ADMIN' &&
      localDraft && localDraft.state.id === editorId && canCancelBackfill(localDraft.state);
    if (!order && !cancelDraft && !(action === 'close' && draft?.workDate !== undefined)) return;
    orderOperation.current = true;
    setBusy(true);
    try {
      if (cancelDraft) {
        await localDraft.cancelBackfill();
        if (activeSession.current !== session) return;
        clearNotice();
        setConfirmAction(null);
        setDraft(null);
        setEditorId(null);
        setPage('open');
        return;
      }
      if (action === 'reopen' && order && saver.current?.state.id !== order.id) {
        const local = await storage.read(session.userId, order.id);
        if (activeSession.current !== session) return;
        if (local?.cancelled) return;
        if (local && local.order?.version !== order.version && !local.pending && !local.conflict && local.savedRevision === local.revision) {
          await attach({ ...local, draft: order.draft, order, version: order.version }, false, false);
        } else {
          await attach(local ?? {
            id: order.id,
            draft: order.draft,
            version: order.version,
            order,
            revision: 0,
            savedRevision: 0,
          }, false, false);
        }
      }
      const service = saver.current;
      if (activeSession.current !== session || !service) return;
      if (action === 'close' && !reviewed &&
        service.state.pending?.draft.action !== 'close' && service.state.draft.action !== 'close') return;
      const saved = await service.action(action, action==='close' && closeOwner ? {decision:closeOwner.decision,vehicleId:closeOwner.vehicleId,customerId:closeOwner.customerId,expectedOwnerId:closeOwner.expectedOwnerId} : undefined, reviewed);
      if (activeSession.current !== session) return;
      if (action === 'transfer-owner') {
        const currentDraft=service.state.draft;
        const lookup=await api<{vehicles:{id:string;ownerId:string}[]}>(`/vehicles?q=${encodeURIComponent(currentDraft.plate)}`);
        if (activeSession.current !== session) return;
        const vehicle=lookup.vehicles.find(v=>v.id.toLowerCase()===currentDraft.vehicleId?.toLowerCase());
        if(!vehicle || vehicle.ownerId.toLowerCase()!==currentDraft.customerId?.toLowerCase()) throw new Error('OWNER_TRANSFER_NOT_APPLIED');
        setOwnerRevision(n => n + 1);
      }
      if (action === 'close') { setClosing(false); setPreview(null); }
      setOrder(saved ?? null);
      setDraft(service.state.draft);
      setConfirmAction(null);
      setNotice({ page: 'editor', orderId: service.state.id, retryable: false, message:
        action === 'void'
          ? 'Orden cancelada. Se conserva su información.'
          : action === 'close'
          ? saved?.isBackfilled ? 'Orden anterior registrada correctamente.' : 'Orden cerrada correctamente.'
          : action === 'reopen'
            ? 'Orden reabierta.'
            : 'Dueño actual actualizado. El historial anterior se conserva.',
      });
    } catch (error) {
      if (activeSession.current !== session) return;
      if (reviewed && error instanceof CloseReviewChanged) {
        await localDraft?.refreshLocal(() => saver.current === localDraft).catch(() => undefined);
        setPreview(previous => previous && { ...previous, stale: true });
        return;
      }
      if (reviewed && error instanceof Error && error.message === 'SYNC_REQUIRED' && !navigator.onLine &&
        !localDraft?.state.pending?.draft.action) {
        setMessage('Sin conexión. La orden sigue guardada en este dispositivo. Conéctate para confirmar el cierre.');
        return;
      }
      if (reviewed) {
        if (localDraft?.state.pending?.draft.action === 'close' && !localDraft.state.conflict && !localDraft.localConflict)
          setConfirmAction('close');
        else setPreview(null);
      }
      if (cancelDraft) {
        setMessage('No se pudo cancelar el borrador en este dispositivo. Volvé a intentar.');
        return;
      }
      if (!saver.current?.state.pending) setConfirmAction(null);
      if(error instanceof Error && error.message==='OWNER_TRANSFER_NOT_APPLIED') {
        setMessage('El dueño registrado del vehículo no cambió. Busca el vehículo por placa y confirma Actualizar dueño antes de crear otra orden.');
        return;
      }
      setMessage(
        previous => (previous.includes('Conflicto de versión.') || previous.includes('Confirma quién será el dueño')) ? previous : 'La acción no se confirmó. La copia local está protegida; reintenta para recuperar el resultado.',
      );
    } finally {
      orderOperation.current = false;
      setBusy(false);
    }
  }
  async function resolveConflict(version: string, selected?: Draft) {
    const service=saver.current;
    if(!service || service.localConflict || busy) return;
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
    setUpdateError('');
    try {
      const service = saver.current;
      if (service && canCancelBackfill(service.state)) await service.settleLocal();
      else await service?.flush();
      await applyUpdate();
    }
    catch { setUpdateError('No se pudo actualizar la aplicación. Revisa la conexión y los cambios pendientes.'); }
    finally { setBusy(false); }
  }
  function saveDraft(next: Draft) {
    if (!saver.current || saver.current.localConflict || busy || preview || confirmAction || conflict || (order && order.status !== 'OPEN')) return;
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
  const errors = draft && !saver.current?.state.cancelled ? visibleErrors(draft, touched, closing) : [];
  const cancelledDraft = !!saver.current?.state.cancelled;
  const previewPending = confirmAction === 'close' && saver.current?.state.pending?.draft.action === 'close';
  const previewStale = !!preview && !previewPending && (
    preview.stale || !saver.current || saver.current.localConflict || cancelledDraft || !!conflict ||
    !!saver.current.state.pending || !!saver.current.state.draft.action ||
    (order ? order.status !== 'OPEN' || !canFinish : !historical) ||
    !matchesCloseRevision(saver.current.state, preview.revision)
  );
  const readOnly =
    cancelledDraft ||
    !!saver.current?.localConflict ||
    (historical && session?.role !== 'ADMIN') ||
    (!!order && order.status !== 'OPEN') ||
    !!confirmAction ||
    !!conflict ||
    busy ||
    !!saver.current?.state.pending?.draft.action;
  const editor = page === 'editor' || (invoiceDetail && session?.role === 'ADMIN' && !!order && !!draft);
  const recovery = !saver.current && terminalRecovery?.id === editorId ? terminalRecovery :
    saver.current?.unsavedLocally || saver.current?.state.recoveryCopies?.length ? saver.current?.state : undefined;
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
        {session && <div>
          <button className="quiet" onClick={() => void logout()}>Cerrar sesión</button>
          {logoutError && <p role="alert">{logoutError}</p>}
        </div>}
      </header>
      <main>
        {hasUpdate && <div><p role="status">Hay una actualización disponible. <button type="button" disabled={busy || !!confirmAction || !!conflict} onClick={()=>void updateApp()}>Actualizar aplicación</button></p>
          {updateError && <p role="alert">{updateError}</p>}
        </div>}
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
              <button className="quiet" onClick={() => void navigate('legacy')}>Historial J5 antiguo</button>
              {session.role === 'ADMIN' && <button className="quiet" onClick={() => void navigate('invoices')}>Facturas electrónicas</button>}
              {session.role === 'ADMIN' && (
                <button
                  className="quiet"
                  onClick={() => void navigate('users')}
                >
                  Usuarios
                </button>
              )}
            </nav>
            {(page === 'dashboard' || page === 'new-order') && (
              <Dashboard
                session={session}
                ready={!busy}
                choosingOrder={page === 'new-order'}
                onNew={() => void (page === 'dashboard' && session.role === 'ADMIN' ? navigate('new-order') : newOrder())}
                onBackfill={() => void newOrder(true)}
                onPage={(next) => void navigate(next)}
              />
            )}
            {page === 'new-order' && backfillStartError && (
              <div role="dialog" aria-label="Orden anterior" className="confirmation">
                <p role="alert">No se pudo abrir el borrador en este dispositivo.</p>
                <button onClick={() => void newOrder(true)}>Reintentar</button>
                <button className="quiet" onClick={() => setBackfillStartError(false)}>Cancelar</button>
              </div>
            )}
            {(page === 'open' || page === 'history') && (
              <OrderList
                key={page}
                userId={session.userId}
                userName={session.fullName || session.username}
                mechanicRoster={mechanicRoster}
                role={session.role}
                canEdit={!busy}
                onCancel={async selected => {
                  await openOrder(selected);
                  const record = saver.current?.state;
                  if (activeSession.current !== session || record?.id !== selected.id || saver.current?.localConflict) return;
                  if (record.order?.status === 'OPEN' && (session.role === 'ADMIN' || record.order.mechanicId === session.userId) ||
                      session.role === 'ADMIN' && canCancelBackfill(record)) setConfirmAction('void');
                }}
                status={page === 'open' ? 'OPEN' : 'CLOSED'}
                onOpen={(o) => void openOrder(o)}
              />
            )}
            {page === 'legacy' && <LegacyHistory />}
            {page === 'invoices' && session.role === 'ADMIN' && <InvoiceTracking key={session.userId} session={session} />}
            {invoiceDetail && !editor && <section className="card" aria-label="Detalle de factura electrónica">
              {session.role !== 'ADMIN' ? <p role="alert">Esta sección es exclusiva para administradores.</p>
                : invoiceDetailError ? <>
                  <p role="alert">{invoiceDetailError}</p>
                  <button type="button" onClick={() => setInvoiceDetailRevision(value => value + 1)}>Reintentar</button>
                </> : <p role="status">Consultando la orden…</p>}
            </section>}
            {page === 'users' && session.role === 'ADMIN' && (
              <Users session={session} />
            )}
            {!editor && message && <p role="status">{message}</p>}
          </>
        )}

        <section
          hidden={sessionStatus === 'authenticated' && !editor}
          className={
            sessionStatus === 'authenticated' ? 'card editor' : 'card login'
          }
        >
          {(sessionStatus !== 'authenticated' || editor) && <>
          {!preview && <><div className="card-top">
            <h2>
              {sessionStatus === 'authenticated'
                ? (order?.displayOrderId ?? (historical ? 'Orden anterior' : 'Orden local'))
                : 'Iniciar sesión'}
            </h2>
          </div>
          {sessionStatus === 'authenticated' && (
            <div className={`badge order-state order-state--${(order?.status ?? 'OPEN').toLowerCase()}`} role="status" aria-label="Estado de la orden">
              {order?.status === 'VOID' || cancelledDraft ? 'CANCELADA' : order?.status === 'CLOSED' ? 'CERRADA' : historical ? 'BORRADOR' : 'ABIERTA'}
            </div>
          )}
          {sessionStatus === 'authenticated' && historical && order && (
            <>
              {order.orderDate && <p>Trabajo realizado el {formatWorkDate(order.orderDate)}</p>}
              {order.openedAt && <p>Orden ingresada en J5 el {formatRegistrationDate(order.openedAt)}</p>}
            </>
          )}
          {sessionStatus === 'authenticated' && order && !historical && (
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
          </>}
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
                {bootstrapError && <p>Revisa tu conexión o espera a que el servicio esté disponible y reintenta. Tus borradores locales se conservan.</p>}
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
                    disabled={busy}
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
                    disabled={busy}
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
                {busy && <p role="status">Conectando con el servicio. La base de datos puede tardar hasta un minuto en iniciar.</p>}
              </form>
            }
            authenticated={
              preview && session ? (
                <OrderPreview
                  draft={preview.draft}
                  businessDate={preview.businessDate}
                  taxRate={13}
                  busy={busy}
                  stale={previewStale}
                  pending={previewPending}
                  onEdit={() => {
                    restorePreviewFocus.current = true;
                    setCloseOwner(null);
                    setPreview(null);
                  }}
                  onConfirm={() => void performAction(previewPending ? undefined : preview.revision)}
                >
                  {closeOwner && <fieldset className="close-owner" disabled={busy}>
                    <legend>Dueño de {preview.draft.plate}</legend>
                    <p>Actualmente está registrado a nombre de {closeOwner.ownerName}. Elegí cómo cerrar esta orden:</p>
                    <label><input type="radio" name="close-owner" value="transfer" checked={closeOwner.decision==='transfer'} onChange={()=>setCloseOwner({...closeOwner,decision:'transfer'})}/>Asignar el vehículo a {preview.draft.customerName} al cerrar. Aparecerá en su próxima orden.</label>
                    <label><input type="radio" name="close-owner" value="keep" checked={closeOwner.decision==='keep'} onChange={()=>setCloseOwner({...closeOwner,decision:'keep'})}/>Conservar a {closeOwner.ownerName} como dueño. {preview.draft.customerName} será solo el cliente de esta orden.</label>
                    <p>Las órdenes anteriores conservan su cliente original.</p>
                  </fieldset>}
                </OrderPreview>
              ) : draft && session ? (
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
                  {conflict && saver.current && !saver.current.localConflict && <ConflictReview key={editorId+':'+conflict.remote.version} record={saver.current.state} busy={busy} onResolve={(version,selected)=>void resolveConflict(version,selected)} />}
                  {saver.current?.localConflict && <section className="confirmation" aria-label="Recuperación local">
                    <p role="status">Otra pestaña cambió este borrador. Tu copia se puede recuperar.</p>
                    <button type="button" className="quiet" onClick={() => { if (saver.current) downloadRecovery(saver.current.state); }}>Descargar mi copia</button>
                    <button type="button" disabled={busy} onClick={() => void openOrder(order ?? { id: editorId!, draft, status: 'OPEN', version: '', mechanicId: session.userId })}>Abrir versión vigente</button>
                  </section>}
                  {recovery && !saver.current?.localConflict && <details>
                    <summary>Copias de recuperación de esta orden</summary>
                    <button type="button" className="quiet" onClick={() => downloadRecovery(recovery)}>Descargar copias de recuperación</button>
                  </details>}
                  {!cancelledDraft && (!order || order.status === 'OPEN') && !conflict && !saver.current?.localConflict && (
                    <div hidden={!!confirmAction || busy}><EntitySearch key={`${page}:${editorId}`} ownerRevision={ownerRevision} draft={draft} onSelect={saveDraft} allowTransfer={!historical && (session.role === 'ADMIN' || session.role === 'MECHANIC')} onTransfer={() => {
                      const service = saver.current;
                      if (!service) return;
                      setBusy(true);
                      void service.flush().then(() => {
                        if (saver.current !== service) return;
                        setOrder(service.state.order ?? null);
                        setConfirmAction('transfer-owner');
                      })
                        .catch(() => setMessage('Sincroniza la orden antes de actualizar el dueño.')).finally(() => setBusy(false));
                    }} /></div>
                  )}
                  <fieldset disabled={readOnly}>
                    {historical && !order && (
                      <div>
                        <label htmlFor="work-date">Fecha del trabajo</label>
                        <input
                          id="work-date"
                          type="date"
                          data-field="workDate"
                          min="0001-01-01"
                          max={latestBackfillDate()}
                          required
                          value={draft.workDate ?? ''}
                          onChange={e => edit('workDate', e.target.value)}
                          {...accessibility('workDate')}
                        />
                        {validation('workDate')}
                      </div>
                    )}
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
                        Cédula física o jurídica
                        <input
                          data-field="identification"
                          {...accessibility('identification')}
                          inputMode="numeric"
                          maxLength={10}
                          value={draft.identification ?? ''}
                          onChange={(e) =>
                            edit('identification', e.target.value)
                          }
                        />
                        <small>9 dígitos: física · 10 dígitos: jurídica</small>
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
                      <div>
                        <label htmlFor="vehicle-year">Año</label>
                        <div className="year-field">
                          <input
                            id="vehicle-year"
                            data-field="year"
                            {...accessibility('year')}
                            type="number"
                            inputMode="numeric"
                            min={1950}
                            step={1}
                            value={draft.year ?? ''}
                            onChange={(e) => edit('year', e.target.value)}
                          />
                          <YearPicker year={draft.year} disabled={readOnly} onSelect={(year) => edit('year', String(year))} />
                        </div>
                        {validation('year')}
                      </div>
                    </div>
                    {historical && !order && session.role === 'ADMIN' && (
                      <label>Mecánico asignado
                        <select value={draft.mechanicId ?? session.userId} onChange={e => edit('mechanicId', e.target.value)}>
                          {!mechanics.some(u => u.id === session.userId) && <option value={session.userId}>{session.fullName ?? session.username}</option>}
                          {mechanics.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>)}
                        </select>
                      </label>
                    )}
                    {session.role === 'ADMIN' && order?.status === 'OPEN' && <label>Mecánico asignado
                      <select aria-label="Mecánico asignado" value={selectedMechanic} onChange={e => setSelectedMechanic(e.target.value)}>
                        {!mechanics.some(u => u.id === order.mechanicId) && <option value={order.mechanicId}>{order.mechanicName}</option>}
                        {mechanics.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>)}
                      </select>
                    <button type="button" disabled={readOnly || !selectedMechanic || selectedMechanic === order.mechanicId} onClick={() => void updateMechanic()}>Actualizar mecánico</button>
                    </label>}
                    {(!historical || order) && <p>
                      Mecánico:{' '}
                      {order?.mechanicName ??
                        session.fullName ??
                        session.username}
                    </p>}
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
                  {!cancelledDraft && editor && closing && (!order || order.status === 'OPEN') && visibleErrors(draft, touched, true).length > 0 && (
                    <div className="close-errors confirmation" role="alert">
                      <p>Para cerrar la orden, completa:</p>
                      <ul>{visibleErrors(draft, touched, true).map(error => <li key={error.field}>{error.section}: {error.message}</li>)}</ul>
                    </div>
                  )}
                  <div className="order-actions">
                  {!cancelledDraft && (!order || order.status === 'OPEN') && !conflict && canFinish && (
                    <button
                      ref={previewButton}
                      type="button"
                      disabled={busy || !!confirmAction || !!saver.current?.localConflict}
                      onClick={() => void openPreview()}
                    >
                      Vista previa de orden
                    </button>
                  )}
                  {!conflict && ((order?.status === 'OPEN' && (session.role === 'ADMIN' || order.mechanicId === session.userId)) ||
                    (!order && session.role === 'ADMIN' && saver.current?.state.id === editorId && canCancelBackfill(saver.current.state))) && (
                    <button type="button" className="danger" disabled={busy || !!confirmAction || !!saver.current?.localConflict} onClick={() => setConfirmAction('void')}>Cancelar orden</button>
                  )}
                  </div>
                  {!invoiceDetail && order?.status === 'CLOSED' && !historical && !conflict && session.role === 'ADMIN' && (
                    <button
                      type="button"
                      disabled={busy || !!saver.current?.localConflict}
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
                          ? order
                            ? `¿Cancelar la orden ${order.displayOrderId}? Esta acción la quitará de órdenes abiertas.`
                            : '¿Cancelar este borrador de orden anterior? Se quitará de Órdenes abiertas.'
                          : confirmAction === 'close'
                          ? historical ? `¿Registrar como cerrada la orden del ${draft.workDate}?` : `¿Cerrar la orden ${order?.displayOrderId ?? 'local'}?`
                          : confirmAction === 'reopen'
                            ? `¿Reabrir la orden ${order?.displayOrderId}?`
                            : `¿Asignar el vehículo ${draft.plate} a ${draft.customerName} (${draft.identification})? Las órdenes anteriores conservan su cliente.`}
                      </p>
                      {confirmAction === 'reopen' && order?.draft.electronicInvoice === true && (
                        <p>Si la factura electrónica ya está marcada como emitida, conservará esa marca al reabrir la orden.</p>
                      )}
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
          {sessionStatus === 'anonymous' && loginMessage && <p role="status">{loginMessage}</p>}
          {sessionStatus === 'authenticated' && editor && (message || retryable) && <SyncStatus
            message={message}
            retryable={retryable && !!draft}
            onRetry={() => { void saver.current?.sync(true); }}
          />}
          </>}
        </section>
      </main>
    </div>
  );
}
