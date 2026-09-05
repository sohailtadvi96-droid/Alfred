import Papa from 'papaparse';
import type { Direction } from './categories';
import {
  finalizeRows,
  parseDate,
  toCents,
  type DateFormat,
  type ParseResult,
  type RawEntry,
} from './statement';

export type { DateFormat, ParseResult, NormalizedRow } from './statement';

export interface CsvColumnMap {
  date: string;
  description: string;
  debit: string;
  credit: string;
  amount: string;
  balance: string;
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
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
  balance: /(balance|closing bal|running bal|available bal)/i,
};

export function guessColumnMap(headers: string[]): CsvColumnMap {
  const find = (rx: RegExp) => headers.find((h) => rx.test(h)) ?? NONE;
  return {
    date: find(RX.date),
    description: find(RX.description),
    debit: find(RX.debit),
    credit: find(RX.credit),
    amount: find(RX.amount),
    balance: find(RX.balance),
  };
}

/** Map parsed CSV rows to normalized transactions using the column map. */
export function mapRows(parsed: ParsedCsv, map: CsvColumnMap, dateFmt: DateFormat): ParseResult {
  const entries: RawEntry[] = [];
  const skippedRows: string[] = [];

  for (const row of parsed.rows) {
    const date = parseDate(map.date ? (row[map.date] ?? '') : '', dateFmt);
    const desc = (map.description ? row[map.description] : '')?.trim() ?? '';
    const balanceCents = map.balance ? toCents(row[map.balance] ?? '') : null;

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
      const signed = /^-|^\(/.test(rawAmt.trim()) || /dr$/i.test(rawAmt.trim());
      const c = toCents(rawAmt);
      if (c && c > 0) {
        cents = c;
        direction = signed ? 'debit' : 'credit';
      }
    }

    if (!date || !direction || !cents) {
      const raw = Object.values(row).join(' | ').trim();
      if (raw) skippedRows.push(raw.slice(0, 200));
      continue;
    }

    entries.push({
      date,
      cents,
      direction,
      desc,
      balanceCents,
      raw: Object.values(row).join(' | '),
    });
  }

  const res = finalizeRows(entries);
  return { ok: res.ok, skipped: skippedRows.length, skippedRows };
}
