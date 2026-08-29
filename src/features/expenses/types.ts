import type { Direction } from './categories';

export interface Transaction {
  id: string;
  occurred_at: string;
  amount_cents: number;
  currency: string;
  direction: Direction;
  merchant_raw: string | null;
  merchant_normalized: string | null;
  category: string;
  account_id: string | null;
  source_type: 'gmail' | 'statement' | 'aa' | 'sms' | 'manual';
  source_ref: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  name: string;
  type: string | null;
  last4: string | null;
  opening_balance_cents: number;
  created_at: string;
}

export interface AccountBalance {
  account_id: string;
  name: string;
  type: string | null;
  last4: string | null;
  opening_balance_cents: number;
  balance_cents: number;
}

export interface CategoryRule {
  id: string;
  user_id: string | null;
  match_type: 'contains' | 'equals' | 'regex';
  pattern: string;
  direction: Direction;
  category: string;
  priority: number;
  created_at: string;
}

export interface NewTransaction {
  occurred_at: string;
  amount_cents: number;
  direction: Direction;
  merchant_raw: string;
  category: string;
  account_id: string | null;
  note: string | null;
}

export interface CategoryTotal {
  category: string;
  direction: Direction;
  cents: number;
  count: number;
}

export interface MonthSummary {
  month: string;
  spendCents: number;
  incomeCents: number;
  prevSpendCents: number;
  byCategory: CategoryTotal[];
  count: number;
}
