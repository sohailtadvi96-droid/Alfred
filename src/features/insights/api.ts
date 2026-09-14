import type { Category, Direction } from '@/features/expenses/categories';
import type { MonthSummary } from '@/features/expenses/types';
import type { CategoryBarDatum, FrequencyBubbleDatum } from './types';

/** person_transactions: partly worked by the Phase 3a resolution queue,
 *  not fully. Whatever's still sitting under this slug is honestly
 *  unresolved spend, not a real category — every chart here must label it
 *  as such rather than silently presenting it alongside real categories. */
const UNRESOLVED_SLUG = 'person_transactions';

function labelFor(categories: Category[], slug: string, direction: Direction): string {
  return categories.find((c) => c.slug === slug && c.direction === direction)?.label ?? slug;
}

/** Expense bars (ranked, current month) and transfer bars (their own
 *  muted, separated set) — both reuse MonthSummary, which already excludes
 *  transfers from byCategory and reports them separately. Debit-direction
 *  only: a refund credit under the same slug is a rare, separate event
 *  that doesn't belong netted into "how much did I spend on X". */
export function buildCategoryBars(
  summary: MonthSummary,
  categories: Category[],
): { expense: CategoryBarDatum[]; transfer: CategoryBarDatum[] } {
  const expense = summary.byCategory
    .filter((c) => c.direction === 'debit' && c.count > 0)
    .map((c) => ({
      slug: c.category,
      label: labelFor(categories, c.category, c.direction),
      direction: c.direction,
      cents: c.cents,
      count: c.count,
      isTransfer: false,
      isUnresolved: c.category === UNRESOLVED_SLUG,
    }))
    .sort((a, b) => b.cents - a.cents);

  const transfer = summary.transfersByCategory
    .filter((c) => c.count > 0)
    .map((c) => ({
      slug: c.category,
      label: labelFor(categories, c.category, c.direction),
      direction: c.direction,
      cents: c.cents,
      count: c.count,
      isTransfer: true,
      isUnresolved: false,
    }))
    .sort((a, b) => b.cents - a.cents);

  return { expense, transfer };
}

/** One bubble per expense category with at least one transaction this
 *  month. Transfers excluded entirely — this chart is about spending
 *  behaviour (habit vs. decision), which a transfer isn't. */
export function buildFrequencyBubbles(summary: MonthSummary, categories: Category[]): FrequencyBubbleDatum[] {
  return summary.byCategory
    .filter((c) => c.direction === 'debit' && c.count > 0)
    .map((c) => ({
      slug: c.category,
      label: labelFor(categories, c.category, c.direction),
      count: c.count,
      avgCents: c.cents / c.count,
      totalCents: c.cents,
      isUnresolved: c.category === UNRESOLVED_SLUG,
    }));
}
