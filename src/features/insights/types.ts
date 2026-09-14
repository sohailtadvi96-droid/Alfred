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
