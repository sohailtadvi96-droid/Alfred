import type { Direction } from './categories';

export interface Transaction {
  id: string;
  occurred_at: string;
  amount_cents: number;
  currency: string;
  direction: Direction;
  merchant_display: string | null;
  merchant_normalized: string | null;
  category: string;
  account_id: string | null;
  source_type: 'gmail' | 'statement' | 'aa' | 'sms' | 'manual';
  source_ref: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  // engine fields (migration 0013) — null on pre-engine rows
  channel: string | null;
  counterparty: string | null;
  vpa_prefix: string | null;
  remark: string | null;
  matched_by: string | null;
  confidence: string | null;
  // transaction_flows (0018) — present when read from that view, which is
  // now every read path; kept optional so ad-hoc `transactions` selects
  // (that don't request these) still satisfy the type.
  flow_kind?: 'expense' | 'income' | 'transfer';
  excluded_from_spend?: boolean;
}

/** A VPA tagged Family or Ferrari shop: a vpa_prefix key of an entity flagged
 *  is_family / is_ferrari. (The legacy `people` / `ferrari_shops` rows this
 *  replaced are no longer read — see api.ts.) */
export interface TaggedVpa {
  /** the entity_keys row id */
  id: string;
  vpa: string;
  /** the owning entity's display name */
  display_name: string | null;
  /** when the entity was created (ISO) */
  added: string;
}

/** A counterparty seen in transactions, aggregated by VPA — feeds the
 *  "tag someone not yet on the list" search. */
export interface Counterparty {
  vpa: string;
  name: string;
  txnCount: number;
  netCents: number; // credits − debits
}

/** A row in the review queue — engine-classified, low/medium confidence. */
export interface ReviewTxn {
  id: string;
  occurred_at: string;
  direction: Direction;
  amount_cents: number;
  category: string;
  merchant_display: string | null;
  counterparty: string | null;
  vpa_prefix: string | null;
  confidence: string | null;
  matched_by: string | null;
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
  merchant_display: string;
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
  transfersCents: number;
  transfersCount: number;
  prevSpendCents: number;
  /** day-of-month of the last transaction IN THIS MONTH (not today's date);
   *  null when the month has no transactions at all. Feeds day-matched
   *  period comparisons — see src/lib/periodComparison.ts. */
  lastTxnDay: number | null;
  byCategory: CategoryTotal[];
  /** per-category breakdown of excluded_from_spend rows (cash withdrawal,
   *  self-transfer, credit card payment...) — byCategory excludes these
   *  entirely, so a chart wanting to show transfers as their own muted
   *  bars (not folded into one aggregate) needs this separately. */
  transfersByCategory: CategoryTotal[];
  count: number;
}
