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
  isSystem: boolean;
  isOverride: boolean;
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

/** Used while the categories query is loading or if it fails / before migration 0007. */
export const FALLBACK_CATEGORIES: Category[] = [
  { slug: 'online_shopping', label: 'Online shopping', direction: 'debit', color: '#7E97AB', sort: 10, isSystem: true, isOverride: false },
  { slug: 'dineout', label: 'Dineout', direction: 'debit', color: '#BC6250', sort: 20, isSystem: true, isOverride: false },
  { slug: 'grocery', label: 'Grocery', direction: 'debit', color: '#8D9E79', sort: 30, isSystem: true, isOverride: false },
  { slug: 'alcohol', label: 'Alcohol', direction: 'debit', color: '#93839F', sort: 40, isSystem: true, isOverride: false },
  { slug: 'person', label: 'Person', direction: 'debit', color: '#BF8B84', sort: 50, isSystem: true, isOverride: false },
  { slug: 'ticket_booking', label: 'Ticket booking', direction: 'debit', color: '#D6994F', sort: 60, isSystem: true, isOverride: false },
  { slug: 'misc', label: 'Misc', direction: 'debit', color: '#6E8CA8', sort: 70, isSystem: true, isOverride: false },
  { slug: 'person', label: 'Person', direction: 'credit', color: '#BF8B84', sort: 10, isSystem: true, isOverride: false },
  { slug: 'refund', label: 'Refund', direction: 'credit', color: '#6E9B5F', sort: 20, isSystem: true, isOverride: false },
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
    };
    if (!map.has(key) || r.user_id != null) map.set(key, cat);
  }
  return [...map.values()].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
}
