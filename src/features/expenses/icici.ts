/**
 * ICICI "OpTransactionHistory" PDF → structured rows.
 *
 * Input is the visual-line array from `extractPdfLines()` (pdf.ts). This module
 * is pure: no pdfjs, no browser APIs, no Supabase. It only turns lines into
 * `IciciTxn[]`, which the import flow then feeds to `categorise()`.
 *
 * The format is a wrapped fixed-width table, 119 pages. Rules that took a while
 * to pin down (see 04a-BUILD-BRIEF.md):
 *
 *  1. A transaction STARTS at a line: `<S.No> <dd.mm.yyyy> … <amount> <balance>`.
 *     The last two decimal numbers after the date are amount and balance.
 *  2. Narration is the lines AFTER the number-line. A ~10-char short-name line
 *     also appears BEFORE the number-line — it is a truncated duplicate, ignored.
 *  3. The last narration line of block N is block N+1's short name. Drop it.
 *  4. Wrapped lines join with a SPACE when the first ends alphanumeric and the
 *     second starts alphanumeric, otherwise with nothing.
 *  5. Page furniture (headers, footers, page numbers, the trailing legend) is
 *     stripped.
 *  6. Direction is not printed. Derive it from the running balance:
 *     balance rose → CR, else DR. Row 1 needs an opening balance to seed this.
 */

import type { RawTxn } from './categorize';

export interface IciciTxn extends RawTxn {
  sno: number;
}

export interface IciciParseResult {
  txns: IciciTxn[];
  warnings: string[];
}

const NUMBER_LINE = /^(\d{1,4})\s+(\d{2}\.\d{2}\.\d{4})\s+(.+)$/;
const MONEY = /\d[\d,]*\.\d{2}/g;

const FURNITURE_EXACT = new Set([
  'Transaction Withdrawal Deposit Balance',
  'S No. Cheque Number Transaction Remarks',
  'Date Amount (INR) Amount (INR) (INR)',
]);
const FURNITURE_PREFIX = [
  'www.icici.bank.in',
  'Please call from your registered mobile number',
  'Never share your OTP',
];
const PAGE_HEADER = 'Transaction Withdrawal Deposit Balance';

/** Everything from here down is the closing legend block, not narration. */
function tailIndex(lines: string[]): number {
  return lines.findIndex(
    (l) =>
      l === 'Sincerly,' ||
      l === 'Team ICICI Bank' ||
      l.startsWith('This is a system generated statement') ||
      l.startsWith('Legends for transactions'),
  );
}

function stripFurniture(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (FURNITURE_EXACT.has(l)) continue;
    if (FURNITURE_PREFIX.some((p) => l.startsWith(p))) continue;
    // a bare page number, but only where it actually precedes a page header
    if (/^\d{1,3}$/.test(l) && lines[i + 1] === PAGE_HEADER) continue;
    out.push(l);
  }
  return out;
}

/** Rule 4: join wrapped narration lines. */
function joinWrapped(parts: string[]): string {
  let out = '';
  for (const part of parts) {
    if (!out) {
      out = part;
      continue;
    }
    const a = out[out.length - 1];
    const b = part[0];
    const glue = /[a-z0-9]/i.test(a) && /[a-z0-9]/i.test(b) ? ' ' : '';
    out += glue + part;
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ICICI prints a generic type tag (not a counterparty) before non-UPI rows. */
const LABEL_TAG = /^(VISA|Credit|Debit|ATM|POS|NEFT|IMPS|RTGS|Card|Cheque) trxn$/i;

interface Mark {
  sno: number;
  date: string;
  amount: number;
  balance: number;
  at: number; // index into the stripped-line array
}

export function parseIciciStatement(
  rawLines: string[],
  opts: { openingBalance?: number } = {},
): IciciParseResult {
  const warnings: string[] = [];

  let lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const tail = tailIndex(lines);
  if (tail >= 0) lines = lines.slice(0, tail);
  else warnings.push('closing legend block not found — tail may not be trimmed');

  lines = stripFurniture(lines);

  // 1 — locate every number-line, in strict S.No order
  const marks: Mark[] = [];
  let expected = 1;
  for (let i = 0; i < lines.length; i++) {
    const m = NUMBER_LINE.exec(lines[i]);
    if (!m) continue;
    const sno = Number(m[1]);
    if (sno !== expected) continue; // a hash fragment that happens to look numeric
    const money = m[3].match(MONEY);
    if (!money || money.length < 2) continue;
    marks.push({
      sno,
      date: m[2],
      amount: Number(money[money.length - 2].replace(/,/g, '')),
      balance: Number(money[money.length - 1].replace(/,/g, '')),
      at: i,
    });
    expected++;
  }

  if (!marks.length) {
    warnings.push('no transactions found');
    return { txns: [], warnings };
  }

  // 2 — narration + direction
  const txns: IciciTxn[] = [];
  let prevBalance = opts.openingBalance ?? null;

  for (let k = 0; k < marks.length; k++) {
    const mark = marks[k];
    const end = k + 1 < marks.length ? marks[k + 1].at : lines.length;
    let body = lines.slice(mark.at + 1, end);

    // rule 3 — the final line here is the next block's short name
    if (k + 1 < marks.length && body.length > 1) {
      const shortName = body[body.length - 1];
      body = body.slice(0, -1);
      const nextBody = lines.slice(marks[k + 1].at + 1);
      const head = (nextBody[0] ?? '').replace(/^[A-Z]{2,4}\//, '');
      const confirmed =
        LABEL_TAG.test(shortName) ||
        head.toLowerCase().includes(shortName.toLowerCase().slice(0, 6));
      if (shortName && !confirmed) {
        warnings.push(`row ${mark.sno}: dropped short-name "${shortName}" not confirmed in next block`);
      }
    }

    const narration = joinWrapped(body);

    let direction: 'DR' | 'CR';
    if (prevBalance == null) {
      direction = mark.balance >= mark.amount ? 'CR' : 'DR';
      warnings.push('row 1 direction guessed — no opening balance supplied');
    } else {
      direction = mark.balance > prevBalance ? 'CR' : 'DR';
    }
    prevBalance = mark.balance;

    txns.push({
      sno: mark.sno,
      date: mark.date,
      amount: mark.amount,
      balance: mark.balance,
      direction,
      narration,
    });
  }

  const gaps: number[] = [];
  for (let i = 0; i < txns.length; i++) if (txns[i].sno !== i + 1) gaps.push(txns[i].sno);
  if (gaps.length) warnings.push(`S.No sequence has gaps near: ${gaps.slice(0, 5).join(', ')}`);

  return { txns, warnings };
}

/**
 * Walk the parsed rows applying signed amounts from `openingBalance`; return the
 * S.Nos where the computed running balance diverges from the printed one.
 * ICICI itself posts the odd pair out of order (rows 141–142 in the 6-month
 * fixture) — the ledger self-heals a row or two later.
 */
export function reconcile(
  txns: IciciTxn[],
  openingBalance: number,
): { sno: number; expected: number; printed: number }[] {
  const breaks: { sno: number; expected: number; printed: number }[] = [];
  let running = openingBalance;
  for (const t of txns) {
    running = round2(running + (t.direction === 'CR' ? t.amount : -t.amount));
    if (Math.abs(running - t.balance) > 0.001) {
      breaks.push({ sno: t.sno, expected: running, printed: t.balance });
    }
  }
  return breaks;
}
