import { money } from '@/lib/format';
import type { CategoryBucket } from './categories';
import type { BucketTotal } from './bucketSummary';

const BUCKET_META: Record<CategoryBucket | 'unbucketed', { label: string; color: string }> = {
  need: { label: 'Need', color: 'var(--c-sage)' },
  want: { label: 'Want', color: 'var(--c-rust)' },
  obligation: { label: 'Obligation', color: 'var(--c-slate)' },
  invest: { label: 'Invest', color: 'var(--c-plum)' },
  unbucketed: { label: 'Unbucketed', color: 'var(--text-faint)' },
};
const ORDER: (CategoryBucket | 'unbucketed')[] = ['need', 'want', 'obligation', 'invest', 'unbucketed'];

/** One stacked horizontal bar, need/want/obligation/invest + an explicit
 *  unbucketed remainder. The headline is discretionary spend (the want
 *  bucket) — the number every later savings recommendation runs on. */
export function BucketBar({ totals }: { totals: BucketTotal[] }) {
  const byBucket = new Map(totals.map((t) => [t.bucket, t]));
  const totalCents = totals.reduce((s, t) => s + t.cents, 0);
  const want = byBucket.get('want');
  const wantPct = totalCents > 0 ? Math.round(((want?.cents ?? 0) / totalCents) * 100) : 0;

  if (totalCents === 0) {
    return (
      <div className="bucketbar bucketbar-empty">
        <span className="tlabel">No expense data yet this month.</span>
      </div>
    );
  }

  const segments = ORDER.map((b) => byBucket.get(b)).filter((t): t is BucketTotal => !!t && t.cents > 0);

  return (
    <div className="bucketbar">
      <div className="bucketbar-headline">
        <span className="bucketbar-headline-v">{money(want?.cents ?? 0, true)}</span>
        <span className="bucketbar-headline-l">discretionary · {wantPct}% of spend</span>
      </div>

      <div className="bucketbar-track">
        {segments.map((t) => (
          <div
            key={t.bucket}
            className="bucketbar-seg"
            style={{ width: `${(t.cents / totalCents) * 100}%`, background: BUCKET_META[t.bucket].color }}
            data-tip={`${BUCKET_META[t.bucket].label}: ${money(t.cents, true)} (${Math.round((t.cents / totalCents) * 100)}%)`}
          />
        ))}
      </div>

      <div className="bucketbar-legend">
        {segments.map((t) => (
          <span key={t.bucket} className="bucketbar-lg">
            <i className="bucketbar-swatch" style={{ background: BUCKET_META[t.bucket].color }} />
            {BUCKET_META[t.bucket].label} · {money(t.cents, true)} · {Math.round((t.cents / totalCents) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
