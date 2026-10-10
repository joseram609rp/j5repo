import { api, ApiError } from './api';
import type { Session } from './session';
export type SessionStatus = 'checking' | 'authenticated' | 'anonymous';
export async function bootstrapSession(request = api): Promise<{status: SessionStatus; session: Session | null; healthOk: boolean}> {
  const [health, auth] = await Promise.allSettled([request('/health'), request<Session>('/auth/me')]);
  if (auth.status === 'fulfilled') return {status:'authenticated',session:auth.value,healthOk:health.status === 'fulfilled'};
  if (auth.reason instanceof ApiError && auth.reason.status === 401) return {status:'anonymous',session:null,healthOk:health.status === 'fulfilled'};
  throw new Error('SESSION_CHECK_FAILED');
}
