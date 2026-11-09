export type EditorAccess = 'checking' | 'ready' | 'occupied' | 'unsupported' | 'error';

const retryDelays = [150, 350, 750, 1500, 3000, 5000];
// StrictMode and session replacement can dispose one controller before its request settles.
let lastRequest = Promise.resolve();

export function startEditorLock(
  userId: string,
  onAccess: (access: EditorAccess) => void,
  onRelease: () => Promise<void>,
) {
  const locks = navigator.locks;
  const writes = new Set<Promise<unknown>>();
  let lease: object | undefined;
  let release: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let requesting = false;
  let parked = false;
  let disposed = false;
  let wakePending = false;
  const visible = () => !disposed && !parked && document.visibilityState !== 'hidden';

  function request() {
    if (!locks || !visible() || lease || requesting) return;
    requesting = true;
    wakePending = false;
    lastRequest = lastRequest.then(async () => {
      try {
        if (!visible()) return;
        // An immediate request never joins the browser's wait queue. The callback
        // also checks lifecycle state in case pagehide/dispose won the race.
        await locks.request(`j5-editor-${userId}`, { ifAvailable: true }, async lock => {
          if (!visible()) return;
          if (!lock) {
            onAccess('occupied');
            return;
          }
          attempt = 0;
          lease = {};
          const held = new Promise<void>(resolve => {
            release = () => {
              void Promise.allSettled([...writes, onRelease()]).then(() => resolve());
            };
          });
          onAccess('ready');
          await held;
        });
      } catch {
        if (visible()) onAccess('error');
      } finally {
        requesting = false;
        if (!visible()) return;
        if (wakePending) {
          request();
        } else if (attempt < retryDelays.length) {
          timer = setTimeout(request, retryDelays[attempt++]);
        }
      }
    });
  }

  function wake() {
    if (!locks || !visible() || lease) return;
    clearTimeout(timer);
    attempt = 0;
    if (requesting) wakePending = true;
    else request();
  }

  function relinquish() {
    clearTimeout(timer);
    lease = undefined;
    release?.();
    release = undefined;
  }

  function hide() {
    parked = true;
    relinquish();
    if (locks) onAccess('checking');
  }

  function show() {
    parked = false;
    wake();
  }

  onAccess(locks ? 'checking' : 'unsupported');
  window.addEventListener('focus', wake);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  document.addEventListener('visibilitychange', wake);
  request();

  return {
    get lease() { return lease; },
    retry: wake,
    async write<T>(expected: object | undefined, work: () => Promise<T>): Promise<T> {
      if (!expected || lease !== expected) throw new Error('EDITOR_NOT_READY');
      const pending = work();
      writes.add(pending);
      try { return await pending; }
      finally { writes.delete(pending); }
    },
    dispose() {
      disposed = true;
      relinquish();
      window.removeEventListener('focus', wake);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      document.removeEventListener('visibilitychange', wake);
    },
  };
}
