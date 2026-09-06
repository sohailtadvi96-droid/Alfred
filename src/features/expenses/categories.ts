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
  /** migration 0014: retired slug, kept for resolution but hidden from the picker */
  archived?: boolean;
}

const sys = (
  slug: string,
  label: string,
  direction: Direction,
  color: string,
  sort: number,
): Category => ({ slug, label, direction, color, sort, isSystem: true, isOverride: false, hasSystemDefault: true });

/** Used while the categories query is loading or if it fails / before migration 0007. */
export const FALLBACK_CATEGORIES: Category[] = [
  sys('online_shopping', 'Online shopping', 'debit', '#7E97AB', 10),
  sys('dineout', 'Dineout', 'debit', '#BC6250', 20),
  sys('grocery', 'Grocery', 'debit', '#8D9E79', 30),
  sys('alcohol', 'Alcohol', 'debit', '#93839F', 40),
  sys('person', 'Person', 'debit', '#BF8B84', 50),
  sys('ticket_booking', 'Ticket booking', 'debit', '#D6994F', 60),
  sys('misc', 'Misc', 'debit', '#6E8CA8', 70),
  sys('person', 'Person', 'credit', '#BF8B84', 10),
  sys('refund', 'Refund', 'credit', '#6E9B5F', 20),
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
export function resolveCategories(allRows: RawCategoryRow[]): Category[] {
  if (!allRows.length) return FALLBACK_CATEGORIES;

  const rows = allRows.filter((r) => !r.archived);

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
