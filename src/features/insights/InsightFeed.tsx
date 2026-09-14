import { useDismissRecurringSeries, useInsightCards } from './hooks';
import type { InsightCard, InsightTier } from './types';
import { money } from '@/lib/format';

const TIER_TITLES: Record<InsightTier, string> = {
  1: 'Tier 1 — zero lifestyle change',
  2: 'Tier 2 — one phone call',
  3: 'Tier 3 — behavioural',
  4: 'Tier 4 — structural',
};

/** Evidence, annualised amount, effort, one action — nothing else. Alfred
 *  finds leaks; it doesn't advise what to do with money freed up. */
export function InsightFeed() {
  const { cards, isLoading, referenceMonthLabel, referenceIsComplete } = useInsightCards();
  const dismiss = useDismissRecurringSeries();

  if (isLoading) return <div className="ledger-empty">Loading…</div>;
  if (!cards || cards.length === 0) {
    return (
      <div className="ledger-empty">
        <strong>Nothing to surface yet.</strong>
        <span>Run the recurring detector, or check back once there's more history.</span>
      </div>
    );
  }

  const byTier = new Map<InsightTier, InsightCard[]>();
  for (const c of cards) {
    const arr = byTier.get(c.tier) ?? [];
    arr.push(c);
    byTier.set(c.tier, arr);
  }

  return (
    <div className="insight-panel">
      <h4 className="insight-section-label">
        Insights · from {referenceMonthLabel}
        {!referenceIsComplete && ' (partial — figures shown as counts, not annualised)'}
      </h4>

      {([1, 2, 3, 4] as InsightTier[]).map((tier) => {
        const tierCards = byTier.get(tier);
        if (!tierCards?.length) return null;
        return (
          <div key={tier} className="insight-tier">
            <h5 className="insight-tier-title">{TIER_TITLES[tier]}</h5>
            {tierCards.map((c) => (
              <div key={c.id} className="insight-card">
                <p className="insight-card-evidence">{c.evidence}</p>
                <div className="insight-card-row">
                  <span className="insight-card-annual">
                    {c.annualCents !== null ? `${money(c.annualCents, true)}/yr` : '—'}
                  </span>
                  <span className="insight-card-effort">{c.effort}</span>
                </div>
                <div className="insight-card-row">
                  <span className="insight-card-action">{c.action}</span>
                  {c.seriesId && (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => dismiss.mutate(c.seriesId as string)}
                      disabled={dismiss.isPending}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
