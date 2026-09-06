import type { Direction } from './categories';

export type DateFormat = 'auto' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY';

/** A normalized transaction ready for ingest_transactions('statement', …). */
export interface NormalizedRow {
  occurred_at: string;
  amount_cents: number;
  currency: 'INR';
  direction: Direction;
  merchant_raw: string;
  external_ref: string;
  raw_snippet: string;
}

export interface ParseResult {
  ok: NormalizedRow[];
  skipped: number;
  /** raw text of the rows/lines that couldn't be read — shown in the dialog */
  skippedRows: string[];
}

/** Intermediate row produced by the CSV or PDF parser before ref/dedup keys. */
export interface RawEntry {
  date: Date;
  cents: number;
  direction: Direction;
  desc: string;
  /** running balance after this txn, when the statement shows one */
  balanceCents: number | null;
  raw: string;
}

// ---------- shared value parsing ----------

export function toCents(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/(?:₹|inr|rs\.?)/gi, '').replace(/[,\s]/g, '').trim();
  cleaned = cleaned.replace(/^\((.*)\)$/, '-$1'); // (1,234.00) -> -1234.00
  cleaned = cleaned.replace(/(cr|dr)$/i, ''); // trailing Cr / Dr marker
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.abs(n) * 100);
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseDate(raw: string, fmt: DateFormat = 'auto'): Date | null {
  const s = raw.trim();
  if (!s) return null;

  if (fmt === 'YYYY-MM-DD' || (fmt === 'auto' && /^\d{4}-\d{2}-\d{2}/.test(s))) {
    const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
    return isNaN(+d) ? null : d;
  }

  // 12/03/2025, 12-03-25, 12.03.2025
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const [, a, b, y] = dmy;
    let year = Number(y);
    if (year < 100) year += 2000;
    const first = Number(a);
    const second = Number(b);
    const [day, month] = fmt === 'MM/DD/YYYY' ? [second, first] : [first, second];
    const d = new Date(year, month - 1, day, 12);
    return isNaN(+d) ? null : d;
  }

  // 12-Mar-2025, 12 Mar 25, 12-MARCH-2025
  const dMon = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})/);
  if (dMon) {
    const [, dd, mon, yy] = dMon;
    const m = MONTHS[mon.slice(0, 3).toLowerCase()];
    if (m === undefined) return null;
    let year = Number(yy);
    if (year < 100) year += 2000;
    const d = new Date(year, m, Number(dd), 12);
    return isNaN(+d) ? null : d;
  }

  const fallback = new Date(s);
  return isNaN(+fallback) ? null : fallback;
}

export function normDesc(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .slice(0, 60);
}

const TXN_PREFIX =
  /^(?:upi|pos|neft|imps|rtgs|ach|atm|inf|tfr|mmt|bil|ecs|nach|vps|ift|chq|clg|by|to|dc|ac|pcd|vin)\b[\s:/-]*/i;
const NOISE_SEG =
  /^(?:dr|cr|upi|pos|neft|imps|rtgs|ach|nach|p2a|p2m|payment|paytm|pytm|razorpay|billdesk|yesb|hdfc|icic|sbin|utib|kkbk|barb|p1|ybl|okaxis|okhdfcbank|apl|ptys|ptm|null)$/i;

/** Pull a usable merchant name out of a noisy bank narration so categorisation
 *  rules ("contains swiggy") and "always this merchant as X" actually match. */
export function cleanMerchant(input: string): string {
  let s = (input || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';

  if (s.includes('/')) {
    const segs = s
      .split('/')
      .map((x) => x.trim())
      .filter(
        (x) => x.length >= 3 && !/^\d+$/.test(x) && !/\S+@\S+/.test(x) && !NOISE_SEG.test(x),
      );
    if (segs.length) s = segs.sort((a, b) => b.length - a.length)[0];
  }

  s = s.replace(TXN_PREFIX, '');
  s = s.replace(/\S+@\S+/g, ' '); // VPAs
  s = s.replace(/\b\d{5,}\b/g, ' '); // refs / card / account numbers
  s = s.replace(/\b(?:ref|txn|rrn|utr|no|id)[:.\s-]*[a-z0-9]+\b/gi, ' ');
  s = s.replace(/[*_|]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/[\s-]*\b(?:in|india|ltd|pvt|limited|the)\b\.?$/i, '').trim();
  s = s.replace(/^[-\s]+|[-\s]+$/g, '');

  return s.length >= 3 ? s : input.trim();
}

export function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/** Attach stable dedup refs. Key uses the running balance when present (rock
 *  solid — a balance can't repeat for the same date+amount+direction unless it's
 *  the same txn); otherwise falls back to a normalized description. A per-file
 *  counter disambiguates genuine same-day / same-amount pairs, and is stable
 *  because statements are chronological. */
export function finalizeRows(entries: RawEntry[]): ParseResult {
  const ok: NormalizedRow[] = [];
  const seen = new Map<string, number>();

  for (const e of entries) {
    const merchant = cleanMerchant(e.desc);
    const day = e.date.toISOString().slice(0, 10);
    const anchor =
      e.balanceCents != null
        ? `${day}|${e.cents}|${e.direction}|b${e.balanceCents}`
        : `${day}|${e.cents}|${e.direction}|${normDesc(merchant)}`;
    const key = djb2(anchor);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);

    ok.push({
      occurred_at: e.date.toISOString(),
      amount_cents: e.cents,
      currency: 'INR',
      direction: e.direction,
      merchant_raw: merchant,
      external_ref: `${key}#${n}`,
      raw_snippet: e.raw.slice(0, 500),
    });
  }

  return { ok, skipped: 0, skippedRows: [] };
}
