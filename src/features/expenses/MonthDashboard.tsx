import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addMonths, casualDayMonth, money, monthKey, monthLabel } from '@/lib/format';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { SeatedEnter } from '@/components/SeatedEnter';
import { BurnCurve } from './BurnCurve';
import { buildBurnSeries } from './burnSeries';
import { CategoryCard, type RecentEntry } from './CategoryCard';
import { EditCategoryDialog } from './EditCategoryDialog';
import { AccountsWallet } from './AccountsWallet';
import {
  useCategories,
  useLedgerStaleness,
  useMonthSummary,
  usePeriodComparison,
  useTransactions,
} from './hooks';
import { usePrivacy, MASK } from './privacy';
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
  const prevMonth = addMonths(month, -1);
  const { data: prevMonthTxns } = useTransactions({ month: prevMonth });
  const cats = useCategories();
  const navigate = useNavigate();
  const { hidden } = usePrivacy();
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);

  // day-of-month of the LAST transaction IN THIS MONTH — not today's date.
  // For the current/latest month this naturally lands on the ledger's
  // actual cutoff (e.g. 5 for a ledger that runs to 5 Sept); for a fully
  // populated past month it lands on that month's real last day.
  const lastTxnDay = useMemo(() => {
    if (!monthTxns || monthTxns.length === 0) return null;
    let max = 0;
    for (const t of monthTxns) {
      const d = new Date(t.occurred_at).getDate();
      if (d > max) max = d;
    }
    return max;
  }, [monthTxns]);

  const currentBurn = useMemo(() => buildBurnSeries(monthTxns), [monthTxns]);
  const priorBurn = useMemo(() => buildBurnSeries(prevMonthTxns), [prevMonthTxns]);

  const { data: comparison } = usePeriodComparison(month, lastTxnDay);
  const { data: ledgerLastTxnDate } = useLedgerStaleness();
  const daysStale =
    ledgerLastTxnDate != null
      ? Math.floor((Date.now() - new Date(ledgerLastTxnDate).getTime()) / 86_400_000)
      : null;

  if (isLoading || !data) {
    return <div className="bento-skeleton" aria-busy="true" />;
  }

  const { spendCents, incomeCents, transfersCents, transfersCount, count } = data;
  const cmpPct =
    comparison && comparison.priorExpenseCents ? Math.round(
      ((comparison.currentExpenseCents - comparison.priorExpenseCents) / comparison.priorExpenseCents) * 100,
    ) : null;
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
      arr.push({ merchant: t.merchant_display, amountCents: t.amount_cents, direction: t.direction, date: t.occurred_at });
      recentByKey.set(k, arr);
    }
  }

  // transfer-kind categories (cash withdrawal, self-transfer, credit card
  // payment) get their own block below, not a card in this grid
  const cards = cats.all
    .filter((c) => (!flow || c.direction === flow) && c.kind !== 'transfer')
    .map((cat) => {
      const t = totals.get(`${cat.direction}:${cat.slug}`);
      return { cat, cents: t?.cents ?? 0, count: t?.count ?? 0 };
    })
    .sort((a, b) => b.cents - a.cents || a.cat.sort - b.cat.sort);

  const activeCards = cards.filter((c) => c.count > 0);
  const emptyCards = cards.filter((c) => c.count === 0);

  function openCategory(cat: Category) {
    const p = new URLSearchParams();
    if (month !== monthKey()) p.set('month', month);
    p.set('flow', cat.direction);
    p.set('category', cat.slug);
    navigate({ pathname: '/expenses/transactions', search: `?${p.toString()}` });
  }

  return (
    <div className="dash-layout">
      <div className="dash-main">
        <div className="sumcard">
          <span className="sumcard-l">Total spend · this month</span>
          <span className="sumcard-v">
            <AnimatedNumber value={spendCents} format={(c) => money(c, true)} />
          </span>
          <span className="sumcard-s">
            {comparison && comparison.priorExpenseCents != null && (
              <>
                <span
                  data-tip={
                    comparison.clamped
                      ? `Last month only has ${comparison.priorToDay} days — comparison clamped to that`
                      : undefined
                  }
                >
                  {comparison.priorExpenseCents > 0 && (
                    <>
                      {cmpPct! >= 0 ? '▲' : '▼'} <AnimatedNumber value={Math.abs(cmpPct!)} format={String} />%{' '}
                    </>
                  )}
                  vs same days last month ({money(comparison.currentExpenseCents, true)} vs{' '}
                  {money(comparison.priorExpenseCents, true)})
                </span>
                {' · '}
              </>
            )}
            <AnimatedNumber value={count} format={String} /> {count === 1 ? 'entry' : 'entries'}
          </span>
          {daysStale !== null && daysStale > 0 && ledgerLastTxnDate && (
            <span className={`sumcard-s sumcard-stale${daysStale > 3 ? ' amber' : ''}`}>
              Ledger current to {casualDayMonth(ledgerLastTxnDate)} · {daysStale} day{daysStale === 1 ? '' : 's'}{' '}
              unimported
            </span>
          )}
        </div>

        <BurnCurve
          current={currentBurn}
          prior={priorBurn}
          currentLabel={monthLabel(month)}
          priorLabel={monthLabel(prevMonth)}
        />

        <SeatedEnter className="catgrid">
          {activeCards.map(({ cat, cents, count: n }, i) => {
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

          {emptyCards.length > 0 && !showEmpty && (
            <button
              type="button"
              className="catgrid-collapsed"
              onClick={() => setShowEmpty(true)}
            >
              <span>
                {emptyCards.length} categor{emptyCards.length === 1 ? 'y' : 'ies'} with no activity
              </span>
              <span aria-hidden="true">＋</span>
            </button>
          )}

          {showEmpty &&
            emptyCards.map(({ cat, cents, count: n }, i) => {
              const d = denom(cat.direction);
              return (
                <CategoryCard
                  key={`${cat.direction}:${cat.slug}`}
                  style={{ ['--i' as string]: activeCards.length + i } as React.CSSProperties}
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
        </SeatedEnter>
      </div>

      <div className="dash-side">
        <div className="sumcard sumcard-income">
          <span className="sumcard-l">Income · this month</span>
          <span className="sumcard-v" style={{ color: 'var(--pos)' }}>
            {hidden ? MASK : <AnimatedNumber value={incomeCents} format={(c) => money(c, true)} />}
          </span>
          <span className="sumcard-s">
            <AnimatedNumber value={creditCount} format={String} /> credit
            {creditCount === 1 ? '' : 's'}
          </span>
        </div>

        {transfersCount > 0 && (
          <div className="sumcard sumcard-transfers">
            <span className="sumcard-l">Transfers · this month</span>
            <span className="sumcard-v">
              <AnimatedNumber value={transfersCents} format={(c) => money(c, true)} />
            </span>
            <span className="sumcard-s">
              <AnimatedNumber value={transfersCount} format={String} />{' '}
              {transfersCount === 1 ? 'entry' : 'entries'} · cash withdrawals, self-transfers &amp;
              card payments — not counted as spend
            </span>
          </div>
        )}

        <AccountsWallet />
      </div>

      {editCat && <EditCategoryDialog cat={editCat} onClose={() => setEditCat(null)} />}
    </div>
  );
}
