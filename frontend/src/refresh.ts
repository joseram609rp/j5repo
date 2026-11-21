import { useEffect, useRef } from 'react';

type Resource = 'orders' | 'invoices' | 'operational';
const key = 'j5:server-change';

export function publishServerChange(resource: Resource, notifyCurrentTab = true) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify({ resource, nonce: crypto.randomUUID() }));
  } catch { /* Visibility and the refresh button cover unavailable storage events. */ }
  if (notifyCurrentTab) window.dispatchEvent(new CustomEvent(key, { detail: resource }));
}

export function useVisibleRefresh({
  enabled = true, interval, resources, refresh,
}: {
  enabled?: boolean;
  interval?: number;
  resources: readonly Resource[];
  refresh: () => boolean;
}) {
  const current = useRef(refresh);
  current.current = refresh;
  const topics = resources.join(',');
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const visible = () => document.visibilityState !== 'hidden';
    const check = (age: number) => {
      if (!visible() || (!dirty && Date.now() - last < age)) return;
      if (!current.current()) {
        if (dirty) {
          clearTimeout(timer);
          timer = setTimeout(() => check(0), 500);
        }
        return;
      }
      last = Date.now();
      dirty = false;
    };
    const foreground = () => check(45_000);
    const invalidate = (resource?: Resource) => {
      if (!resource || !topics.split(',').includes(resource)) return;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(() => check(0), 100);
    };
    const local = (event: Event) => invalidate((event as CustomEvent<Resource>).detail);
    const remote = (event: StorageEvent) => {
      if (event.key !== key || !event.newValue) return;
      try { invalidate(JSON.parse(event.newValue).resource); } catch { /* Ignore invalid signals. */ }
    };
    const events = ['focus', 'pageshow', 'online'] as const;
    events.forEach(event => window.addEventListener(event, foreground));
    document.addEventListener('visibilitychange', foreground);
    window.addEventListener(key, local);
    window.addEventListener('storage', remote);
    const fallback = interval === undefined ? undefined : setInterval(() => check(interval), interval);
    return () => {
      clearInterval(fallback);
      clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, foreground));
      document.removeEventListener('visibilitychange', foreground);
      window.removeEventListener(key, local);
      window.removeEventListener('storage', remote);
    };
  }, [enabled, interval, topics]);
}
