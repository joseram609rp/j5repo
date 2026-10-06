import { draftSchema } from '../../backend/src/validation';
import { openDB } from 'idb';
import { api, ApiError } from './api';
export type Draft = {
  customerId?: string;
  vehicleId?: string;
  action?: 'close' | 'reopen' | 'void' | 'admin-edit' | 'transfer-owner';
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
  items?: { description: string; price: number }[];
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
};
type Mutation = {
  key: string;
  draft: Draft;
  version: string | null;
  revision: number;
};
export type RecordState = {
  id: string;
  draft: Draft;
  version: string | null;
  revision: number;
  savedRevision: number;
  order?: Order;
  pending?: Mutation;
};
const db = () =>
  openDB('j5-drafts-v1', 1, {
    upgrade(database) {
      database.createObjectStore('drafts');
    },
  });
export const storage = {
  async read(user: string): Promise<RecordState | undefined> {
    return (await db()).get('drafts', user);
  },
  async write(user: string, record: RecordState) {
    const database = await db();
    await database.put('drafts', record, user);
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
  private queue = Promise.resolve();
  private syncing = false;
  private stopped = false;
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
  ) {}
  private write() {
    const snapshot = structuredClone(this.state);
    this.queue = this.queue
      .catch(() => undefined)
      .then(() => this.persist(this.user, snapshot));
    return this.queue;
  }
  async edit(draft: Draft) {
    if (
      this.state.pending?.draft.action ||
      this.state.draft.action ||
      (this.state.order?.status === 'CLOSED' && draft.action !== 'reopen')
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
  async action(action: NonNullable<Draft['action']>) {
    const replaying =
      this.state.pending?.draft.action === action ||
      this.state.draft.action === action;
    const replayVersion = this.state.version;
    await this.flush();
    const beforeVersion = this.state.version;
    if (replaying) {
      if (
        this.state.version === replayVersion ||
        (action === 'close' && this.state.order?.status !== 'CLOSED') ||
        (action === 'reopen' && this.state.order?.status !== 'OPEN')
      )
        throw new Error('ACTION_REJECTED');
      return this.state.order;
    }
    await this.edit({ ...this.state.draft, action });
    await this.flush();
    if (
      this.state.version === beforeVersion ||
      (action === 'close' && this.state.order?.status !== 'CLOSED') ||
      (action === 'reopen' && this.state.order?.status !== 'OPEN')
    )
      throw new Error('ACTION_REJECTED');
    return this.state.order;
  }
  async pause() {
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
          if (this.state.revision === mutation.revision)
            this.state.draft = result.draft;
        }
        if (
          mutation.draft.action &&
          this.state.revision === mutation.revision
        ) {
          const { action: _, ...draft } = this.state.draft;
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
            ['OWNER_SELECTION_MISMATCH', 'ORDER_IDENTITY_MISMATCH'].includes(
              error.code,
            ))) &&
        this.state.pending?.draft.action
      ) {
        delete this.state.pending;
        const { action: _, ...draft } = this.state.draft;
        this.state.draft = draft;
        this.state.revision = this.state.savedRevision;
        await this.write();
        this.report(
          'La acción fue rechazada. Revisa los datos y los permisos.',
        );
      } else if (error instanceof ApiError && error.status === 401) {
        this.stopped = true;
        this.expired();
      } else if (
        error instanceof ApiError &&
        [409, 412, 428].includes(error.status)
      ) {
        this.stopped = true;
        this.report(
          'Conflicto de versión. Tu copia está protegida en este dispositivo; requiere revisión antes de continuar.',
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
