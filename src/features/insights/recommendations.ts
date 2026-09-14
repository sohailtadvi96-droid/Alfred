import type { Category } from '@/features/expenses/categories';
import type { MonthSummary } from '@/features/expenses/types';
import type { FrequencyBubbleDatum, InsightCard, RecurringSeries } from './types';
import type { RecurringCandidateTxn } from './api';

const ANNUAL_DAYS = 365;
/** How far above the series' own median counts as a price hike worth a
 *  card — not "first three occurrences vs now" (recurring_series doesn't
 *  retain per-occurrence history, only the aggregate median), so this
 *  compares the single most recent charge to the whole series' median
 *  instead. A real, documented simplification — flagged here and in the
 *  conversation, not silently substituted. */
const PRICE_CREEP_THRESHOLD = 1.1;
const RENEWAL_WINDOW_DAYS = 21;
/** A want-bucket category needs at least this many transactions in the
 *  reference month to be a "habit" worth a frequency card, not noise. */
const MIN_HABIT_COUNT = 5;
const TOP_HABIT_CARDS = 3;

/** Tier 1/2 are about bills and subscriptions — "lapsed" or "renewing
 *  soon" only means something for a category shaped like a recurring
 *  service. Without this, a tea-stall visit pattern that happened to stop
 *  (my_ferrari, person_transactions, daily_spends...) shows up as a
 *  "lapsed subscription" card, which it isn't — that's noise, not a leak. */
const BILL_LIKE_CATEGORIES = new Set([
  'subscriptions',
  'work_software',
  'entertainment',
  'bills_recharge',
  'bank_charges',
]);

function annualFromInterval(cents: number, intervalDays: number): number {
  return Math.round((cents * ANNUAL_DAYS) / Math.max(intervalDays, 1));
}

function groupKeyFor(entityId: string | null, merchantNormalized: string | null): string {
  return entityId ?? `merchant:${merchantNormalized ?? ''}`;
}

function latestAmountFor(
  series: RecurringSeries,
  candidates: { txns: RecurringCandidateTxn[]; entityByVpaPrefix: Map<string, string> },
): number | null {
  const key = groupKeyFor(series.entityId, series.matchKey);
  let latest: RecurringCandidateTxn | null = null;
  for (const t of candidates.txns) {
    const entityId = t.vpa_prefix ? (candidates.entityByVpaPrefix.get(t.vpa_prefix) ?? null) : null;
    const txnKey = groupKeyFor(entityId, t.merchant_normalized);
    if (txnKey !== key) continue;
    const ratio = t.amount_cents / Math.max(series.medianCents, 1);
    if (ratio < 0.75 || ratio > 1.25) continue; // same tolerance band the detector used
    if (!latest || new Date(t.occurred_at) > new Date(latest.occurred_at)) latest = t;
  }
  return latest ? latest.amount_cents : null;
}

function categoryLabel(categories: Category[], slug: string | null): string {
  if (!slug) return 'Uncategorised';
  return categories.find((c) => c.slug === slug && c.direction === 'debit')?.label ?? slug;
}

export function buildInsightCards(input: {
  series: RecurringSeries[];
  candidates: { txns: RecurringCandidateTxn[]; entityByVpaPrefix: Map<string, string> };
  categories: Category[];
  referenceMonth: string;
  referenceMonthLabel: string;
  referenceIsComplete: boolean;
  referenceSummary: MonthSummary;
  wantBubbles: FrequencyBubbleDatum[];
}): InsightCard[] {
  const { series, candidates, categories, referenceMonthLabel, referenceIsComplete, referenceSummary, wantBubbles } =
    input;
  const cards: InsightCard[] = [];
  const active = series.filter((s) => s.status !== 'cancelled');
  const billLike = active.filter((s) => s.category && BILL_LIKE_CATEGORIES.has(s.category));

  // ---------- Tier 1: zero lifestyle change ----------

  for (const s of billLike.filter((x) => x.status === 'lapsed')) {
    cards.push({
      id: `lapsed:${s.id}`,
      tier: 1,
      tierLabel: 'Zero lifestyle change',
      evidence: `${categoryLabel(categories, s.category)} charged ~${moneyLabel(s.medianCents)} every ~${s.intervalDays}d, ${s.occurrenceCount} times — last seen ${s.lastSeen}, nothing since.`,
      annualCents: annualFromInterval(s.medianCents, s.intervalDays),
      effort: 'Zero — check you’re not still billed elsewhere for this.',
      action: 'Confirm it actually stopped',
      seriesId: s.id,
    });
  }

  for (const s of billLike.filter((x) => x.status === 'active' && x.occurrenceCount >= 4)) {
    const latest = latestAmountFor(s, candidates);
    if (latest !== null && latest >= s.medianCents * PRICE_CREEP_THRESHOLD) {
      const pct = Math.round(((latest - s.medianCents) / s.medianCents) * 100);
      cards.push({
        id: `creep:${s.id}`,
        tier: 1,
        tierLabel: 'Zero lifestyle change',
        evidence: `${categoryLabel(categories, s.category)}: typically ${moneyLabel(s.medianCents)}, most recent charge ${moneyLabel(latest)} (+${pct}%).`,
        annualCents: annualFromInterval(latest - s.medianCents, s.intervalDays),
        effort: 'One look — check for a cheaper plan or promo.',
        action: 'Review pricing',
        seriesId: s.id,
      });
    }
  }

  const byCategory = new Map<string, RecurringSeries[]>();
  for (const s of billLike.filter((x) => x.status !== 'lapsed')) {
    if (!s.category) continue;
    const arr = byCategory.get(s.category) ?? [];
    arr.push(s);
    byCategory.set(s.category, arr);
  }
  for (const [cat, group] of byCategory) {
    if (group.length < 2) continue;
    const totalAnnual = group.reduce((sum, s) => sum + annualFromInterval(s.medianCents, s.intervalDays), 0);
    cards.push({
      id: `dup:${cat}`,
      tier: 1,
      tierLabel: 'Zero lifestyle change',
      evidence: `${group.length} recurring charges in ${categoryLabel(categories, cat)}: ${group.map((s) => `${s.matchKey} (${moneyLabel(s.medianCents)}/~${s.intervalDays}d)`).join(', ')}.`,
      annualCents: totalAnnual,
      effort: 'One look — check whether any overlap.',
      action: 'Compare',
    });
  }

  const bankCharges = referenceSummary.byCategory.find((c) => c.category === 'bank_charges' && c.direction === 'debit');
  if (bankCharges && bankCharges.cents > 0) {
    cards.push({
      id: 'bank-charges',
      tier: 1,
      tierLabel: 'Zero lifestyle change',
      evidence: `${bankCharges.count} bank charge${bankCharges.count === 1 ? '' : 's'} in ${referenceMonthLabel}, ${moneyLabel(bankCharges.cents)}.${referenceIsComplete ? '' : ' (partial month — see caveat)'}`,
      annualCents: referenceIsComplete ? bankCharges.cents * 12 : null,
      effort: 'Zero — call the bank, ask which fee and whether it’s waivable.',
      action: 'Ask the bank',
    });
  }

  // ---------- Tier 2: one phone call — renewals within 3 weeks ----------

  const today = new Date();
  const renewalCutoff = new Date(today.getTime() + RENEWAL_WINDOW_DAYS * 86_400_000);
  for (const s of billLike.filter((x) => x.status === 'active' && x.nextExpected)) {
    const nextDate = new Date(s.nextExpected as string);
    if (nextDate < today || nextDate > renewalCutoff) continue;
    cards.push({
      id: `renewal:${s.id}`,
      tier: 2,
      tierLabel: 'One phone call',
      evidence: `${categoryLabel(categories, s.category)} (${s.matchKey}) usually charges ${moneyLabel(s.medianCents)} around ${s.nextExpected}.`,
      annualCents: annualFromInterval(s.medianCents, s.intervalDays),
      effort: 'One call or decision, before it renews.',
      action: 'Review before renewal',
      seriesId: s.id,
    });
  }

  // ---------- Tier 3: behavioural, frequency-framed ----------

  const habits = wantBubbles
    .filter((b) => b.count >= MIN_HABIT_COUNT)
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, TOP_HABIT_CARDS);
  for (const b of habits) {
    const reduceBy = Math.max(1, Math.round(b.count * 0.2));
    const annualSaving = referenceIsComplete ? Math.round(reduceBy * b.avgCents * 12) : null;
    cards.push({
      id: `habit:${b.slug}`,
      tier: 3,
      tierLabel: 'Behavioural',
      evidence: `${b.count} ${b.label.toLowerCase()} transactions in ${referenceMonthLabel}; ${reduceBy} fewer${annualSaving !== null ? ` is ${moneyLabel(annualSaving)} a year` : ''}.${referenceIsComplete ? '' : ' (partial month — see caveat)'}`,
      annualCents: annualSaving,
      effort: 'Behavioural — no single action, just frequency.',
      action: 'Notice the pattern',
    });
  }

  // ---------- Tier 4: structural — awareness only, never a cut suggestion ----------

  const rent = active.find((s) => s.category === 'rent_household');
  if (rent && referenceSummary.incomeCents > 0) {
    const monthlyRent = annualFromInterval(rent.medianCents, rent.intervalDays) / 12;
    const pctOfIncome = Math.round((monthlyRent / referenceSummary.incomeCents) * 1000) / 10;
    cards.push({
      id: `structural:${rent.id}`,
      tier: 4,
      tierLabel: 'Structural — awareness only',
      evidence: `Rent & Household: ~${moneyLabel(rent.medianCents)} every ~${rent.intervalDays}d, ~${pctOfIncome}% of ${referenceMonthLabel} income. This category bundles rent with household help (maid/cook) via remark matching — the share shown may be composition, not a rent change.`,
      annualCents: null,
      effort: 'N/A — for awareness only, not a suggestion to cut.',
      action: 'No action — structural cost',
      // no seriesId: this card is awareness-only, not dismissible — dismissing
      // would cancel the underlying series and stop tracking rent entirely.
    });
  }

  return cards;
}

function moneyLabel(cents: number): string {
  const rupees = cents / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
