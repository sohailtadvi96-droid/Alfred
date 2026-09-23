import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errMessage } from '@/lib/errors';
import * as api from './api';

/** Dev/maintenance affordance for 0036 — fills width/height on design_items
 *  rows that predate the column (or were ingested before it existed), by
 *  re-parsing each row's already-cached thumb_path bytes. No source refetch,
 *  no vision/embedding re-run — see design-backfill-dimensions's own file
 *  header. Loops it under this session's own token until has_more is
 *  false, showing a running count. Not wired anywhere else on purpose:
 *  there's nothing left to backfill once every row has had a first pass. */
export function BackfillDimensionsButton() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState<{ updated: number; unparsed: number; failed: number } | null>(null);
  const [firstFailure, setFirstFailure] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setFirstFailure(null);
    let updated = 0;
    let unparsed = 0;
    let failed = 0;
    try {
      let hasMore = true;
      while (hasMore) {
        const batch = await api.backfillDimensions();
        updated += batch.updated;
        unparsed += batch.unparsed;
        failed += batch.failed;
        setTotals({ updated, unparsed, failed });
        if (batch.failures[0]) setFirstFailure((f) => f ?? batch.failures[0].error);
        hasMore = batch.has_more;
        // Nothing scanned but has_more still true shouldn't happen — bail
        // rather than spin forever if it ever does.
        if (batch.scanned === 0) break;
      }
    } catch (err) {
      setError(errMessage(err, 'Backfill failed.'));
    } finally {
      setRunning(false);
      // Items already in the TanStack cache carry the stale (null)
      // width/height — refetch so the grid re-renders against real dims.
      qc.invalidateQueries({ queryKey: ['design'] });
    }
  }

  return (
    <div className="design-backfill">
      <button type="button" className="btn sec sm" onClick={run} disabled={running}>
        {running ? 'Filling in dimensions…' : 'Fill in missing dimensions'}
      </button>
      {totals && (
        <span className="design-backfill-result">
          {totals.updated} filled
          {totals.unparsed > 0 ? `, ${totals.unparsed} unparsed` : ''}
          {totals.failed > 0 ? `, ${totals.failed} failed` : ''}
          {running ? ' …' : ''}
        </span>
      )}
      {firstFailure && <span className="design-backfill-result design-backfill-error">{firstFailure}</span>}
      {error && <span className="design-backfill-result design-backfill-error">{error}</span>}
    </div>
  );
}
