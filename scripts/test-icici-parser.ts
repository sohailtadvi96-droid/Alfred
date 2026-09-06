/**
 * Fixture test for the ICICI statement parser (Task 1).
 *
 *   node scripts/test-icici-parser.ts
 *
 * Parses fixtures/OpTransactionHistory06-09-2026.pdf and checks it against
 * fixtures/statement-categorised.csv (1,804 hand-verified rows).
 *
 * Acceptance (04a-BUILD-BRIEF.md):
 *   - exactly 1,804 records, S.No 1 → 1804 with no gaps
 *   - amount / balance / direction match the fixture on every row
 *   - the running balance reconciles on every row except 141 and 142
 *     (the bank posted those two out of order)
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Papa from 'papaparse';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseIciciStatement, reconcile } from '../src/features/expenses/icici.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(root, 'fixtures/OpTransactionHistory06-09-2026.pdf');
const CSV = path.join(root, 'fixtures/statement-categorised.csv');

/** Mirror of extractPdfLines() in src/features/expenses/pdf.ts. */
async function extractLines(file: string): Promise<string[]> {
  const data = new Uint8Array(await readFile(file));
  const doc = await getDocument({ data }).promise;
  const lines: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const items = (content.items as Array<{ str?: unknown; transform?: unknown }>)
      .filter(
        (it): it is { str: string; transform: number[] } =>
          typeof it.str === 'string' &&
          it.str.trim().length > 0 &&
          Array.isArray(it.transform) &&
          it.transform.length >= 6,
      )
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
  return lines;
}

interface FixtureRow {
  sno: number;
  date: string;
  direction: 'DR' | 'CR';
  amount: number;
  balance: number;
  raw_narration: string;
}

async function loadFixture(): Promise<FixtureRow[]> {
  const text = await readFile(CSV, 'utf8');
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return data.map((r) => ({
    sno: Number(r.sno),
    date: r.date,
    direction: r.direction as 'DR' | 'CR',
    amount: Number(r.amount),
    balance: Number(r.balance),
    raw_narration: r.raw_narration ?? '',
  }));
}

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error('  ✗ ' + msg);
};
const ok = (msg: string) => console.log('  ✓ ' + msg);

async function main() {
  const [lines, fixture] = await Promise.all([extractLines(PDF), loadFixture()]);
  console.log(`extracted ${lines.length} lines · fixture has ${fixture.length} rows\n`);

  // opening balance: the one bootstrap value the parser can't derive itself.
  // Row 1 in the fixture is a credit, so opening = balance − amount.
  const first = fixture[0];
  const openingBalance =
    first.direction === 'CR' ? first.balance - first.amount : first.balance + first.amount;

  const { txns, warnings } = parseIciciStatement(lines, { openingBalance });

  console.log('— structure —');
  if (txns.length === 1804) ok('1,804 records');
  else fail(`expected 1,804 records, got ${txns.length}`);

  const gaps = txns.filter((t, i) => t.sno !== i + 1).map((t) => t.sno);
  if (!gaps.length && txns[0]?.sno === 1 && txns.at(-1)?.sno === 1804)
    ok('S.No 1 → 1804, no gaps');
  else fail(`S.No sequence broken near: ${gaps.slice(0, 5).join(', ') || 'ends'}`);

  console.log('\n— field agreement vs fixture —');
  let amtBad = 0;
  let balBad = 0;
  let dirBad = 0;
  const dirMismatches: number[] = [];
  for (let i = 0; i < Math.min(txns.length, fixture.length); i++) {
    const a = txns[i];
    const b = fixture[i];
    if (Math.abs(a.amount - b.amount) > 0.001) amtBad++;
    if (Math.abs(a.balance - b.balance) > 0.001) balBad++;
    if (a.direction !== b.direction) {
      dirBad++;
      dirMismatches.push(b.sno);
    }
  }
  amtBad === 0 ? ok('amount matches on all rows') : fail(`amount differs on ${amtBad} rows`);
  balBad === 0 ? ok('balance matches on all rows') : fail(`balance differs on ${balBad} rows`);
  dirBad === 0
    ? ok('direction matches on all rows')
    : fail(`direction differs on ${dirBad} rows: ${dirMismatches.slice(0, 10).join(', ')}`);

  console.log('\n— running-balance reconciliation —');
  const breaks = reconcile(txns, openingBalance);
  const brokenSnos = breaks.map((x) => x.sno);
  if (brokenSnos.length === 2 && brokenSnos[0] === 141 && brokenSnos[1] === 142) {
    ok('reconciles on every row except 141, 142 (bank posted those out of order)');
  } else {
    fail(`expected divergence only at 141, 142 — got [${brokenSnos.join(', ')}]`);
    for (const x of breaks.slice(0, 12))
      console.error(`      row ${x.sno}: computed ${x.expected.toFixed(2)} vs printed ${x.printed.toFixed(2)}`);
  }

  console.log('\n— narration (informational) —');
  let narrExact = 0;
  let fixtureHasTrailingJunk = 0;
  const realDiffs: number[] = [];
  for (let i = 0; i < Math.min(txns.length, fixture.length); i++) {
    const a = txns[i].narration;
    const b = fixture[i].raw_narration;
    if (a === b) narrExact++;
    else if (b.startsWith(a)) fixtureHasTrailingJunk++; // pdftotext page-break leak in the fixture
    else realDiffs.push(fixture[i].sno);
  }
  console.log(`  ${narrExact}/${fixture.length} byte-identical`);
  console.log(
    `  ${fixtureHasTrailingJunk} where the parser output is clean and the *fixture* carries` +
      ` trailing page furniture (parser is a strict prefix)`,
  );
  console.log(`  ${realDiffs.length} genuine mismatches` + (realDiffs.length ? `: ${realDiffs.slice(0, 15).join(', ')}` : ''));
  for (const sno of realDiffs.slice(0, 5)) {
    console.log(`  · S.No ${sno}:`);
    console.log(`      parser : ${txns[sno - 1].narration}`);
    console.log(`      fixture: ${fixture[sno - 1].raw_narration}`);
  }

  if (warnings.length) {
    console.log('\n— parser warnings —');
    const seen = new Set<string>();
    for (const w of warnings) {
      const key = w.replace(/\d+/g, '#');
      if (seen.has(key)) continue;
      seen.add(key);
      console.log('  · ' + w);
    }
    console.log(`  (${warnings.length} warnings total, ${seen.size} distinct)`);
  }

  console.log(failures === 0 ? '\nPASS' : `\nFAIL — ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
