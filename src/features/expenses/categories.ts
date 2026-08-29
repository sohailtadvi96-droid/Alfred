export type Direction = 'debit' | 'credit';

export interface CategoryDef {
  id: string;
  label: string;
  direction: Direction;
}

export const DEBIT_CATEGORIES: CategoryDef[] = [
  { id: 'online_shopping', label: 'Online shopping', direction: 'debit' },
  { id: 'dineout', label: 'Dineout', direction: 'debit' },
  { id: 'grocery', label: 'Grocery', direction: 'debit' },
  { id: 'alcohol', label: 'Alcohol', direction: 'debit' },
  { id: 'person', label: 'Person', direction: 'debit' },
  { id: 'ticket_booking', label: 'Ticket booking', direction: 'debit' },
  { id: 'misc', label: 'Misc', direction: 'debit' },
];

export const CREDIT_CATEGORIES: CategoryDef[] = [
  { id: 'person', label: 'Person', direction: 'credit' },
  { id: 'refund', label: 'Refund', direction: 'credit' },
];

export const ALL_CATEGORIES = [...DEBIT_CATEGORIES, ...CREDIT_CATEGORIES];

export function categoriesFor(direction: Direction): CategoryDef[] {
  return direction === 'credit' ? CREDIT_CATEGORIES : DEBIT_CATEGORIES;
}

export function categoryLabel(id: string): string {
  return ALL_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export const ACCOUNT_TYPES = ['bank', 'credit', 'cash', 'wallet'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
