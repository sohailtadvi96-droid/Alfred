import { money } from '@/lib/format';
import { categoryLabel } from './categories';
import { SeatedEnter } from '@/components/SeatedEnter';
import { useMonthSummary } from './hooks';

export function MonthDashboard({ month }: { month: string }) {
  const { data, isLoading } = useMonthSummary(month);

  if (isLoading || !data) {
    return <div className="bento-skeleton" aria-busy="true" />;
  }

  const { spendCents, incomeCents, prevSpendCents, byCategory, count } = data;
  const delta = prevSpendCents > 0 ? Math.round(((spendCents - prevSpendCents) / prevSpendCents) * 100) : null;
  const top = byCategory.slice(0, 3);
  const max = top[0]?.cents ?? 1;

  return (
    <SeatedEnter className="bento">
      <div className="dcard ochre span2" style={cssVar(0)}>
        <span className="idx">01</span>
        <span className="ct">On the books · this month</span>
        <h3>Total spend</h3>
        <span className="cbig">{money(spendCents, true)}</span>
        {delta !== null && (
          <span className="spec">
            <span>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs last month
            </span>
            <span>{count} txns</span>
          </span>
        )}
      </div>

      <div className="dcard sage" style={cssVar(1)}>
        <span className="idx">02</span>
        <span className="ct">Income</span>
        <span className="cbig">{money(incomeCents, true)}</span>
        <span className="spec">
          <span>credits this month</span>
          <span>◐</span>
        </span>
      </div>

      {top.length === 0 ? (
        <div className="dcard dark" style={cssVar(2)}>
          <span className="idx">03</span>
          <span className="ct">Categories</span>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 8 }}>
            Nothing spent yet this month.
          </p>
        </div>
      ) : (
        top.map((c, i) => (
          <div
            key={c.category}
            className={`dcard ${['rust', 'slate', 'dark'][i] ?? 'dark'}`}
            style={cssVar(2 + i)}
          >
            <span className="idx">{String(3 + i).padStart(2, '0')}</span>
            <span className="ct">{categoryLabel(c.category)}</span>
            <span className="cbig">{money(c.cents, true)}</span>
            <div className="bar">
              <span style={{ width: `${Math.max(8, Math.round((c.cents / max) * 100))}%` }} />
            </div>
          </div>
        ))
      )}
    </SeatedEnter>
  );
}

function cssVar(i: number) {
  return { ['--i' as string]: i } as React.CSSProperties;
}
