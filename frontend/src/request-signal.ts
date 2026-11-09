/** Combine an attempt timeout and caller cancellation without AbortSignal.any. */
export function requestSignal(ms: number, external?: AbortSignal | null) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
  const cancel = () => controller.abort(external?.reason);
  const expire = () => controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  if (timeout) timeout.addEventListener('abort', expire, { once: true });
  else timer = setTimeout(expire, ms);
  external?.addEventListener('abort', cancel, { once: true });
  if (external?.aborted) cancel();
  return { signal: controller.signal, cleanup() {
    clearTimeout(timer);
    timeout?.removeEventListener('abort', expire);
    external?.removeEventListener('abort', cancel);
  } };
}

export function checkCancellation(signal?: AbortSignal | null) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Request cancelled', 'AbortError');
}

export function retryDelay(ms: number, signal?: AbortSignal | null): Promise<void> {
  checkCancellation(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); reject(signal?.reason ?? new DOMException('Request cancelled', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
