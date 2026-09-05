import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Direction } from './categories';
import { finalizeRows, parseDate, toCents, type ParseResult, type RawEntry } from './statement';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfExtract =
  | { ok: true; lines: string[] }
  | { ok: false; reason: 'password-required' | 'password-wrong' | 'error'; message?: string };

/** Pull text lines out of a PDF, reconstructing visual rows from item positions. */
export async function extractPdfLines(file: File, password?: string): Promise<PdfExtract> {
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    const doc = await pdfjs.getDocument({ data, password: password || undefined }).promise;
    const lines: string[] = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      const items = (content.items as unknown[])
        .filter((it): it is { str: string; transform: number[] } => {
          const o = it as { str?: unknown; transform?: unknown };
          return (
            typeof o.str === 'string' &&
            o.str.trim().length > 0 &&
            Array.isArray(o.transform) &&
            o.transform.length >= 6
          );
        })
        .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str }))
        .sort((a, b) => b.y - a.y || a.x - b.x);

      let curY: number | null = null;
      let parts: { x: number; s: string }[] = [];
      const flush = () => {
        if (!parts.length) return;
        const line = parts
          .sort((a, b) => a.x - b.x)
          .map((p2) => p2.s)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (line) lines.push(line);
        parts = [];
      };
      for (const it of items) {
        if (curY === null || Math.abs(it.y - curY) <= 3) {
          curY = curY ?? it.y;
          parts.push({ x: it.x, s: it.s });
        } else {
          flush();
          curY = it.y;
          parts.push({ x: it.x, s: it.s });
        }
      }
      flush();
    }

    return { ok: true, lines };
  } catch (e: unknown) {
    const err = e as { name?: string; code?: number; message?: string };
    if (err?.name === 'PasswordException') {
      // pdf.js: code 1 = need password, code 2 = incorrect password
      return { ok: false, reason: err.code === 2 ? 'password-wrong' : 'password-required' };
    }
    return { ok: false, reason: 'error', message: err?.message };
  }
}

// a number like 1,23,456.78 or 12345.00 optionally followed by Cr/Dr
const AMOUNT = /(-?\d[\d,]*(?:\.\d{1,2})?)(?:\s*(Cr|Dr))?/gi;
const DATE_AT_START =
  /^(\d{1,2}[-/ ](?:\d{1,2}|[A-Za-z]{3,})[-/ ]\d{2,4})/;

/** Heuristic parse of statement text lines into transactions.
 *  Expects the dominant Indian layout: `<date> <narration> <txn amt> <balance>`
 *  (only one of withdrawal/deposit is filled, so exactly two money tokens),
 *  and infers direction from the running-balance delta. Falls back to explicit
 *  Cr/Dr markers. Non-transaction lines are counted as skipped. */
export function parseStatementLines(lines: string[]): ParseResult {
  const entries: RawEntry[] = [];
  const skippedRows: string[] = [];
  let prevBalance: number | null = null;
  const skip = (line: string) => {
    if (line.trim()) skippedRows.push(line.trim().slice(0, 200));
  };

  for (const line of lines) {
    const dm = line.match(DATE_AT_START);
    if (!dm) {
      skip(line);
      continue;
    }
    const date = parseDate(dm[1]);
    if (!date) {
      skip(line);
      continue;
    }

    const rest = line.slice(dm[0].length);
    const money: { value: number; marker: string; index: number }[] = [];
    for (const m of rest.matchAll(AMOUNT)) {
      const cents = toCents(m[1] + (m[2] ?? ''));
      if (cents == null) continue;
      money.push({ value: cents, marker: (m[2] ?? '').toLowerCase(), index: m.index ?? 0 });
    }
    if (money.length === 0) {
      skip(line);
      continue;
    }

    // description = text before the first money token
    const desc = rest.slice(0, money[0].index).replace(/[|]+/g, ' ').replace(/\s+/g, ' ').trim();

    let cents: number | null = null;
    let direction: Direction | null = null;
    let balanceCents: number | null = null;

    const marked = money.find((t) => t.marker === 'cr' || t.marker === 'dr');
    if (marked) {
      cents = marked.value;
      direction = marked.marker === 'cr' ? 'credit' : 'debit';
      const after = money.filter((t) => t.index > marked.index);
      if (after.length) balanceCents = after[after.length - 1].value;
    } else if (money.length >= 2) {
      // last token = running balance, the one before it = txn amount
      balanceCents = money[money.length - 1].value;
      cents = money[money.length - 2].value;
      if (prevBalance != null) {
        direction = balanceCents < prevBalance ? 'debit' : 'credit';
      }
    } else {
      // single unmarked number — can't tell; skip
      skip(line);
      continue;
    }

    if (direction == null) {
      // first row with no prior balance and no marker — assume debit (conservative)
      direction = 'debit';
    }
    if (balanceCents != null) prevBalance = balanceCents;

    if (!cents || cents <= 0) {
      skip(line);
      continue;
    }

    entries.push({ date, cents, direction, desc, balanceCents, raw: line });
  }

  const res = finalizeRows(entries);
  return { ok: res.ok, skipped: skippedRows.length, skippedRows };
}
