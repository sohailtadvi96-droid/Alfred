export type Direction = 'debit' | 'credit';

export const ACCOUNT_TYPES = ['bank', 'credit', 'cash', 'wallet'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
/** account types that have a card number */
export const ACCOUNT_TYPES_WITH_LAST4: readonly AccountType[] = ['bank', 'credit'];

export const DEFAULT_CATEGORY_COLOR = '#8D9E79';

export interface Category {
  slug: string;
  label: string;
  direction: Direction;
  color: string;
  sort: number;
  /** the resolved row's is_system flag (false once a user row shadows it) */
  isSystem: boolean;
  /** a user-owned row exists for this slug + direction */
  isOverride: boolean;
  /** a system default row exists for this slug + direction */
  hasSystemDefault: boolean;
}

export interface RawCategoryRow {
  slug: string;
  label: string;
  direction: Direction;
  color: string;
  sort: number;
  is_system: boolean;
  user_id: string | null;
}

const sys = (
  slug: string,
  label: string,
  direction: Direction,
  color: string,
  sort: number,
): Category => ({ slug, label, direction, color, sort, isSystem: true, isOverride: false, hasSystemDefault: true });

/** Shown only while the categories query is loading or if it fails. Mirrors the
 *  engine taxonomy seeded in migration 0013. */
export const FALLBACK_CATEGORIES: Category[] = [
  sys('rent_household', 'Rent & Household', 'debit', '#BC6250', 10),
  sys('dineout_stays', 'Dineout & Stays', 'debit', '#C86B54', 11),
  sys('food_delivery', 'Food Delivery', 'debit', '#D6994F', 12),
  sys('grocery', 'Grocery', 'debit', '#8D9E79', 13),
  sys('alcohol', 'Alcohol', 'debit', '#93839F', 14),
  sys('my_ferrari', 'My Ferrari', 'debit', '#B5524A', 15),
  sys('daily_spends', 'Daily Spends', 'debit', '#7E97AB', 16),
  sys('local_merchant', 'Local Merchant', 'debit', '#BF8B84', 17),
  sys('cab_transport', 'Cab & Transport', 'debit', '#6E8CA8', 18),
  sys('ticket_booking', 'Ticket Booking', 'debit', '#D99A5B', 19),
  sys('online_shopping', 'Online Shopping', 'debit', '#7E97AB', 20),
  sys('subscriptions', 'Subscriptions', 'debit', '#93839F', 21),
  sys('work_software', 'Work & Software', 'debit', '#6E9B5F', 22),
  sys('bills_recharge', 'Bills & Recharge', 'debit', '#C08E5A', 23),
  sys('health_personal', 'Health & Personal', 'debit', '#A9736B', 24),
  sys('entertainment', 'Entertainment', 'debit', '#9683A8', 25),
  sys('fuel', 'Fuel', 'debit', '#C08E5A', 26),
  sys('bank_charges', 'Bank Charges', 'debit', '#8195A6', 27),
  sys('cash_withdrawal', 'Cash Withdrawal', 'debit', '#8195A6', 40),
  sys('family', 'Family', 'debit', '#BF8B84', 41),
  sys('person_transactions', 'Person Transactions', 'debit', '#B98A86', 42),
  sys('uncategorised', 'Uncategorised', 'debit', '#6E6656', 99),
  sys('salary', 'Salary', 'credit', '#6E9B5F', 1),
  sys('income', 'Income', 'credit', '#6E9B5F', 2),
  sys('money_received', 'Money Received', 'credit', '#7FA86B', 3),
  sys('family', 'Family', 'credit', '#BF8B84', 41),
  sys('uncategorised', 'Uncategorised', 'credit', '#6E6656', 99),
];

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'category'
  );
}

/** Fold system + user rows into one list; a user row shadows a system row. */
export function resolveCategories(rows: RawCategoryRow[]): Category[] {
  if (!rows.length) return FALLBACK_CATEGORIES;

  const systemKeys = new Set<string>();
  for (const r of rows) if (r.user_id == null) systemKeys.add(`${r.direction}:${r.slug}`);

  const map = new Map<string, Category>();
  for (const r of rows) {
    const key = `${r.direction}:${r.slug}`;
    const cat: Category = {
      slug: r.slug,
      label: r.label,
      direction: r.direction,
      color: r.color,
      sort: r.sort,
      isSystem: r.is_system,
      isOverride: r.user_id != null,
      hasSystemDefault: systemKeys.has(key),
    };
    if (!map.has(key) || r.user_id != null) map.set(key, cat);
  }
  return [...map.values()].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
}
