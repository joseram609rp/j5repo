// The signal contains no order or session data. IndexedDB remains authoritative.
// Storage events are available on iPadOS 15, including versions without BroadcastChannel.
export const draftChangeKey = 'j5:draft-change';
export const draftChangeEvent = 'j5-draft-change';

export function publishDraftChange() {
  try {
    localStorage.setItem(draftChangeKey, crypto.randomUUID());
  } catch { /* Focus, visibility and periodic checks cover unavailable storage events. */ }
  window.dispatchEvent(new Event(draftChangeEvent));
}

export function onDraftChange(listener: () => void) {
  const receive = (event: StorageEvent) => {
    if (event.key === draftChangeKey) listener();
  };
  window.addEventListener('storage', receive);
  window.addEventListener(draftChangeEvent, listener);
  return () => {
    window.removeEventListener('storage', receive);
    window.removeEventListener(draftChangeEvent, listener);
  };
}
