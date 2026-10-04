import { openDB } from 'idb';
import { api, ApiError } from './api';
export type Draft = { customerName: string; plate: string; mileage: number | null; notes: string; recommendations: string };
type Mutation = { key: string; draft: Draft; version: string | null; revision: number };
export type RecordState = { id: string; draft: Draft; version: string | null; revision: number; savedRevision: number; pending?: Mutation };
const db = () => openDB('j5-drafts-v1', 1, { upgrade(database) { database.createObjectStore('drafts'); } });
export const storage = {
  async read(user: string): Promise<RecordState | undefined> { return (await db()).get('drafts', user); },
  async write(user: string, record: RecordState) { const database = await db(); await database.put('drafts', record, user); }
};
export const fresh = (): RecordState => ({ id: crypto.randomUUID(), draft: { customerName: '', plate: '', mileage: null, notes: '', recommendations: '' }, version: null, revision: 0, savedRevision: 0 });
/** Freeze the payload/key before sending. Never reuse a key with an edited payload. */
export class Autosave {
  private queue = Promise.resolve();
  private syncing = false;
  private stopped = false;
  private active?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(public state: RecordState, private user: string, private csrf: string, private report: (message: string) => void, private expired: () => void,
    private persist = storage.write,
    private send = (id: string, mutation: Mutation) => api<{ version: string }>(`/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf, 'Idempotency-Key': mutation.key, ...(mutation.version === null ? {} : { 'If-Match': `"${mutation.version}"` }) }, body: JSON.stringify(mutation.draft) })) {}
  private write() {
    const snapshot = structuredClone(this.state);
    this.queue = this.queue.catch(() => undefined).then(() => this.persist(this.user, snapshot));
    return this.queue;
  }
  async edit(draft: Draft) {
    this.state.draft = draft; this.state.revision++;
    this.report('Guardando en este dispositivo…');
    try { await this.write(); this.report('Cambios guardados en este dispositivo'); }
    catch { this.report('No se pudo guardar en este dispositivo. Mantén esta ventana abierta.'); return; }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), 800);
  }
  async pause() { this.stopped = true; clearTimeout(this.timer); await this.active; await this.write(); }
  sync(): Promise<void> {
    if (this.active) return this.active;
    this.active = this.runSync().finally(() => { this.active = undefined; });
    return this.active;
  }
  private async runSync() {
    if (this.syncing || this.stopped) return;
    this.syncing = true;
    try {
      await this.queue;
      while (!this.stopped && (this.state.pending || this.state.savedRevision < this.state.revision)) {
        this.state.pending ??= { key: crypto.randomUUID(), draft: structuredClone(this.state.draft), version: this.state.version, revision: this.state.revision };
        await this.write();
        const mutation = this.state.pending;
        this.report('Sincronizando…');
        const result = await this.send(this.state.id, mutation);
        this.state.version = result.version; this.state.savedRevision = mutation.revision; delete this.state.pending;
        await this.write();
        this.report('Guardado en el servidor');
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { this.stopped = true; this.expired(); }
      else if (error instanceof ApiError && [409, 412, 428].includes(error.status)) { this.stopped = true; this.report('Conflicto de versión. Tu copia está protegida en este dispositivo; requiere revisión antes de continuar.'); }
      else this.report('No se pudo sincronizar. Conservamos la copia local; pulsa Reintentar.');
    } finally { this.syncing = false; }
  }
}
