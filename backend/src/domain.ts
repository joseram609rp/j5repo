import { z } from 'zod';
export const IDLE_MS = 7_200_000;
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,64}$/);
export const passwordSchema = z
  .string()
  .min(12)
  .refine((s) => Buffer.byteLength(s, 'utf8') <= 72, 'Maximum 72 UTF-8 bytes');
export const roleSchema = z.enum(['ADMIN', 'MECHANIC']);
export { draftSchema } from './validation.js';
import { draftSchema } from './validation.js';
export type Draft = z.infer<typeof draftSchema>;
export type User = {
  id: string;
  username: string;
  fullName: string;
  passwordHash: string;
  role: 'ADMIN' | 'MECHANIC';
  active: boolean;
};
export type Session = {
  tokenHash: string;
  userId: string;
  csrf: string;
  lastActivity: number;
  revoked: boolean;
};
export type Order = {
  id: string;
  status: 'OPEN' | 'CLOSED' | 'VOID';
  version: string;
  draft: Draft;
  mechanicId: string;
  displayOrderId?: string;
  totalAmount?: number;
  subtotalAmount?: number;
  taxAmount?: number;
  taxRate?: number;
  closedAt?: string | null;
  openedAt?: string;
  mechanicName?: string;
};
export type Customer = {
  id: string;
  fullName: string;
  identification: string;
  phone: string;
  email: string | null;
};
export type Vehicle = {
  id: string;
  ownerId: string;
  plate: string;
  make: string;
  model: string | null;
  year: number;
  owner?: Customer;
};
export type Reply = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};
export type Receipt = {
  fingerprint: string;
  passwordHash?: string;
  reply: Reply;
};
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
  listOrders(
    status: 'OPEN' | 'CLOSED',
    search: string,
    before?: string,
  ): Promise<Order[]>;
  findCustomers(search: string): Promise<Customer[]>;
  findVehicles(search: string, customerId?: string): Promise<Vehicle[]>;
  order(id: string): Promise<Order | undefined>;
  saveOrder(
    id: string,
    userId: string,
    draft: Draft,
    previous?: Order,
  ): Promise<Order>;
  receipt(userId: string, key: string): Promise<Receipt | undefined>;
  insertReceipt(userId: string, key: string, receipt: Receipt): Promise<void>;
  audit(
    actorId: string | null,
    action: string,
    entityId: string | null,
  ): Promise<void>;
}
export interface Repository {
  run<T>(
    work: (tx: UnitOfWork) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
}
