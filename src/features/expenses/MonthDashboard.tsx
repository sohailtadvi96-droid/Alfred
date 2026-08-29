import { useState } from 'react';
import { money } from '@/lib/format';
import { SeatedEnter } from '@/components/SeatedEnter';
import { CategoryCard } from './CategoryCard';
import { EditCategoryDialog } from './EditCategoryDialog';
import { AccountsWallet } from './AccountsWallet';
import { useCategories, useMonthSummary } from './hooks';
import type { Category, Direction } from './categories';
import type { TxnFilter } from './api';

export function MonthDashboard({
  month,
  filter,
  onFilterChange,
}: {
  month: string;
  filter: Omit<TxnFilter, 'month'>;
  onFilterChange: (f: Omit<TxnFilter, 'month'>) => void;
}) {
  const { data, isLoading } = useMonthSummary(month);
  const cats = useCategories();
  const flow = filter.direction;
  const [editCat, setEditCat] = useState<Category | null>(null);

  if (isLoading || !data) {
    return <div className="bento-skeleton" aria-busy="true" />;
  }

  const { spendCents, incomeCents, prevSpendCents, count } = data;
  const delta =
    prevSpendCents > 0 ? Math.round(((spendCents - prevSpendCents) / prevSpendCents) * 100) : null;
  const creditCount = data.byCategory
    .filter((c) => c.direction === 'credit')
    .reduce((s, c) => s + c.count, 0);

  const totals = new Map(data.byCategory.map((c) => [`${c.direction}:${c.category}`, c]));
  const denom = (d: Direction) => (d === 'credit' ? incomeCents : spendCents);

  const cards = cats.all
    .filter((c) => !flow || c.direction === flow)
    .map((cat) => {
      const t = totals.get(`${cat.direction}:${cat.slug}`);
      return { cat, cents: t?.cents ?? 0, count: t?.count ?? 0 };
    })
    .sort((a, b) => b.cents - a.cents || a.cat.sort - b.cat.sort);

  function toggleCategory(slug: string, direction: Direction) {
    if (filter.category === slug) onFilterChange({ ...filter, category: undefined });
    else onFilterChange({ ...filter, category: slug, direction });
  }

  return (
    <div className="dash-layout">
      <div className="dash-main">
        <div className="sumcard">
          <span className="sumcard-l">Total spend · this month</span>
          <span className="sumcard-v">{money(spendCents, true)}</span>
          <span className="sumcard-s">
            {delta !== null
              ? `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs last month`
              : 'no last-month data'}
            {' · '}
            {count} {count === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        <SeatedEnter className="catgrid">
          {cards.map(({ cat, cents, count: n }, i) => {
            const d = denom(cat.direction);
            return (
              <CategoryCard
                key={`${cat.direction}:${cat.slug}`}
                style={{ ['--i' as string]: i } as React.CSSProperties}
                cat={cat}
                rank={i + 1}
                spentCents={cents}
                count={n}
                sharePct={d > 0 ? Math.round((cents / d) * 100) : 0}
                active={filter.category === cat.slug}
                onToggle={() => toggleCategory(cat.slug, cat.direction)}
                onEdit={() => setEditCat(cat)}
              />
            );
          })}
        </SeatedEnter>
      </div>

      <div className="dash-side">
        <div className="sumcard sumcard-income">
          <span className="sumcard-l">Income · this month</span>
          <span className="sumcard-v" style={{ color: 'var(--pos)' }}>
            {money(incomeCents, true)}
          </span>
          <span className="sumcard-s">
            {creditCount} credit{creditCount === 1 ? '' : 's'}
          </span>
        </div>

        <AccountsWallet />
      </div>

      {editCat && <EditCategoryDialog cat={editCat} onClose={() => setEditCat(null)} />}
    </div>
  );
}
