import { money } from '@/lib/format';
import { readableInk } from '@/lib/color';
import { SeatedEnter } from '@/components/SeatedEnter';
import { CategoryColorButton } from './CategoryColorButton';
import { useCategories, useMonthSummary } from './hooks';

export function MonthDashboard({ month }: { month: string }) {
  const { data, isLoading } = useMonthSummary(month);
  const cats = useCategories();

  if (isLoading || !data) {
    return <div className="bento-skeleton" aria-busy="true" />;
  }

  const { spendCents, incomeCents, prevSpendCents, byCategory, count } = data;
  const delta =
    prevSpendCents > 0 ? Math.round(((spendCents - prevSpendCents) / prevSpendCents) * 100) : null;
  const max = byCategory[0]?.cents ?? 1;

  return (
    <SeatedEnter className="bento">
      <div className="dcard span2" style={{ ...cssVar(0), background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
        <span className="idx">01</span>
        <span className="ct">On the books · this month</span>
        <h3>Total spend</h3>
        <span className="cbig">{money(spendCents, true)}</span>
        <span className="spec">
          <span>{delta !== null ? `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs last month` : 'no last-month data'}</span>
          <span>{count} txns</span>
        </span>
      </div>

      <div className="dcard" style={{ ...cssVar(1), background: cats.color('refund', 'credit'), color: readableInk(cats.color('refund', 'credit')) }}>
        <span className="idx">02</span>
        <span className="ct">Income</span>
        <span className="cbig">{money(incomeCents, true)}</span>
        <span className="spec">
          <span>credits this month</span>
        </span>
      </div>

      {byCategory.length === 0 ? (
        <div className="dcard" style={{ ...cssVar(2), background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--text-dim)' }}>
          <span className="idx">03</span>
          <span className="ct">Categories</span>
          <p style={{ fontSize: 13, marginTop: 8 }}>Nothing spent yet this month.</p>
        </div>
      ) : (
        byCategory.map((c, i) => {
          const color = cats.color(c.category, 'debit');
          const ink = readableInk(color);
          const cat = cats.get(c.category, 'debit');
          return (
            <div key={c.category} className="dcard" style={{ ...cssVar(2 + i), background: color, color: ink }}>
              <span className="idx">{String(3 + i).padStart(2, '0')}</span>
              <span className="ct">{cats.label(c.category, 'debit')}</span>
              <span className="cbig">{money(c.cents, true)}</span>
              <div className="bar">
                <span style={{ width: `${Math.max(8, Math.round((c.cents / max) * 100))}%`, background: ink }} />
              </div>
              {cat && (
                <div className="cat-card-tools">
                  <CategoryColorButton cat={cat} />
                </div>
              )}
            </div>
          );
        })
      )}
    </SeatedEnter>
  );
}

function cssVar(i: number) {
  return { ['--i' as string]: i } as React.CSSProperties;
}
