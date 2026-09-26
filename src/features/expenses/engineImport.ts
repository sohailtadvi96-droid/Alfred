/**
 * Task 2 — bridge the ICICI parser to the categorisation engine and produce
 * rows for `ingest_transactions('statement', …)`.
 *
 * All of this runs in the browser: the statement file is parsed on-device, the
 * engine runs on-device, only the resulting rows go to Supabase. `categorize.ts`
 * stays pure; the DR/CR ↔ debit/credit and name ↔ slug translation lives in
 * `taxonomy.ts`.
 */

import { categorise, type Lists } from './categorize';
import type { IciciTxn } from './icici';
import { djb2, normDesc, parseDate, type NormalizedRow, type ParseResult } from './statement';
import type { RawCategoryRow } from './categories';
import { fromDR, slugForCategory } from './taxonomy';

/** NormalizedRow plus the engine's parsed + classified fields, which
 *  `ingest_transactions` (migration 0013) persists onto the transaction. */
export interface EngineRow extends NormalizedRow {
  merchant_normalized: string;
  category: string; // slug
  channel: string;
  counterparty: string;
  vpa: string;
  remark: string;
  matched_by: string;
  confidence: string;
}

export interface EngineParseResult extends Omit<ParseResult, 'ok'> {
  ok: EngineRow[];
}

/** Cheap structural check — is this the ICICI "OpTransactionHistory" layout? */
export function isIciciStatement(lines: string[]): boolean {
  let header = false;
  let account = false;
  for (const l of lines) {
    if (l.includes('Transaction Withdrawal Deposit Balance')) header = true;
    if (/Statement of Transactions in Saving Account/i.test(l)) account = true;
    if (header && account) return true;
  }
  return false;
}

/**
 * Run the engine over parsed rows and shape them for ingest. Dedup ref keys on
 * (date, amount, direction, balance, narration) with a per-file counter for
 * genuine same-day/same-amount repeats — statements are chronological, so the
 * counter is stable across overlapping re-imports.
 */
export function buildEngineRows(txns: IciciTxn[], lists: Lists): EngineParseResult {
  const ok: EngineRow[] = [];
  const skippedRows: string[] = [];
  const seen = new Map<string, number>();

  for (const t of txns) {
    const date = parseDate(t.date);
    if (!date || !(t.amount > 0)) {
      skippedRows.push(`#${t.sno} ${t.date} ${t.amount} — ${t.narration}`.slice(0, 200));
      continue;
    }

    const c = categorise(t, lists);
    const cents = Math.round(t.amount * 100);
    const direction = fromDR(t.direction);
    const day = date.toISOString().slice(0, 10);

    const anchor = `${day}|${cents}|${direction}|b${Math.round(t.balance * 100)}|${normDesc(t.narration)}`;
    const key = djb2(anchor);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);

    ok.push({
      occurred_at: date.toISOString(),
      amount_cents: cents,
      currency: 'INR',
      direction,
      merchant_raw: c.merchant,
      merchant_normalized: c.merchant.toLowerCase(),
      category: slugForCategory(c.category),
      channel: c.channel,
      counterparty: c.counterparty,
      vpa: c.vpa,
      remark: c.remark,
      matched_by: c.matchedBy,
      confidence: c.confidence,
      external_ref: `${key}#${n}`,
      raw_snippet: t.narration.slice(0, 500),
    });
  }

  return { ok, skipped: skippedRows.length, skippedRows };
}

/** Re-run the engine over already-stored rows (client-side re-categorise-all). */
export interface StoredTxn {
  id: string;
  direction: 'debit' | 'credit';
  amount_cents: number;
  raw_snippet: string | null;
  category: string | null;
  confidence: string | null;
  matched_by: string | null;
  counterparty: string | null;
  vpa_prefix: string | null;
  remark: string | null;
  channel: string | null;
}
export interface RecategoriseUpdate {
  id: string;
  category: string;
  channel: string;
  counterparty: string;
  vpa_prefix: string;
  remark: string;
  matched_by: string;
  confidence: string;
  /** The category differs from the stored one. False = a refresh: category kept,
   *  but confidence / matched_by / counterparty / … had drifted from the engine. */
  categoryChanged: boolean;
}

/** An entity_keys row joined to its entity's default_category. */
export interface EntityKeyCategoryRow {
  key_type: string;
  key_value: string;
  ambiguity_state: string;
  default_category: string | null;
}

/** Key states allowed to drive categorisation. `needs_review` is an unresolved
 *  collision (the key may belong to more than one payee) and `separated` is a
 *  tombstone — neither may pick a category. Allow-list, so a state added later
 *  is excluded until someone decides it belongs here. */
const CATEGORISING_STATES = new Set(['unknown', 'same_entity']);

/** categories rows → the slugs a credit must not land in (Lists.expenseCategories).
 *
 *  Mirrors how transaction_flows derives flow_kind for a CREDIT: it joins the
 *  category on (slug, direction = 'credit') and takes `user row kind, else
 *  system row kind` (a null user kind falls back to the system row, not to a
 *  direction default). A slug with no credit-side row falls back to 'income'
 *  in the view, so it is not in the set. */
export function buildExpenseCategories(rows: RawCategoryRow[]): Set<string> {
  const kinds = new Map<string, { user: string | null; system: string | null }>();
  for (const r of rows) {
    if (r.direction !== 'credit') continue;
    const k = kinds.get(r.slug) ?? { user: null, system: null };
    if (r.user_id != null) k.user = r.kind;
    else k.system = r.kind;
    kinds.set(r.slug, k);
  }
  return new Set([...kinds].filter(([, k]) => (k.user ?? k.system) === 'expense').map(([slug]) => slug));
}

/** entity_keys → the two lookup maps classify() reads (see Lists). */
export function buildEntityCategoryMaps(rows: EntityKeyCategoryRow[]): Pick<Lists, 'entityCategoryByVpa' | 'entityCategoryByName'> {
  const entityCategoryByVpa = new Map<string, string>();
  const entityCategoryByName = new Map<string, string>();
  for (const r of rows) {
    if (!r.default_category || !r.key_value || !CATEGORISING_STATES.has(r.ambiguity_state)) continue;
    if (r.key_type === 'vpa_prefix') entityCategoryByVpa.set(r.key_value, r.default_category);
    else if (r.key_type === 'merchant_name' || r.key_type === 'counterparty')
      entityCategoryByName.set(r.key_value.toUpperCase(), r.default_category);
  }
  return { entityCategoryByVpa, entityCategoryByName };
}

export function recategoriseStored(rows: StoredTxn[], lists: Lists): RecategoriseUpdate[] {
  const out: RecategoriseUpdate[] = [];
  for (const r of rows) {
    const narration = r.raw_snippet ?? '';
    if (!narration) continue;
    const c = categorise(
      {
        date: '',
        amount: r.amount_cents / 100,
        balance: 0,
        direction: r.direction === 'credit' ? 'CR' : 'DR',
        narration,
      },
      lists,
    );
    const u: RecategoriseUpdate = {
      id: r.id,
      category: slugForCategory(c.category),
      channel: c.channel,
      counterparty: c.counterparty,
      vpa_prefix: c.vpa,
      remark: c.remark,
      matched_by: c.matchedBy,
      confidence: c.confidence,
      categoryChanged: false,
    };
    // Skip only a row already holding the engine's full current answer. Comparing
    // category alone left a pin that confirmed a row's existing category as a
    // no-op: confidence/matched_by never updated, so the row stayed in the review
    // queue forever while its key (now pinned) was excluded from AI candidates.
    // DB null and the engine's '' both mean "none".
    const same = (a: string | null, b: string) => (a ?? '') === b;
    u.categoryChanged = !same(r.category, u.category);
    if (
      same(r.category, u.category) &&
      same(r.confidence, u.confidence) &&
      same(r.matched_by, u.matched_by) &&
      same(r.channel, u.channel) &&
      same(r.counterparty, u.counterparty) &&
      same(r.vpa_prefix, u.vpa_prefix) &&
      same(r.remark, u.remark)
    )
      continue;
    out.push(u);
  }
  return out;
}
