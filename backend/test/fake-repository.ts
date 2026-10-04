import { HttpError } from '../src/reliability.js';
import { IDLE_MS, type Draft, type Order, type Receipt, type Repository, type Session, type UnitOfWork, type User } from '../src/domain.js';

/** Transactional test double only. Runtime always uses SqlRepository. */
export class FakeRepository implements Repository, UnitOfWork {
  clock = 1_000_000;
  accounts = new Map<string, User>();
  sessions = new Map<string, Session>();
  orders = new Map<string, Order>();
  receipts = new Map<string, Receipt>();
  audits: { actorId: string | null; action: string; entityId: string | null }[] = [];
  failReceipt = false;
  private queue = Promise.resolve();
  async run<T>(work: (tx: UnitOfWork) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const snapshot = structuredClone({ accounts: this.accounts, sessions: this.sessions, orders: this.orders, receipts: this.receipts, audits: this.audits });
    try { signal?.throwIfAborted(); return structuredClone(await work(this)); }
    catch (error) { Object.assign(this, snapshot); throw error; }
    finally { release(); }
  }
  async time() { return this.clock; }
  async userByName(username: string) { return [...this.accounts.values()].find(x => x.username === username); }
  async userById(id: string) { return this.accounts.get(id); }
  async users() { return [...this.accounts.values()]; }
  async insertUser(user: User) { this.accounts.set(user.id, structuredClone(user)); }
  async updateUser(user: User) { this.accounts.set(user.id, structuredClone(user)); }
  async session(hash: string) { return this.sessions.get(hash); }
  async insertSession(session: Session) { if (!this.sessions.has(session.tokenHash)) this.sessions.set(session.tokenHash, structuredClone(session)); }
  async touchSession(hash: string, now: number) {
    const s = this.sessions.get(hash);
    if (!s || s.revoked || now - s.lastActivity >= IDLE_MS) throw new HttpError(401, 'SESSION_EXPIRED');
    s.lastActivity = now;
  }
  async revokeSession(hash: string) { const s = this.sessions.get(hash); if (s) s.revoked = true; }
  async revokeUserSessions(id: string) { for (const s of this.sessions.values()) if (s.userId === id) s.revoked = true; }
  async order(id: string) { return this.orders.get(id); }
  async saveOrder(id: string, userId: string, draft: Draft, previous?: Order) {
    const order: Order = { id, status: 'OPEN', mechanicId: previous?.mechanicId ?? userId,
      version: (BigInt('0x' + (previous?.version ?? '0')) + 1n).toString(16).padStart(16, '0'), draft: structuredClone(draft) };
    this.orders.set(id, order);
    return order;
  }
  async receipt(userId: string, key: string) { return this.receipts.get(userId + ':' + key); }
  async insertReceipt(userId: string, key: string, receipt: Receipt) {
    if (this.failReceipt) throw new Error('simulated receipt storage failure');
    this.receipts.set(userId + ':' + key, structuredClone(receipt));
  }
  async audit(actorId: string | null, action: string, entityId: string | null) { this.audits.push({ actorId, action, entityId }); }
}
