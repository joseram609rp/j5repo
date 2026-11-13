import { draftSchema } from '../../backend/src/validation';
import { openDB } from 'idb';
import { api, ApiError } from './api';
import { publishDraftChange } from './draft-changes';
export type Draft = {
  workDate?: string;
  paymentMethod?: 'SINPE' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'CASH' | 'BANK_TRANSFER';
  electronicInvoice?: boolean;
  mechanicId?: string;
  customerId?: string;
  vehicleId?: string;
  ownerResolution?: {decision: 'transfer' | 'keep'; vehicleId:string; customerId:string; expectedOwnerId:string};
  action?: 'close' | 'reopen' | 'void' | 'admin-edit' | 'transfer-owner' | 'assign-mechanic';
  customerName: string;
  plate: string;
  mileage: number | null;
  notes: string;
  recommendations: string;
  identification?: string;
  phone?: string;
  email?: string;
  make?: string;
  model?: string;
  year?: number | null;
  items?: { description: string; price: number; notes?: string }[];
};
export type Order = {
  id: string;
  version: string;
  status: 'OPEN' | 'CLOSED' | 'VOID';
  draft: Draft;
  mechanicId: string;
  mechanicName?: string;
  displayOrderId?: string;
  openedAt?: string;
  orderDate?: string;
  isBackfilled?: boolean;
  closedAt?: string | null;
  totalAmount?: number;
  subtotalAmount?: number;
  taxAmount?: number;
  taxRate?: number;
};
type Mutation = {
  key: string;
  draft: Draft;
  version: string | null;
  revision: number;
  baseDraft?: Draft;
};
export type RecordState = {
  id: string;
  localRevision?: number;
  draft: Draft;
  version: string | null;
  revision: number;
  savedRevision: number;
  order?: Order;
  cancelled?: boolean;
  pending?: Mutation;
  conflict?: { remote: Order };
  recoveryCopies?: { draft: Draft; pending?: Mutation; version: string | null; savedAt: number }[];
};
export class LocalConflict extends Error {
  constructor() { super('LOCAL_CONFLICT'); }
}
export function canCancelBackfill(record: RecordState) {
  return record.draft.workDate !== undefined && !record.order && !record.version &&
    !record.cancelled && !record.pending && !record.draft.action && !record.conflict;
}
export class DraftUpgradeBlocked extends Error {}
const db = () => new Promise<Awaited<ReturnType<typeof openDB>>>((resolve, reject) => {
  let blocked = false;
  openDB('j5-drafts-v1', 2, {
    upgrade(database, oldVersion) {
      if (!oldVersion) database.createObjectStore('drafts');
    },
    blocked() {
      blocked = true;
      reject(new DraftUpgradeBlocked());
    },
  }).then(database => {
    if (blocked) database.close();
    else resolve(database);
  }, reject);
});
export function draftUpgradeMessage(error: unknown) {
  return error instanceof DraftUpgradeBlocked
    ? 'Guarda los cambios en las otras pestañas de J5 y ciérralas para actualizar los borradores de este dispositivo. Luego reintenta.'
    : undefined;
}
export const storage = {
  async read(user: string, orderId?: string): Promise<RecordState | undefined> {
    const database = await db();
    try {
      const tx = database.transaction('drafts', 'readwrite');
      const legacy: RecordState | undefined = await tx.store.get(user);
      if (legacy) {
        const key = [user, legacy.id];
        const current = await tx.store.get(key) as RecordState | undefined;
        if (!current) await tx.store.put(legacy, key);
        else await tx.store.put(withRecovery(current, legacy), key);
        await tx.store.delete(user);
      }
      const record = orderId ? await tx.store.get([user, orderId]) as RecordState | undefined : legacy;
      await tx.done;
      if (legacy) publishDraftChange();
      return record && { ...record, localRevision: record.localRevision ?? 0 };
    } finally { database.close(); }
  },
  async list(user: string): Promise<RecordState[]> {
    const database = await db();
    try {
      const tx = database.transaction('drafts');
      const records = await tx.store.getAll(IDBKeyRange.bound([user, ''], [user, '\uffff'])) as RecordState[];
      const legacy = await tx.store.get(user) as RecordState | undefined;
      if (legacy && !records.some(record => record.id === legacy.id)) records.push(legacy);
      return records;
    }
    finally { database.close(); }
  },
  async write(user: string, record: RecordState, initialize = false) {
    const database = await db();
    try {
      const tx = database.transaction('drafts', 'readwrite');
      const key = [user, record.id];
      const current = await tx.store.get(key) as RecordState | undefined;
      const expected = record.localRevision;
      const actual = current ? current.localRevision ?? 0 : undefined;
      if (actual !== expected) {
        if (current && !initialize) {
          await tx.store.put(withRecovery(current, record), key);
        }
        await tx.done;
        if (current && !initialize) publishDraftChange();
        throw new LocalConflict();
      }
      const copies = current?.recoveryCopies ?? [];
      const known = new Set(copies.map(copy => JSON.stringify(copy)));
      const recoveryCopies = [...copies, ...(record.recoveryCopies ?? []).filter(copy => !known.has(JSON.stringify(copy)))];
      const saved = { ...record, localRevision: (actual ?? 0) + 1 };
      if (recoveryCopies.length) saved.recoveryCopies = recoveryCopies;
      await tx.store.put(saved, key);
      await tx.done;
      publishDraftChange();
      return saved.localRevision;
    }
    finally { database.close(); }
  },
};
function withRecovery(current: RecordState, stale: RecordState): RecordState {
  const { draft, pending, version } = stale;
  const copy = { draft, pending, version };
  const copies = current.recoveryCopies ?? [];
  const signature = JSON.stringify(copy);
  const existing = new Set(copies.map(({ draft, pending, version }) => JSON.stringify({ draft, pending, version })));
  const recovered = [...copies];
  if (!existing.has(signature)) recovered.push({ ...copy, savedAt: Date.now() });
  for (const previous of stale.recoveryCopies ?? []) {
    const { draft, pending, version } = previous;
    const key = JSON.stringify({ draft, pending, version });
    if (!existing.has(key) && key !== signature) {
      existing.add(key);
      recovered.push(previous);
    }
  }
  return { ...current, recoveryCopies: recovered };
}
export const fresh = (): RecordState => ({
  id: crypto.randomUUID(),
  draft: {
    customerName: '',
    plate: '',
    identification: '',
    phone: '',
    email: '',
    make: '',
    model: '',
    year: null,
    items: [],
    mileage: null,
    notes: '',
    recommendations: '',
  },
  version: null,
  revision: 0,
  savedRevision: 0,
});
/** Freeze the payload/key before sending. Never reuse a key with an edited payload. */
export class Autosave {
  private baselineDraft?: Draft;
  private queue = Promise.resolve();
  private syncing = false;
  private stopped = false;
  private detached = false;
  private paused?: Promise<void>;
  private requests = new AbortController();
  private active?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private background = false;
  private storageFailed = false;
  private following = false;
  localConflict = false;
  constructor(
    public state: RecordState,
    private user: string,
    private csrf: string,
    private report: (message: string, retryable?: boolean) => void,
    private expired: () => void,
    private persist: (user: string, record: RecordState) => Promise<number | void> = storage.write,
    private send = (id: string, mutation: Mutation) =>
      api<{ version: string } & Partial<Order>>(`/orders/${id}`, {
        method: 'PUT',
        signal: this.requests.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': this.csrf,
          'Idempotency-Key': mutation.key,
          ...(mutation.version === null
            ? {}
            : { 'If-Match': `"${mutation.version}"` }),
        },
        body: JSON.stringify(mutation.draft),
      }),
  ) {
    this.baselineDraft = structuredClone(state.pending?.baseDraft ?? state.order?.draft);
    this.stopped = !!state.conflict;
  }
  private write() {
    const snapshot = structuredClone(this.state);
    this.queue = this.queue
      .catch(() => undefined)
      .then(async () => {
        try {
          const revision = await this.persist(this.user, { ...snapshot, localRevision: this.state.localRevision });
          if (revision !== undefined) this.state.localRevision = revision;
          this.storageFailed = false;
        } catch (error) {
          this.storageFailed = true;
          if (error instanceof LocalConflict) {
            this.localConflict = true;
            this.stopped = true;
            this.report('Otra pestaña cambió este borrador. Puedes recuperar tu copia o abrir la versión vigente.');
          } else {
            this.report(draftUpgradeMessage(error) ??
              'No se pudo guardar en este dispositivo. Mantén esta ventana abierta y descarga tu borrador.', true);
          }
          throw error;
        }
      });
    return this.queue;
  }
  async cancelBackfill() {
    if (this.detached || this.localConflict || !canCancelBackfill(this.state)) throw new Error('ORDER_LOCKED');
    clearTimeout(this.timer);
    this.state.cancelled = true;
    try {
      await this.write();
    } catch (error) {
      delete this.state.cancelled;
      throw error;
    }
  }
  async edit(draft: Draft) {
    if (this.detached || this.state.cancelled || this.localConflict) throw new Error('EDITOR_DETACHED');
    if (this.state.conflict) throw new Error('ORDER_CONFLICT');
    if (
      this.state.pending?.draft.action ||
      this.state.draft.action ||
      (this.state.order?.status === 'VOID' || (this.state.order?.status === 'CLOSED' && draft.action !== 'reopen'))
    )
      throw new Error('ORDER_LOCKED');
    this.following = false;
    if (draft.action === 'reopen') this.stopped = false;
    this.state.draft = draft;
    this.state.revision++;
    this.report('Guardando en este dispositivo…');
    try {
      await this.write();
      this.report('Cambios guardados en este dispositivo');
    } catch { return; }
    if (this.detached) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), 800);
  }
  async flush(resumeSharedDraft = false) {
    clearTimeout(this.timer);
    await this.sync(resumeSharedDraft);
    if (this.localConflict || this.storageFailed || this.state.pending || this.state.savedRevision < this.state.revision)
      throw new Error('SYNC_REQUIRED');
  }
  async action(action: NonNullable<Draft['action']>, ownerResolution?: Draft['ownerResolution']) {
    if (this.detached || this.localConflict) throw new Error('EDITOR_DETACHED');
    const replaying =
      this.state.pending?.draft.action === action ||
      this.state.draft.action === action;
    const replayVersion = this.state.version;
    if (action === 'void' && !replaying) {
      clearTimeout(this.timer);
      await this.active;
      if (this.state.pending || this.state.order?.status !== 'OPEN') throw new Error('SYNC_REQUIRED');
      // Cancellation does not save an invalid local edit or replace related services.
      const before = this.state.version;
      await this.edit({ ...this.state.order.draft, action });
      await this.flush();
      if (this.state.version === before || (this.state.order?.status as string) !== 'VOID') throw new Error('ACTION_REJECTED');
      return this.state.order;
    }
    if (this.state.draft.workDate === undefined || replaying) await this.flush(true);
    const beforeVersion = this.state.version;
    if (replaying) {
      if (
        this.state.version === replayVersion ||
        (action === 'close' && this.state.order?.status !== 'CLOSED') ||
        (action === 'void' && this.state.order?.status !== 'VOID') ||
        (action === 'reopen' && this.state.order?.status !== 'OPEN')
      )
        throw new Error('ACTION_REJECTED');
      return this.state.order;
    }
    await this.edit({ ...this.state.draft, action, ...(action==='close' && ownerResolution ? {ownerResolution} : {}) });
    await this.flush();
    if (
      this.state.version === beforeVersion ||
      (action === 'close' && this.state.order?.status !== 'CLOSED') ||
        (action === 'void' && this.state.order?.status !== 'VOID') ||
      (action === 'reopen' && this.state.order?.status !== 'OPEN')
    )
      throw new Error('ACTION_REJECTED');
    return this.state.order;
  }
  /** Adopt the committed device snapshot without replaying work owned by another tab. */
  async refreshLocal(canApply = () => true) {
    const state = this.state;
    const queue = this.queue;
    const canFollow = () => !this.detached && !this.localConflict && !this.background &&
      !this.storageFailed && !this.active && this.state === state && this.queue === queue &&
      (this.following || (!state.pending && !state.conflict && !state.draft.action &&
        state.revision === state.savedRevision));
    if (!canFollow()) return false;
    const current = await storage.read(this.user, state.id);
    if (!current || !canFollow() || !canApply()) return false;
    if ((current.localRevision ?? 0) <= (state.localRevision ?? 0)) {
      if (JSON.stringify(current.recoveryCopies) !== JSON.stringify(state.recoveryCopies)) {
        state.recoveryCopies = current.recoveryCopies;
        this.report('');
      }
      return false;
    }
    clearTimeout(this.timer);
    this.state = current;
    this.baselineDraft = structuredClone(current.pending?.baseDraft ?? current.order?.draft);
    this.stopped = !!current.conflict || (!!current.order && current.order.status !== 'OPEN' &&
      !current.pending && !current.draft.action);
    this.following = !!(current.pending || current.conflict || current.draft.action ||
      current.revision !== current.savedRevision);
    this.report('');
    return true;
  }
  async refresh(conflict = false, allowMetadataRebase = true, canApply = () => true) {
    const state = this.state;
    const version = this.state.version;
    const metadataVersion = this.state.order?.version;
    if (this.detached || this.localConflict || this.background || this.following) return;
    if ((!version && !conflict) || (this.active && !conflict)) return;
    const remote = await api<Order>('/orders/' + this.state.id);
    if (!canApply() || this.detached || this.localConflict || this.background || this.state !== state ||
      (this.active && !conflict) || this.state.version !== version || this.state.order?.version !== metadataVersion) return;
    if (!conflict && remote.version === this.state.order?.version) return;
    const reassigned = this.state.order?.mechanicId !== remote.mechanicId;
    const metadataOnly = JSON.stringify(this.baselineDraft) === JSON.stringify(remote.draft) && remote.status === 'OPEN';
    this.state.order = remote;
    if (this.state.conflict) this.state.conflict.remote = remote;
    if (conflict && allowMetadataRebase && metadataOnly && !this.state.conflict) {
      // A metadata-only reassignment can safely rebase the preserved local edits.
      delete this.state.pending;
      const { action: _, ownerResolution: _ownerResolution, mechanicId: __, ...local } = this.state.draft;
      this.state.draft = local;
      this.state.version = remote.version;
      this.stopped = false;
    }
    if (!this.state.pending && this.state.revision === this.state.savedRevision) {
      this.state.version = remote.version;
      this.state.draft = remote.draft;
      this.baselineDraft = remote.draft;
    }
    const pendingAction = this.state.pending?.draft.action;
    const awaitingReceipt = (pendingAction === 'void' && remote.status === 'VOID') || (pendingAction === 'close' && remote.status === 'CLOSED');
    if (!this.state.conflict && !conflict) this.stopped = remote.status !== 'OPEN' && !awaitingReceipt;
    // A read-only refresh of a clean editor must not compete with draft writers.
    // The next local edit persists this baseline under the existing CAS revision.
    if (conflict) await this.write();
    this.report(reassigned ? `Esta orden fue reasignada a ${remote.mechanicName ?? remote.mechanicId}.` : remote.status === 'VOID' ? 'Esta orden fue cancelada.' : '');
  }
  /** Re-fetch before applying a reviewed choice. Old pending requests never get reused. */
  async resolveConflict(expectedVersion: string, selected?: Draft) {
    clearTimeout(this.timer);
    await this.active;
    if (this.detached || this.localConflict || !this.state.conflict) throw new Error('NO_CONFLICT');
    this.following = false;
    let remote: Order;
    try { remote = await api<Order>('/orders/' + this.state.id); }
    catch (error) { if (error instanceof ApiError && error.status === 401) this.expired(); throw error; }
    if (this.detached) throw new Error('EDITOR_DETACHED');
    if (remote.version !== expectedVersion) {
      this.state.conflict.remote = remote;
      this.state.order = remote;
      await this.write();
      this.report('La orden cambió nuevamente. Revisa la versión más reciente antes de guardar.');
      throw new Error('REVIEW_CHANGED');
    }
    if (selected && remote.status !== 'OPEN') throw new Error('ORDER_NOT_OPEN');
    const previous = structuredClone(this.state);
    this.state.recoveryCopies = [...(this.state.recoveryCopies ?? []), {
      draft: structuredClone(this.state.draft), pending: structuredClone(this.state.pending),
      version: this.state.version, savedAt: Date.now(),
    }];
    const { action: _, ownerResolution: _ownerResolution, mechanicId: __, ...draft } = structuredClone(selected ?? remote.draft);
    this.state.draft = draft;
    this.state.order = remote;
    this.state.version = remote.version;
    this.state.revision++;
    if (!selected) this.state.savedRevision = this.state.revision;
    delete this.state.pending;
    delete this.state.conflict;
    try { await this.write(); }
    catch {
      if (!this.localConflict) Object.assign(this.state, previous);
      this.state.recoveryCopies = previous.recoveryCopies;
      throw new Error('LOCAL_SAVE_FAILED');
    }
    this.baselineDraft = structuredClone(remote.draft);
    this.stopped = remote.status !== 'OPEN';
    this.report('Conflicto resuelto. Tu borrador anterior se conserva en este dispositivo.');
    if (selected) await this.sync();
  }
  async settleLocal() {
    try { await this.queue; }
    catch {
      if (!this.localConflict) await this.write();
    }
  }
  pause(interrupt = false) {
    if (interrupt) this.requests.abort();
    if (this.paused) return this.paused;
    this.detached = true;
    this.stopped = true;
    clearTimeout(this.timer);
    this.paused = (async () => {
      await this.active;
      await this.settleLocal();
    })();
    return this.paused;
  }
  setBackground(background: boolean, resume = true) {
    if (this.background === background) return;
    this.background = background;
    if (background) clearTimeout(this.timer);
    else if (!resume) return;
    else if (this.active) {
      void this.active.then(() => this.sync());
    } else void this.sync();
  }
  get unsavedLocally() { return this.storageFailed && !this.localConflict; }
  sync(resumeSharedDraft = false): Promise<void> {
    if (this.active) return this.active;
    if (this.detached || this.background || (this.following && !resumeSharedDraft)) return Promise.resolve();
    this.following = false;
    this.active = this.runSync().finally(() => {
      this.active = undefined;
    });
    return this.active;
  }
  private async runSync() {
    if (this.syncing || this.localConflict || this.detached || this.background || this.state.cancelled) return;
    this.syncing = true;
    try {
      if (this.storageFailed) await this.write();
      else await this.queue;
      if (this.stopped) return;
      while (
        !this.stopped && !this.detached && !this.background &&
        (this.state.pending || this.state.savedRevision < this.state.revision)
      ) {
        // Historical drafts remain local until the user confirms a complete close.
        if (this.state.draft.workDate !== undefined && !this.state.pending && !this.state.draft.action) return;
        if (
          !this.state.pending &&
          !draftSchema.safeParse(this.state.draft).success
        ) {
          this.report(
            'Completa o corrige los campos. Tu borrador permanece guardado en este dispositivo.',
          );
          return;
        }
        this.state.pending ??= {
          key: crypto.randomUUID(),
          draft: structuredClone(this.state.draft),
          version: this.state.version,
          revision: this.state.revision,
          baseDraft: structuredClone(this.baselineDraft),
        };
        await this.write();
        if (this.detached || this.background || this.localConflict) return;
        const mutation = this.state.pending;
        if (!draftSchema.safeParse(mutation.draft).success) {
          delete this.state.pending;
          await this.write();
          this.report(
            'Corrige los campos para sincronizar. La copia local está protegida.',
          );
          return;
        }
        this.report('Sincronizando…');
        const result = await this.send(this.state.id, mutation);
        if (result.status && result.draft) {
          this.state.order = result as Order;
          this.baselineDraft = result.draft;
          if (this.state.revision === mutation.revision)
            this.state.draft = result.draft;
        }
        if (
          mutation.draft.action &&
          this.state.revision === mutation.revision
        ) {
          const { action: _, ownerResolution: _ownerResolution, ...draft } = this.state.draft;
          this.state.draft = draft;
        }
        this.state.version = result.version;
        this.state.savedRevision = mutation.revision;
        delete this.state.pending;
        await this.write();
        this.report('Guardado');
      }
    } catch (error) {
      if (this.localConflict || this.storageFailed) return;
      if (
        error instanceof ApiError &&
        ([400, 403].includes(error.status) ||
          (error.status === 409 &&
            ['OWNER_SELECTION_MISMATCH', 'ORDER_IDENTITY_MISMATCH', 'OWNER_DECISION_REQUIRED', 'OWNER_DECISION_STALE'].includes(
              error.code,
            ))) &&
        this.state.pending?.draft.action
      ) {
        delete this.state.pending;
        const { action: _, ownerResolution: _ownerResolution, ...draft } = this.state.draft;
        this.state.draft = draft;
        this.state.revision = this.state.savedRevision;
        await this.write().catch(() => undefined);
        if (this.localConflict || this.storageFailed) return;
        this.report(
          ['OWNER_DECISION_REQUIRED','OWNER_DECISION_STALE'].includes(error.code)
            ? 'Confirma quién será el dueño del vehículo al cerrar. El dueño registrado puede haber cambiado; vuelve a pulsar Cerrar orden.'
            : 'La acción fue rechazada. Revisa los datos y los permisos.',
        );
      } else if (error instanceof ApiError && error.status === 401) {
        this.stopped = true;
        this.expired();
      } else if (
        error instanceof ApiError &&
        [400, 403, 409, 412, 428].includes(error.status)
      ) {
        this.stopped = true;
        const priorMechanic = this.state.order?.mechanicId;
        await this.refresh(true, error.status === 412).catch(() => undefined);
        if (this.localConflict || this.storageFailed) return;
        if (this.stopped && this.state.order) {
          this.state.conflict = { remote: structuredClone(this.state.order) };
          await this.write().catch(() => undefined);
          if (this.localConflict || this.storageFailed) return;
        }
        const notice = priorMechanic !== this.state.order?.mechanicId ? `Esta orden fue reasignada a ${this.state.order?.mechanicName ?? this.state.order?.mechanicId}. ` : '';
        this.report(
          notice + 'Conflicto de versión. La orden se ha consultado de nuevo; tu copia local está protegida. Revisa los datos antes de reintentar.',
          !this.stopped,
        );
      } else if (typeof navigator !== 'undefined' && navigator.onLine === false)
        this.report('Cambios guardados en este dispositivo. Sin conexión.');
      else
        this.report(
          'No se pudo sincronizar. Reintenta para guardar los cambios pendientes.',
          true,
        );
    } finally {
      this.syncing = false;
    }
  }
}
