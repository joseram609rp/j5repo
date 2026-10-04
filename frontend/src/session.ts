import { api } from './api';
export type Session = { userId: string; csrf: string; idleMs: number; lastActivity: number };
/** Heartbeats only after actual foreground input. Polling/autosave never extends a session. */
export function trackActivity(session: Session, expired: () => void) {
  let last = session.lastActivity; let acknowledged = session.lastActivity; let inFlight = false; let ended = false;
  const expire = () => { if (!ended) { ended = true; expired(); } };
  const tick = async () => {
    if (ended) return;
    if (Date.now() - last >= session.idleMs || Date.now() - acknowledged >= session.idleMs) { expire(); return; }
    if (last <= acknowledged || inFlight) return;
    inFlight = true;
    try {
      const response = await api<{ lastActivity: number }>('/session/activity', { method: 'POST', headers: { 'X-CSRF-Token': session.csrf } });
      acknowledged = response.lastActivity;
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 401) expire();
    } finally { inFlight = false; }
  };
  const activity = (event: Event) => {
    if (!event.isTrusted || document.visibilityState !== 'visible' || ended) return;
    if (Date.now() - last >= session.idleMs || Date.now() - acknowledged >= session.idleMs) { expire(); return; }
    last = Date.now();
  };
  const events = ['pointerdown', 'keydown', 'input', 'touchstart'];
  events.forEach(name => window.addEventListener(name, activity, { passive: true }));
  const timer = setInterval(() => void tick(), 15000);
  const visibility = () => { void tick(); };
  document.addEventListener('visibilitychange', visibility);
  void tick();
  return () => { ended = true; clearInterval(timer); events.forEach(name => window.removeEventListener(name, activity)); document.removeEventListener('visibilitychange', visibility); };
}
