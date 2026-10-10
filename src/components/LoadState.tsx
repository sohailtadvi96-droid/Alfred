/** The two shared states for anything that loads: a quiet skeleton while it
 *  does, and one "couldn't load" line with a Retry when it fails. Every Home
 *  tile uses these, so a slow or failed module always looks the same. */

export function Loading({ rows = 2, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="ld" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="ld-line" />
      ))}
    </div>
  );
}

export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="ld-fail" role="alert">
      <span>Couldn’t load {what}.</span>
      <button type="button" className="ld-retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
