import type { Result } from './categorize';

/** The engine (categorize.ts) is stack-neutral and speaks "DR"/"CR" and
 *  human category names. ALFRED stores `debit`/`credit` and category *slugs*.
 *  This module is the only boundary that translates — the engine stays pure. */

export type AlfredDirection = 'debit' | 'credit';

export const toDR = (d: AlfredDirection): 'DR' | 'CR' => (d === 'credit' ? 'CR' : 'DR');
export const fromDR = (d: 'DR' | 'CR'): AlfredDirection => (d === 'CR' ? 'credit' : 'debit');

/** engine category name -> ALFRED slug (categories.slug) */
export const ENGINE_CATEGORY_SLUG: Record<string, string> = {
  Salary: 'salary',
  Income: 'income',
  'Money Received': 'money_received',
  'Rent & Household': 'rent_household',
  'Dineout & Stays': 'dineout_stays',
  'Food Delivery': 'food_delivery',
  Grocery: 'grocery',
  Alcohol: 'alcohol',
  'My Ferrari': 'my_ferrari',
  'Daily Spends': 'daily_spends',
  'Local Merchant': 'local_merchant',
  'Cab & Transport': 'cab_transport',
  'Ticket Booking': 'ticket_booking',
  'Online Shopping': 'online_shopping',
  Subscriptions: 'subscriptions',
  'Work & Software': 'work_software',
  'Bills & Recharge': 'bills_recharge',
  'Health & Personal': 'health_personal',
  Entertainment: 'entertainment',
  Fuel: 'fuel',
  'Bank Charges': 'bank_charges',
  'Cash Withdrawal': 'cash_withdrawal',
  Family: 'family',
  'Person Transactions': 'person_transactions',
  'Card — Unclassified': 'card_unclassified',
  Uncategorised: 'uncategorised',
};

/** Engine result category -> ALFRED slug. The engine's own rules emit category
 *  *names* ("Local Merchant"); a Tier-0 override (merchant_rules) emits whatever
 *  string is stored there. We store slugs in merchant_rules, so pass through
 *  anything that already looks like a slug (incl. user-created categories). */
export function slugForCategory(value: string): string {
  return ENGINE_CATEGORY_SLUG[value] ?? (/^[a-z][a-z0-9_]*$/.test(value) ? value : 'uncategorised');
}

/** Row shape the client import flow sends to ingest_transactions('statement', …). */
export interface EngineTxnRow {
  occurred_at: string;
  amount_cents: number;
  currency: 'INR';
  direction: AlfredDirection;
  external_ref: string;
  raw_snippet: string;
  // engine output
  category: string; // slug
  merchant_raw: string;
  merchant_normalized: string;
  channel: string;
  counterparty: string;
  vpa: string;
  remark: string;
  matched_by: string;
  confidence: string;
}

export function toEngineTxnRow(
  base: {
    occurred_at: string;
    amount_cents: number;
    direction: AlfredDirection;
    external_ref: string;
    raw_snippet: string;
  },
  r: Result & {
    channel: string;
    counterparty: string;
    vpa: string;
    remark: string;
  },
): EngineTxnRow {
  return {
    ...base,
    currency: 'INR',
    category: slugForCategory(r.category),
    merchant_raw: r.merchant,
    merchant_normalized: r.merchant.toLowerCase(),
    channel: r.channel,
    counterparty: r.counterparty,
    vpa: r.vpa,
    remark: r.remark,
    matched_by: r.matchedBy,
    confidence: r.confidence,
  };
}
