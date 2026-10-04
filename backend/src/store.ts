import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './reliability.js';
export const draftSchema = z.object({
  customerName: z.string().max(200), plate: z.string().max(20),
  mileage: z.number().int().min(0).max(10_000_000).nullable(),
  notes: z.string().max(5000), recommendations: z.string().max(5000)
}).strict();
export type Draft = z.infer<typeof draftSchema>;
export type Order = { id: string; status: 'OPEN'; version: number; draft: Draft; mechanicId: string };
export type Session = { userId: string; lastActivity: number; csrf: string };
/** Local demonstration ONLY: synchronous mutations form one atomic operation in one process. */
export class MemoryStore {
  orders = new Map<string, Order>();
  sessions = new Map<string, Session>();
  private requests = new Map<string, { fingerprint: string; result: Order }>();
  session(token: string, now: number, idleMs: number): Session {
    const session = this.sessions.get(token);
    if (!session || now - session.lastActivity >= idleMs) {
      this.sessions.delete(token);
      throw new HttpError(401, 'SESSION_EXPIRED');
    }
    return session;
  }
  save(userId: string, key: string, id: string, expected: string | null, draft: Draft): Order {
    const scope = `${userId}:${key}`;
    const fingerprint = createHash('sha256').update(JSON.stringify({ id, expected, draft })).digest('hex');
    const previous = this.requests.get(scope);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED');
      return structuredClone(previous.result);
    }
    const existing = this.orders.get(id);
    if (existing && expected === null) throw new HttpError(428, 'VERSION_REQUIRED');
    if ((existing && expected !== `"${existing.version}"`) || (!existing && expected !== null)) throw new HttpError(412, 'VERSION_CONFLICT');
    const result: Order = { id, status: 'OPEN', version: (existing?.version ?? 0) + 1, draft, mechanicId: existing?.mechanicId ?? userId };
    this.orders.set(id, structuredClone(result));
    this.requests.set(scope, { fingerprint, result: structuredClone(result) });
    return result;
  }
  login(now: number) {
    const token = randomUUID();
    const session = { userId: 'local-demo', lastActivity: now, csrf: randomUUID() };
    this.sessions.set(token, session);
    return { token, session };
  }
}
