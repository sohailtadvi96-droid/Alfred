import type { Direction } from '@/features/expenses/categories';

export interface CategoryBarDatum {
  slug: string;
  label: string;
  direction: Direction;
  cents: number;
  count: number;
  /** excluded_from_spend — rendered muted, in its own section below the
   *  expense bars, never mixed in and never dropped. */
  isTransfer: boolean;
  /** person_transactions specifically — still-pending resolution-queue
   *  work, not a real spending category. Rendered as its own signal
   *  colour and labelled "Unresolved", not folded into the expense set
   *  silently. */
  isUnresolved: boolean;
}

export interface FrequencyBubbleDatum {
  slug: string;
  label: string;
  count: number;
  avgCents: number;
  totalCents: number;
  isUnresolved: boolean;
}

export interface RecurringSeries {
  id: string;
  entityId: string | null;
  matchKey: string;
  category: string | null;
  medianCents: number;
  intervalDays: number;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  nextExpected: string | null;
  status: 'active' | 'lapsed' | 'cancelled';
}

export type InsightTier = 1 | 2 | 3 | 4;

export interface InsightCard {
  id: string;
  tier: InsightTier;
  tierLabel: string;
  /** what the data shows — dates, amounts, counts. Never an instruction. */
  evidence: string;
  /** null when the card is informational only (Tier 4: "for awareness", or
   *  when the underlying month is partial and annualising would mislead) */
  annualCents: number | null;
  effort: string;
  action: string;
  /** present only for cards backed by a stored recurring_series row — lets
   *  the UI offer "dismiss" without re-deriving which row it came from */
  seriesId?: string;
}
