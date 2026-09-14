import { useMemo } from 'react';
import { useCategories, useMonthSummary } from '@/features/expenses/hooks';
import { buildCategoryBars, buildFrequencyBubbles } from './api';

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
