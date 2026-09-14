import { supabase } from '@/lib/supabase';
import type { Category, Direction } from '@/features/expenses/categories';
import type { MonthSummary } from '@/features/expenses/types';
import type { CategoryBarDatum, FrequencyBubbleDatum, RecurringSeries } from './types';

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

// ---------- recurring series (Phase 7) ----------

export async function listRecurringSeries(): Promise<RecurringSeries[]> {
  const { data, error } = await supabase
    .from('recurring_series')
    .select(
      'id,entity_id,match_key,category,median_cents,interval_days,occurrence_count,first_seen,last_seen,next_expected,status',
    )
    .order('median_cents', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    entityId: r.entity_id as string | null,
    matchKey: r.match_key as string,
    category: r.category as string | null,
    medianCents: r.median_cents as number,
    intervalDays: r.interval_days as number,
    occurrenceCount: r.occurrence_count as number,
    firstSeen: r.first_seen as string,
    lastSeen: r.last_seen as string,
    nextExpected: r.next_expected as string | null,
    status: r.status as RecurringSeries['status'],
  }));
}

/** "Dismiss" a card — reuses the existing cancelled status (already
 *  proven, in conversation, to survive detect_recurring_series() re-runs
 *  without resurrecting). No new schema needed. */
export async function dismissRecurringSeries(id: string): Promise<void> {
  const { error } = await supabase.from('recurring_series').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw error;
}

export interface RecurringCandidateTxn {
  occurred_at: string;
  amount_cents: number;
  merchant_normalized: string | null;
  vpa_prefix: string | null;
}

/** Every debit/expense transaction, for deriving a series' most recent
 *  actual charge amount (recurring_series stores only the median across
 *  the whole series, not each occurrence) — one bulk fetch, computed
 *  client-side, same pattern as burnSeries/bucketSummary rather than a
 *  query per series. */
export async function listRecurringCandidateTxns(): Promise<{
  txns: RecurringCandidateTxn[];
  entityByVpaPrefix: Map<string, string>;
}> {
  const [txnsRes, keysRes] = await Promise.all([
    supabase
      .from('transaction_flows')
      .select('occurred_at,amount_cents,merchant_normalized,vpa_prefix')
      .eq('direction', 'debit')
      .eq('flow_kind', 'expense'),
    supabase.from('entity_keys').select('key_value,entity_id').eq('key_type', 'vpa_prefix'),
  ]);
  if (txnsRes.error) throw txnsRes.error;
  if (keysRes.error) throw keysRes.error;

  const entityByVpaPrefix = new Map<string, string>();
  for (const k of keysRes.data ?? []) {
    if (k.entity_id) entityByVpaPrefix.set(k.key_value as string, k.entity_id as string);
  }
  return { txns: (txnsRes.data ?? []) as RecurringCandidateTxn[], entityByVpaPrefix };
}
