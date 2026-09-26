import { FALLBACK_CATEGORIES } from '@/features/expenses/categories';
import { formatRupees } from './format';
import type { PlanLine, PlanSubscription, SavingsPlan } from './types';

/** Everything here is presentation logic over the savings_plan jsonb -- no
 *  I/O, no React -- so SavingsPlan.tsx stays a layout and the wording rules
 *  live in one place. */

// ---------- headline ----------

export type PlanHeadline =
  | { kind: 'insufficient_history'; netSoFar: number }
  | { kind: 'on_track'; projectedMonthEnd: number; target: number }
  | { kind: 'closable'; projectedGap: number; projectedMonthEnd: number; target: number }
  | {
      kind: 'infeasible';
      projectedGap: number;
      recoverable: number;
      shortfall: number;
      /** where the month lands with every cut taken: target - shortfall */
      achievable: number;
      target: number;
    };

export function headlineOf(plan: SavingsPlan): PlanHeadline {
  if (plan.feasibility === 'insufficient_history') {
    return { kind: 'insufficient_history', netSoFar: plan.meter_to_date };
  }
  const { projected_gap: projectedGap, projected_month_end: projectedMonthEnd } = plan.projection;
  if (plan.already_on_track) return { kind: 'on_track', projectedMonthEnd, target: plan.target };
  if (plan.feasibility === 'infeasible') {
    const shortfall = plan.shortfall ?? Math.max(0, projectedGap - plan.pool.recoverable_total);
    return {
      kind: 'infeasible',
      projectedGap,
      recoverable: plan.pool.recoverable_total,
      shortfall,
      achievable: plan.target - shortfall,
      target: plan.target,
    };
  }
  return { kind: 'closable', projectedGap, projectedMonthEnd, target: plan.target };
}

// ---------- lines ----------

/** The pooled person_transactions line is deliberately not a category in the
 *  usual sense: small (< ₹1,000) person-to-person payments, all payees together. */
export function lineLabel(line: PlanLine): string {
  if (line.category === 'person_transactions') return 'Small person-to-person payments';
  const known = FALLBACK_CATEGORIES.find((c) => c.slug === line.category && c.direction === 'debit');
  if (known) return known.label;
  const words = line.category.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What one transaction in this line is *called* to the person who made it. */
const NOUN: Record<string, string> = {
  dineout_stays: 'visit',
  food_delivery: 'order',
  online_shopping: 'order',
  subscriptions: 'charge',
  ticket_booking: 'booking',
  person_transactions: 'payment',
};

function noun(category: string, count: number): string {
  const base = NOUN[category] ?? 'purchase';
  return Math.abs(count - 1) < 0.05 ? base : `${base}s`;
}

/** 122 -> "122", 8.7 -> "8.7", 4 -> "4": whole numbers from 10 up, one decimal below. */
function count(n: number): string {
  if (n >= 10) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

/** "8 visits/mo", or "1 booking every 3 months" when it happens less than monthly. */
function perPeriod(category: string, perMonth: number): string {
  if (perMonth >= 1) return `${count(perMonth)} ${noun(category, perMonth)}/mo`;
  const perQuarter = perMonth * 3;
  return `${count(perQuarter)} ${noun(category, perQuarter)} every 3 months`;
}

export interface CutAdvice {
  /** the behaviour, phrased as something to do */
  behaviour: string;
  /** secondary: what the cut is worth */
  amount: string;
}

/** Spend that is a handful of fixed recurring charges rather than a habit:
 *  "cut to 7.6 charges" is meaningless there, so it gets no count/ticket
 *  phrasing -- just the amount, and a pointer to the list. */
const NEAR_FIXED = new Set(['subscriptions']);

/** A single lever (fewer, or smaller) has to shrink the spend by exactly
 *  cut / avg_last3. Up to 40% that is something a person can actually do --
 *  4 visits instead of 7, a bill a third smaller. Past it, one lever alone
 *  reads as an order nobody can follow, so the cut is split across both. */
export const DEEP_CUT_RATIO = 0.4;

/** Splitting a count only means something if there is a count to split:
 *  under this many a month, the lever phrasing stays as it is. */
const COMBINE_MIN_PER_MONTH = 2;

/** A line's suggested_cut, turned into something behavioural. The month's
 *  spend goes from avg_last3 to avg_last3 - suggested_cut (never below the
 *  line's floor, so it is a spend this person has actually hit), and the
 *  phrasing depends on how deep that is:
 *    - near-fixed spend           -> the amount only, no count/ticket
 *    - the whole line goes        -> "skip it"
 *    - up to DEEP_CUT_RATIO       -> one lever, the line's own `lever`
 *                                    (frequency, or ticket_size)
 *    - deeper                     -> both levers at once, split evenly in
 *                                    proportion (each side falls by
 *                                    1 - sqrt(remaining share)), so neither
 *                                    reads as implausible on its own. */
export function describeCut(line: PlanLine): CutAdvice {
  const amount = `saves about ${formatRupees(line.suggested_cut)} a month`;
  const newSpend = Math.max(0, line.avg_last3 - line.suggested_cut);
  const perMonth = line.txns_per_month;
  const ticket = line.avg_ticket;

  if (NEAR_FIXED.has(line.category)) {
    return {
      behaviour: `Hold this near ${formatRupees(newSpend)} a month (now ${formatRupees(line.avg_last3)}) — the list below is where to look.`,
      amount,
    };
  }

  // no usable count/ticket to reason with -- say the money plainly
  if (ticket == null || ticket <= 0 || perMonth <= 0) {
    return { behaviour: `Spend about ${formatRupees(newSpend)} a month here instead of ${formatRupees(line.avg_last3)}.`, amount };
  }

  // the whole line goes: nothing to phrase but "skip it"
  if (newSpend < ticket * 0.5) {
    return {
      behaviour: `Skip it — ${perPeriod(line.category, perMonth)} × ${formatRupees(ticket)} → none.`,
      amount,
    };
  }

  const cutRatio = line.avg_last3 > 0 ? line.suggested_cut / line.avg_last3 : 0;

  if (cutRatio > DEEP_CUT_RATIO && perMonth >= COMBINE_MIN_PER_MONTH) {
    const share = newSpend / line.avg_last3; // what is left, 0..1
    // whole visits/orders, then the ticket that lands the month on newSpend
    const newCount = Math.max(1, Math.round(perMonth * Math.sqrt(share)));
    if (newCount < Math.round(perMonth)) {
      const newTicket = newSpend / newCount;
      return {
        behaviour: `${perPeriod(line.category, perMonth)} × ${formatRupees(ticket)} → about ${perPeriod(line.category, newCount)} × ${formatRupees(newTicket)}.`,
        amount,
      };
    }
    // rounding left the count where it was -- fall through to the single-lever wording
  }

  if (line.lever === 'frequency') {
    const newCount = newSpend / ticket;
    // a cut too small to change the (rounded) count: say so via the ticket instead
    if (perPeriod(line.category, newCount) !== perPeriod(line.category, perMonth)) {
      return {
        behaviour: `${perPeriod(line.category, perMonth)} × ${formatRupees(ticket)} → cut to ${perPeriod(line.category, newCount)}.`,
        amount,
      };
    }
  }

  const newTicket = newSpend / perMonth;
  return {
    behaviour: `Keep the count (${perPeriod(line.category, perMonth)}), drop the average from ${formatRupees(ticket)} to ${formatRupees(newTicket)}.`,
    amount,
  };
}

// ---------- how solid is the floor? ----------

export type EvidenceTier = 'zero-floor' | 'thin' | 'solid';

/** Below this many complete months a floor is one bad/good month away from
 *  being something else. Today the ledger has 5, so every line reads 'thin'. */
export const SOLID_DATA_POINTS = 6;

export interface Evidence {
  tier: EvidenceTier;
  /** short badge text */
  badge: string;
  /** the one-sentence honest reading */
  note: string;
}

export function evidenceOf(line: PlanLine): Evidence {
  const months = `${line.data_points} month${line.data_points === 1 ? '' : 's'}`;
  if (line.floor <= 0) {
    return {
      tier: 'zero-floor',
      badge: 'weakest evidence',
      note: `Floor ₹0 — built on a month you spent nothing here, out of ${months}. Cutting to zero once doesn't mean it's easy every month.`,
    };
  }
  if (line.data_points < SOLID_DATA_POINTS) {
    return {
      tier: 'thin',
      badge: 'thin',
      note: `Floor ${formatRupees(line.floor)} is your lowest of only ${months}.`,
    };
  }
  return {
    tier: 'solid',
    badge: months,
    note: `Floor ${formatRupees(line.floor)} is your lowest of ${months}.`,
  };
}

export function trendNote(line: PlanLine): string | null {
  const { direction, delta_pct: pct } = line.trend;
  if (!direction) return null;
  if (direction === 'flat') return 'steady lately';
  const word = direction === 'up' ? 'rising' : 'falling';
  return pct != null ? `${word} lately (${pct > 0 ? '+' : '−'}${Math.abs(pct)}%)` : `${word} lately`;
}

/** Lines the packing actually asked something of, ranked; and the rest, kept
 *  visible but out of the way so a partial plan doesn't look complete. */
export function splitLines(lines: PlanLine[]): { cuts: PlanLine[]; heldBack: PlanLine[] } {
  const ranked = lines.slice().sort((a, b) => a.rank - b.rank);
  return {
    cuts: ranked.filter((l) => l.suggested_cut >= 0.5),
    heldBack: ranked.filter((l) => l.suggested_cut < 0.5),
  };
}

// ---------- subscriptions ----------

/** recurring_series.match_key is the bank's truncated, lower-cased merchant name. */
export function subscriptionName(s: PlanSubscription): string {
  return s.match_key.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function cadenceWords(days: number): string {
  if (days >= 28 && days <= 32) return 'monthly';
  if (days >= 6 && days <= 8) return 'weekly';
  if (days >= 88 && days <= 94) return 'quarterly';
  if (days >= 360 && days <= 370) return 'yearly';
  return `every ~${days} days`;
}
