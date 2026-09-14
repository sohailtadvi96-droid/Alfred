import { useNavigate } from 'react-router-dom';
import { money, monthKey } from '@/lib/format';
import { useFrequencyBubbles } from './hooks';

const MAX_DOTS = 20;

/** One row per expense category, sorted by average ticket descending.
 *  Position carries the meaning a scatter chart needed three decoded axes
 *  for: top is where a single decision costs money, bottom is where a
 *  habit does. Replaces the earlier bubble chart, which failed a real
 *  legibility check. */
export function FrequencyTicket({ month }: { month: string }) {
  const { data, isLoading } = useFrequencyBubbles(month);
  const navigate = useNavigate();

  function openCategory(slug: string) {
    const p = new URLSearchParams();
    if (month !== monthKey()) p.set('month', month);
    p.set('flow', 'debit');
    p.set('category', slug);
    navigate({ pathname: '/expenses/transactions', search: `?${p.toString()}` });
  }

  if (isLoading) return <div className="ledger-empty">Loading…</div>;
  if (data.length === 0) {
    return (
      <div className="ledger-empty">
        <strong>No expense data yet this month.</strong>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.avgCents - a.avgCents);
  const maxTotal = Math.max(...sorted.map((d) => d.totalCents), 0);

  return (
    <div className="insight-panel">
      <h4 className="insight-section-label">Few, large — decisions</h4>
      <div className="freqstrip-rows">
        {sorted.map((d) => (
          <button
            key={d.slug}
            type="button"
            className="freqstrip-row"
            onClick={() => openCategory(d.slug)}
          >
            <span className="freqstrip-name">
              <span className="freqstrip-name-text">{d.label}</span>
              {d.isUnresolved && <span className="insight-tag unresolved">unresolved</span>}
            </span>
            <span className="freqstrip-avg">{money(d.avgCents, true)}</span>
            <span className="freqstrip-freq">
              <span className="freqstrip-dots">
                {Array.from({ length: Math.min(d.count, MAX_DOTS) }).map((_, i) => (
                  <span key={i} className={`freqstrip-dot${d.isUnresolved ? ' unresolved' : ''}`} />
                ))}
              </span>
              <span className="freqstrip-count">{d.count}</span>
            </span>
            <span className="freqstrip-total">
              <span className="freqstrip-total-bar">
                <span
                  className={`freqstrip-total-fill${d.isUnresolved ? ' unresolved' : ''}`}
                  style={{ width: `${maxTotal > 0 ? Math.max(4, (d.totalCents / maxTotal) * 100) : 0}%` }}
                />
              </span>
              <span className="freqstrip-total-amount">{money(d.totalCents, true)}</span>
            </span>
          </button>
        ))}
      </div>
      <h4 className="insight-section-label muted">Many, small — habits</h4>
    </div>
  );
}
