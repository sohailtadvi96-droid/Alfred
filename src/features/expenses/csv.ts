import Papa from 'papaparse';
import type { Direction } from './categories';

export interface CsvColumnMap {
  date: string;
  description: string;
  debit: string;
  credit: string;
  amount: string;
}

export type DateFormat = 'auto' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY';

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export interface NormalizedRow {
  occurred_at: string;
  amount_cents: number;
  currency: 'INR';
  direction: Direction;
  merchant_raw: string;
  external_ref: string;
  raw_snippet: string;
}

export interface MapResult {
  ok: NormalizedRow[];
  skipped: number;
}

const NONE = '';

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (res) => resolve({ headers: (res.meta.fields ?? []).filter(Boolean), rows: res.data }),
      error: (err) => reject(err),
    });
  });
}

const RX = {
  date: /(^|\b)(date|txn date|value date|transaction date|posting date)\b/i,
  description: /(narration|description|particulars|details|remarks|transaction remarks|payee)/i,
  debit: /(debit|withdrawal|withdrawal amt|dr\b|paid out|money out|amount debited)/i,
  credit: /(credit|deposit|deposit amt|cr\b|paid in|money in|amount credited)/i,
  amount: /(^amount$|amount \(inr\)|transaction amount|txn amount)/i,
};

/** Best-guess column mapping from the CSV headers. */
export function guessColumnMap(headers: string[]): CsvColumnMap {
  const find = (rx: RegExp) => headers.find((h) => rx.test(h)) ?? NONE;
  return {
    date: find(RX.date),
    description: find(RX.description),
    debit: find(RX.debit),
    credit: find(RX.credit),
    amount: find(RX.amount),
  };
}

function toCents(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.abs(n) * 100);
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseDate(raw: string, fmt: DateFormat): Date | null {
  const s = raw.trim();
  if (!s) return null;

  if (fmt === 'YYYY-MM-DD' || (fmt === 'auto' && /^\d{4}-\d{2}-\d{2}/.test(s))) {
    const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
    return isNaN(+d) ? null : d;
  }

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const [, a, b, y] = dmy;
    let year = Number(y);
    if (year < 100) year += 2000;
    const first = Number(a);
    const second = Number(b);
    // DD/MM/YYYY and 'auto' default to day-first (India); MM/DD/YYYY flips
    const [day, month] = fmt === 'MM/DD/YYYY' ? [second, first] : [first, second];
    const d = new Date(year, month - 1, day, 12);
    return isNaN(+d) ? null : d;
  }

  const dMon = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{2,4})/);
  if (dMon) {
    const [, dd, mon, yy] = dMon;
    const m = MONTHS[mon.toLowerCase()];
    if (m === undefined) return null;
    let year = Number(yy);
    if (year < 100) year += 2000;
    const d = new Date(year, m, Number(dd), 12);
    return isNaN(+d) ? null : d;
  }

  const fallback = new Date(s);
  return isNaN(+fallback) ? null : fallback;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/** Map parsed CSV rows to normalized transactions using the column map. */
export function mapRows(
  parsed: ParsedCsv,
  map: CsvColumnMap,
  dateFmt: DateFormat,
): MapResult {
  const ok: NormalizedRow[] = [];
  let skipped = 0;
  const seen = new Map<string, number>();

  for (const row of parsed.rows) {
    const dateRaw = map.date ? row[map.date] : '';
    const date = parseDate(dateRaw ?? '', dateFmt);
    const desc = (map.description ? row[map.description] : '')?.trim() ?? '';

    let direction: Direction | null = null;
    let cents: number | null = null;

    const debitC = map.debit ? toCents(row[map.debit] ?? '') : null;
    const creditC = map.credit ? toCents(row[map.credit] ?? '') : null;

    if (debitC && debitC > 0) {
      direction = 'debit';
      cents = debitC;
    } else if (creditC && creditC > 0) {
      direction = 'credit';
      cents = creditC;
    } else if (map.amount) {
      const rawAmt = row[map.amount] ?? '';
      const signed = /^-|^\(/.test(rawAmt.trim());
      const c = toCents(rawAmt);
      if (c && c > 0) {
        cents = c;
        direction = signed ? 'debit' : 'credit';
      }
    }

    if (!date || !direction || !cents) {
      skipped++;
      continue;
    }

    const key = hash(`${date.toISOString().slice(0, 10)}|${cents}|${direction}|${desc}`);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);

    ok.push({
      occurred_at: date.toISOString(),
      amount_cents: cents,
      currency: 'INR',
      direction,
      merchant_raw: desc,
      external_ref: `${key}#${n}`,
      raw_snippet: Object.values(row).join(' | ').slice(0, 500),
    });
  }

  return { ok, skipped };
}
