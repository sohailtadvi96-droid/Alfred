import type { Goal, PaceStatus } from './types';

const CURRENCY_UNITS = new Set(['₹', 'rs', 'rs.', 'inr', 'rupee', 'rupees']);

function isCurrencyUnit(unit: string | null): boolean {
  return !!unit && CURRENCY_UNITS.has(unit.trim().toLowerCase());
}

function formatCurrency(n: number): string {
  // sign goes in front of the symbol ("−₹3,372", not "₹-3,372") -- a
  // savings_target's net can be negative
  const abs = new Intl.NumberFormat('en-IN', { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(Math.abs(n));
  return `${n < 0 ? '−' : ''}₹${abs}`;
}

/** Whole rupees, sign-aware -- for prose ("₹2,140", "−₹3,372"), where paise are noise. */
export function formatRupees(n: number): string {
  return formatCurrency(Math.round(n));
}

function formatPlain(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** A single amount, unit-aware — a currency unit (₹, Rs, INR…) gets Indian
 *  grouping and a ₹ prefix instead of a trailing unit label. */
export function formatAmount(n: number, unit: string | null): string {
  if (isCurrencyUnit(unit)) return formatCurrency(n);
  return unit ? `${formatPlain(n)} ${unit}` : formatPlain(n);
}

/** "8 / 12 books" / "₹2,50,000 / ₹10,00,000" — the raw fraction a goal row/
 *  tile always pairs with any percentage, per the "never a bare percentage"
 *  rule. Not meaningful for streak goals — callers show current/best streak
 *  instead. */
export function fractionLabel(goal: Goal, actual: number): string {
  const target = goal.type === 'milestone' ? (goal.milestones?.length ?? goal.target) : goal.target;
  if (isCurrencyUnit(goal.unit)) {
    return `${formatAmount(actual, goal.unit)} / ${formatAmount(target, goal.unit)}`;
  }
  return `${formatAmount(actual, null)} / ${formatAmount(target, goal.unit)}`;
}

const PACE_STATUS_LABEL: Record<PaceStatus, string> = {
  ahead: 'Ahead',
  'on-track': 'On track',
  behind: 'Behind',
  'at-risk': 'At risk',
  'no-deadline': 'No deadline',
};

/** Shared between GoalRow (module page) and goalsToSnapshot (Home rollup)
 *  so the two surfaces never drift on wording. */
export function paceStatusLabel(status: PaceStatus): string {
  return PACE_STATUS_LABEL[status];
}
