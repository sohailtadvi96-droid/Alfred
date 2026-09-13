import type { Transaction } from './types';

export interface BurnSeries {
  /** cumulative expense cents through day i+1 (index 0 = day 1); length = lastDay */
  cumulative: number[];
  /** last day-of-month that actually has a transaction; 0 if none */
  lastDay: number;
}

/** Cumulative daily EXPENSE total for one month's transaction list, clipped
 *  to the last day that actually has a transaction. Never padded flat to
 *  day 31 — that would misrepresent "no data since the 5th" as "spent
 *  nothing since the 5th". Transfers are excluded: flow_kind must be
 *  'expense', not just direction === 'debit'. */
export function buildBurnSeries(txns: Transaction[] | undefined): BurnSeries {
  const daily = new Array(31).fill(0) as number[];
  let lastDay = 0;
  for (const t of txns ?? []) {
    if (t.flow_kind !== 'expense') continue;
    const day = new Date(t.occurred_at).getDate();
    if (day < 1 || day > 31) continue;
    daily[day - 1] += t.amount_cents;
    if (day > lastDay) lastDay = day;
  }
  const cumulative: number[] = [];
  let running = 0;
  for (let i = 0; i < lastDay; i++) {
    running += daily[i];
    cumulative.push(running);
  }
  return { cumulative, lastDay };
}
