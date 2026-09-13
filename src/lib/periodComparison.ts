/** Day-matched period comparisons — pulled out of Expenses' dashboard
 *  (Phase 4) so Home's Board tile can share the exact same rules instead
 *  of re-deriving them and drifting, which is how Home ended up comparing
 *  a partial current month against a complete prior month while Expenses
 *  compared the same days on both sides.
 *
 *  Pure date/number logic only — no Supabase, no React. Callers fetch
 *  their own current/prior totals (however their data source works) and
 *  hand them to summarizeComparison(). */

export interface DayMatchedWindow {
  currentFrom: string; // YYYY-MM-DD, inclusive
  currentTo: string;
  priorFrom: string;
  priorTo: string;
  /** the prior window's actual end day, after clamping */
  priorToDay: number;
  /** true if the prior month is shorter than lastTxnDay and had to be clamped */
  clamped: boolean;
}

/** Days 1..lastTxnDay of `month` vs the same day-span in the prior month.
 *  `lastTxnDay` must be the day-of-month of the last transaction IN THE
 *  VIEWED PERIOD — never today's date, or a partial current month reads as
 *  a collapse against a complete prior one. Clamps to the prior month's
 *  actual length when it's shorter (e.g. 31 Mar vs Feb). */
export function dayMatchedWindow(month: string, lastTxnDay: number): DayMatchedWindow {
  const [y, m] = month.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');

  const currentFrom = `${month}-01`;
  const currentTo = `${month}-${pad(lastTxnDay)}`;

  const priorFirst = new Date(y, m - 2, 1); // m is 1-based; -1 more for "prior month"
  const priorYear = priorFirst.getFullYear();
  const priorMonthNum = priorFirst.getMonth() + 1;
  const priorDaysInMonth = new Date(priorYear, priorMonthNum, 0).getDate();
  const priorToDay = Math.min(lastTxnDay, priorDaysInMonth);

  return {
    currentFrom,
    currentTo,
    priorFrom: `${priorYear}-${pad(priorMonthNum)}-01`,
    priorTo: `${priorYear}-${pad(priorMonthNum)}-${pad(priorToDay)}`,
    priorToDay,
    clamped: lastTxnDay > priorDaysInMonth,
  };
}

export interface ComparisonResult {
  currentCents: number;
  /** null = no prior-period data at all — callers should show nothing,
   *  not a bogus 0% or Infinity% */
  priorCents: number | null;
  /** null when priorCents is null OR exactly zero — don't divide by zero;
   *  callers should show the absolute currentCents instead */
  pct: number | null;
}

/** Turns two period totals into a display-ready comparison. Centralizes
 *  the two edge cases so every screen that shows this handles them the
 *  same way: no prior data at all (hide it) vs. a prior total of zero
 *  (show the absolute figure, don't divide). */
export function summarizeComparison(currentCents: number, priorCents: number | null): ComparisonResult {
  if (priorCents == null) return { currentCents, priorCents: null, pct: null };
  if (priorCents === 0) return { currentCents, priorCents, pct: null };
  return {
    currentCents,
    priorCents,
    pct: Math.round(((currentCents - priorCents) / priorCents) * 100),
  };
}

/** Day-of-month of the latest entry in a list of ISO timestamps, or null
 *  if the list is empty — the shared way to derive "N" for the window
 *  above from whatever period's rows a caller already has in hand. */
export function lastDayOfMonthFrom(occurredAtValues: Iterable<string>): number | null {
  let max = 0;
  for (const iso of occurredAtValues) {
    const d = new Date(iso).getDate();
    if (d > max) max = d;
  }
  return max > 0 ? max : null;
}
