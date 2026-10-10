import { draftSchema } from '../../backend/src/validation';
import { openDB } from 'idb';
import { api, ApiError } from './api';
export type Draft = {
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
  draft: Draft;
  version: string | null;
  revision: number;
  savedRevision: number;
  order?: Order;
  pending?: Mutation;
  conflict?: { remote: Order };
  recoveryCopies?: { draft: Draft; pending?: Mutation; version: string | null; savedAt: number }[];
};
const db = () =>
  openDB('j5-drafts-v1', 1, {
    upgrade(database) {
      database.createObjectStore('drafts');
    },
  });
export const storage = {
  async read(user: string, orderId?: string): Promise<RecordState | undefined> {
    const database = await db();
    try {
      const tx = database.transaction('drafts', 'readwrite');
      const legacy: RecordState | undefined = await tx.store.get(user);
      if (legacy) {
        if (!await tx.store.get([user, legacy.id])) await tx.store.put(legacy, [user, legacy.id]);
        await tx.store.delete(user);
      }
      await tx.done;
      return orderId ? await database.get('drafts', [user, orderId]) : legacy;
    } finally { database.close(); }
  },
  async list(user: string): Promise<RecordState[]> {
    await this.read(user);
    const database = await db();
    try { return await database.getAll('drafts', IDBKeyRange.bound([user, ''], [user, '\uffff'])); }
    finally { database.close(); }
  },
  async write(user: string, record: RecordState) {
    const database = await db();
    try { await database.put('drafts', record, [user, record.id]); }
    finally { database.close(); }
  },
};
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
  private active?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    public state: RecordState,
    private user: string,
    private csrf: string,
    private report: (message: string, retryable?: boolean) => void,
    private expired: () => void,
    private persist = storage.write,
    private send = (id: string, mutation: Mutation) =>
      api<{ version: string } & Partial<Order>>(`/orders/${id}`, {
        method: 'PUT',
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
      .then(() => this.persist(this.user, snapshot));
    return this.queue;
  }
  async edit(draft: Draft) {
    if (this.state.conflict) throw new Error('ORDER_CONFLICT');
    if (
      this.state.pending?.draft.action ||
      this.state.draft.action ||
      (this.state.order?.status === 'VOID' || (this.state.order?.status === 'CLOSED' && draft.action !== 'reopen'))
    )
      throw new Error('ORDER_LOCKED');
    this.state.draft = draft;
    this.state.revision++;
    this.report('Guardando en este dispositivo…');
    try {
      await this.write();
      this.report('Cambios guardados en este dispositivo');
    } catch {
      this.report(
        'No se pudo guardar en este dispositivo. Mantén esta ventana abierta.',
      );
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), 800);
  }
  async flush() {
    clearTimeout(this.timer);
    await this.sync();
    if (this.state.pending || this.state.savedRevision < this.state.revision)
      throw new Error('SYNC_REQUIRED');
  }
  async action(action: NonNullable<Draft['action']>, ownerResolution?: Draft['ownerResolution']) {
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
    await this.flush();
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
  async refresh(conflict = false, allowMetadataRebase = true) {
    const version = this.state.version;
    const metadataVersion = this.state.order?.version;
    if (this.detached) return;
    if ((!version && !conflict) || (this.active && !conflict)) return;
    const remote = await api<Order>('/orders/' + this.state.id);
    if (this.detached || (this.active && !conflict) || this.state.version !== version || this.state.order?.version !== metadataVersion) return;
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
    if (remote.status !== 'OPEN' && !awaitingReceipt) this.stopped = true;
    await this.write();
    this.report(reassigned ? `Esta orden fue reasignada a ${remote.mechanicName ?? remote.mechanicId}.` : remote.status === 'VOID' ? 'Esta orden fue cancelada.' : 'Orden actualizada.');
  }
  /** Re-fetch before applying a reviewed choice. Old pending requests never get reused. */
  async resolveConflict(expectedVersion: string, selected?: Draft) {
    clearTimeout(this.timer);
    await this.active;
    if (this.detached || !this.state.conflict) throw new Error('NO_CONFLICT');
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
      Object.assign(this.state, previous);
      this.state.recoveryCopies = previous.recoveryCopies;
      throw new Error('LOCAL_SAVE_FAILED');
    }
    this.baselineDraft = structuredClone(remote.draft);
    this.stopped = remote.status !== 'OPEN';
    this.report('Conflicto resuelto. Tu borrador anterior se conserva en este dispositivo.');
    if (selected) await this.sync();
  }
  async pause() {
    this.detached = true;
    this.stopped = true;
    clearTimeout(this.timer);
    await this.active;
    await this.write();
  }
  sync(): Promise<void> {
    if (this.active) return this.active;
    this.active = this.runSync().finally(() => {
      this.active = undefined;
    });
    return this.active;
  }
  private async runSync() {
    if (this.syncing || this.stopped) return;
    this.syncing = true;
    try {
      await this.queue;
      while (
        !this.stopped &&
        (this.state.pending || this.state.savedRevision < this.state.revision)
      ) {
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
        await this.write();
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
        if (this.stopped && this.state.order) {
          this.state.conflict = { remote: structuredClone(this.state.order) };
          await this.write();
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
