import { z } from 'zod';
export const IDLE_MS = 7_200_000;
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,64}$/);
export const passwordSchema = z.string().min(12).refine(s => Buffer.byteLength(s, 'utf8') <= 72, 'Maximum 72 UTF-8 bytes');
export const roleSchema = z.enum(['ADMIN', 'MECHANIC']);
export const draftSchema = z.object({
  customerName: z.string().max(200), plate: z.string().max(20),
  mileage: z.number().int().min(0).max(10_000_000).nullable(),
  notes: z.string().max(5000), recommendations: z.string().max(5000),
  customerId: z.uuid().optional(), vehicleId: z.uuid().optional()
}).strict();
export type Draft = z.infer<typeof draftSchema>;
export type User = { id: string; username: string; passwordHash: string; role: 'ADMIN' | 'MECHANIC'; active: boolean };
export type Session = { tokenHash: string; userId: string; csrf: string; lastActivity: number; revoked: boolean };
export type Order = { id: string; status: 'OPEN' | 'CLOSED' | 'VOID'; version: string; draft: Draft; mechanicId: string };
export type Reply = { status: number; body: unknown; headers: Record<string, string> };
export type Receipt = { fingerprint: string; passwordHash?: string; reply: Reply };
export const publicUser = ({ passwordHash: _, ...user }: User) => user;
export interface UnitOfWork {
  time(): Promise<number>;
  userByName(username: string): Promise<User | undefined>;
  userById(id: string): Promise<User | undefined>;
  users(): Promise<User[]>;
  insertUser(user: User): Promise<void>;
  updateUser(user: User): Promise<void>;
  session(hash: string): Promise<Session | undefined>;
  insertSession(session: Session): Promise<void>;
  touchSession(hash: string, now: number): Promise<void>;
  revokeSession(hash: string): Promise<void>;
  revokeUserSessions(id: string): Promise<void>;
  order(id: string): Promise<Order | undefined>;
  saveOrder(id: string, userId: string, draft: Draft, previous?: Order): Promise<Order>;
  receipt(userId: string, key: string): Promise<Receipt | undefined>;
  insertReceipt(userId: string, key: string, receipt: Receipt): Promise<void>;
  audit(actorId: string | null, action: string, entityId: string | null): Promise<void>;
}
export interface Repository {
  run<T>(work: (tx: UnitOfWork) => Promise<T>, signal?: AbortSignal): Promise<T>;
}
