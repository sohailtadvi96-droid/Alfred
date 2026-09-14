import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, monthKey, monthLabel } from '@/lib/format';
import { useCategories, useLedgerStaleness, useMonthSummary } from '@/features/expenses/hooks';
import {
  buildCategoryBars,
  buildFrequencyBubbles,
  dismissRecurringSeries,
  listRecurringCandidateTxns,
  listRecurringSeries,
} from './api';
import { buildInsightCards } from './recommendations';

export function useCategoryBars(month: string) {
  const { data: summary, isLoading: summaryLoading } = useMonthSummary(month);
  const cats = useCategories();

  const data = useMemo(
    () => (summary ? buildCategoryBars(summary, cats.all) : null),
    [summary, cats.all],
  );

  return { data, isLoading: summaryLoading || cats.loading };
}

export function useFrequencyBubbles(month: string) {
  const { data: summary, isLoading: summaryLoading } = useMonthSummary(month);
  const cats = useCategories();

  const data = useMemo(
    () => (summary ? buildFrequencyBubbles(summary, cats.all) : []),
    [summary, cats.all],
  );

  return { data, isLoading: summaryLoading || cats.loading };
}

function daysInCalendarMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** The last COMPLETE month in the ledger — never the calendar's current
 *  month, and never a month the ledger only partially covers. September
 *  running to the 5th must not get treated as a full month anywhere an
 *  annualised figure is computed. */
function useReferenceMonth() {
  const { data: lastTxnDate } = useLedgerStaleness();
  const latestMonth = lastTxnDate ? lastTxnDate.slice(0, 7) : monthKey();
  const priorMonth = addMonths(latestMonth, -1);

  const { data: latestSummary } = useMonthSummary(latestMonth);
  const { data: priorSummary } = useMonthSummary(priorMonth);

  const latestIsComplete =
    latestSummary?.lastTxnDay != null && latestSummary.lastTxnDay >= daysInCalendarMonth(latestMonth);

  const referenceMonth = latestIsComplete ? latestMonth : priorMonth;
  const referenceSummary = latestIsComplete ? latestSummary : priorSummary;

  return {
    referenceMonth,
    referenceMonthLabel: monthLabel(referenceMonth),
    referenceIsComplete: !!latestIsComplete || !!priorSummary, // prior month is always treated as complete once it's the reference — it precedes the only partial month
    referenceSummary,
  };
}

export function useInsightCards() {
  const { referenceMonth, referenceMonthLabel, referenceIsComplete, referenceSummary } = useReferenceMonth();
  const cats = useCategories();

  const seriesQ = useQuery({ queryKey: ['insights', 'recurringSeries'], queryFn: listRecurringSeries });
  const candidatesQ = useQuery({
    queryKey: ['insights', 'recurringCandidates'],
    queryFn: listRecurringCandidateTxns,
    staleTime: 5 * 60_000,
  });

  const wantBubbles = useMemo(() => {
    if (!referenceSummary) return [];
    return buildFrequencyBubbles(referenceSummary, cats.all).filter((b) => {
      const cat = cats.all.find((c) => c.slug === b.slug && c.direction === 'debit');
      return cat?.bucket === 'want';
    });
  }, [referenceSummary, cats.all]);

  const cards = useMemo(() => {
    if (!seriesQ.data || !candidatesQ.data || !referenceSummary) return null;
    return buildInsightCards({
      series: seriesQ.data,
      candidates: candidatesQ.data,
      categories: cats.all,
      referenceMonth,
      referenceMonthLabel,
      referenceIsComplete,
      referenceSummary,
      wantBubbles,
    }).sort((a, b) => a.tier - b.tier || (b.annualCents ?? 0) - (a.annualCents ?? 0));
  }, [seriesQ.data, candidatesQ.data, cats.all, referenceMonth, referenceMonthLabel, referenceIsComplete, referenceSummary, wantBubbles]);

  return {
    cards,
    isLoading: seriesQ.isLoading || candidatesQ.isLoading || cats.loading || !referenceSummary,
    referenceMonthLabel,
    referenceIsComplete,
  };
}

export function useDismissRecurringSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissRecurringSeries(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights', 'recurringSeries'] }),
  });
}
