import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { money, monthKey } from '@/lib/format';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { SeatedEnter } from '@/components/SeatedEnter';
import { CategoryCard, type RecentEntry } from './CategoryCard';
import { EditCategoryDialog } from './EditCategoryDialog';
import { AccountsWallet } from './AccountsWallet';
import { useCategories, useMonthSummary, useTransactions } from './hooks';
import type { Category, Direction } from './categories';

export function MonthDashboard({
  month,
  flow,
}: {
  month: string;
  flow: Direction | undefined;
}) {
  const { data, isLoading } = useMonthSummary(month);
  const { data: monthTxns } = useTransactions({ month });
  const cats = useCategories();
  const navigate = useNavigate();
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

  // up to 2 most-recent entries per category (list is already newest-first)
  const recentByKey = new Map<string, RecentEntry[]>();
  for (const t of monthTxns ?? []) {
    const k = `${t.direction}:${t.category}`;
    const arr = recentByKey.get(k) ?? [];
    if (arr.length < 2) {
      arr.push({ merchant: t.merchant_raw, amountCents: t.amount_cents, direction: t.direction, date: t.occurred_at });
      recentByKey.set(k, arr);
    }
  }

  const cards = cats.all
    .filter((c) => !flow || c.direction === flow)
    .map((cat) => {
      const t = totals.get(`${cat.direction}:${cat.slug}`);
      return { cat, cents: t?.cents ?? 0, count: t?.count ?? 0 };
    })
    .sort((a, b) => b.cents - a.cents || a.cat.sort - b.cat.sort);

  function openCategory(cat: Category) {
    const p = new URLSearchParams();
    if (month !== monthKey()) p.set('month', month);
    p.set('flow', cat.direction);
    p.set('category', cat.slug);
    navigate({ pathname: '/expenses/transactions', search: `?${p.toString()}` });
  }

  const ledgerSearch = (() => {
    const p = new URLSearchParams();
    if (month !== monthKey()) p.set('month', month);
    if (flow) p.set('flow', flow);
    const s = p.toString();
    return s ? `?${s}` : '';
  })();

  return (
    <div className="dash-layout">
      <div className="dash-main">
        <div className="sumcard">
          <span className="sumcard-l">Total spend · this month</span>
          <span className="sumcard-v">
            <AnimatedNumber value={spendCents} format={(c) => money(c, true)} />
          </span>
          <span className="sumcard-s">
            {delta !== null ? (
              <>
                {delta >= 0 ? '▲' : '▼'} <AnimatedNumber value={Math.abs(delta)} format={String} />%
                vs last month
              </>
            ) : (
              'no last-month data'
            )}
            {' · '}
            <AnimatedNumber value={count} format={String} /> {count === 1 ? 'entry' : 'entries'}
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
                month={month}
                spentCents={cents}
                count={n}
                sharePct={d > 0 ? Math.round((cents / d) * 100) : 0}
                recent={recentByKey.get(`${cat.direction}:${cat.slug}`) ?? []}
                onOpen={() => openCategory(cat)}
                onEdit={() => setEditCat(cat)}
              />
            );
          })}
          <Link
            className="catgrid-arrow"
            to={{ pathname: '/expenses/transactions', search: ledgerSearch }}
            style={{ ['--i' as string]: cards.length } as React.CSSProperties}
            data-tip="Open the full ledger — flow, category & account filters"
            aria-label="Open transactions"
          >
            →
          </Link>
        </SeatedEnter>
      </div>

      <div className="dash-side">
        <div className="sumcard sumcard-income">
          <span className="sumcard-l">Income · this month</span>
          <span className="sumcard-v" style={{ color: 'var(--pos)' }}>
            <AnimatedNumber value={incomeCents} format={(c) => money(c, true)} />
          </span>
          <span className="sumcard-s">
            <AnimatedNumber value={creditCount} format={String} /> credit
            {creditCount === 1 ? '' : 's'}
          </span>
        </div>

        <AccountsWallet />
      </div>

      {editCat && <EditCategoryDialog cat={editCat} onClose={() => setEditCat(null)} />}
    </div>
  );
}
