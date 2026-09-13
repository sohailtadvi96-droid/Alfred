import type { Category, CategoryBucket } from './categories';
import type { Transaction } from './types';

export interface BucketTotal {
  bucket: CategoryBucket | 'unbucketed';
  cents: number;
  count: number;
}

/** Need/want/obligation/invest split for expense-kind spend, computed from
 *  a transaction list already fetched (transaction_flows-backed — no new
 *  query). Income and transfers are excluded by flow_kind, not by bucket.
 *  A null-bucket expense category (a low-confidence catch-all, or
 *  person_transactions until Phase 3 resolves it) lands in an explicit
 *  'unbucketed' segment rather than being dropped or guessed into 'need'. */
export function buildBucketSummary(txns: Transaction[] | undefined, categories: Category[]): BucketTotal[] {
  const bucketByKey = new Map<string, CategoryBucket | null>();
  for (const c of categories) bucketByKey.set(`${c.direction}:${c.slug}`, c.bucket);

  const totals = new Map<CategoryBucket | 'unbucketed', { cents: number; count: number }>();
  for (const t of txns ?? []) {
    if (t.flow_kind !== 'expense') continue;
    const bucket = bucketByKey.get(`${t.direction}:${t.category}`) ?? null;
    const key = bucket ?? 'unbucketed';
    const e = totals.get(key) ?? { cents: 0, count: 0 };
    e.cents += t.amount_cents;
    e.count += 1;
    totals.set(key, e);
  }

  return [...totals.entries()]
    .map(([bucket, v]) => ({ bucket, cents: v.cents, count: v.count }))
    .sort((a, b) => b.cents - a.cents);
}
