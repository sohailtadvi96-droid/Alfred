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
}
export interface RecategoriseUpdate {
  id: string;
  category: string;
  channel: string;
  counterparty: string;
  vpa: string;
  remark: string;
  matched_by: string;
  confidence: string;
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
    const slug = slugForCategory(c.category);
    if (slug === r.category) continue;
    out.push({
      id: r.id,
      category: slug,
      channel: c.channel,
      counterparty: c.counterparty,
      vpa: c.vpa,
      remark: c.remark,
      matched_by: c.matchedBy,
      confidence: c.confidence,
    });
  }
  return out;
}
