export function SyncStatus({ message, retryable, onRetry }: { message: string; retryable: boolean; onRetry: () => void }) {
  return <div className="status"><p role="status" aria-live="polite">{message}</p>{retryable && <button type="button" className="quiet" onClick={onRetry}>Reintentar sincronización</button>}</div>;
}
