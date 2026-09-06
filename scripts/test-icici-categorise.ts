/**
 * Task 2 checkpoint — run the engine over the parsed fixture and reproduce the
 * category totals from 04a-BUILD-BRIEF.md / 01-YOUR-CHECKLIST.md.
 *
 *   node scripts/test-icici-categorise.ts
 *
 * Hard asserts (YOUR-CHECKLIST.md):
 *   - exactly 1 "Card — Unclassified"
 *   - exactly 0 "Uncategorised"
 *   - My Ferrari = ₹7,310 across 270 entries
 * Reported for eyeballing:
 *   - total spend / debit count       (target ₹7,10,855 · 1,613)
 *   - total inflow                    (target ₹7,05,548)
 *   - full per-category breakdown vs the brief's table
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPdfLines } from './extract-pdf.ts';
import { seedLists } from './seeds.ts';
import { parseIciciStatement } from '../src/features/expenses/icici.ts';
import { categorise } from '../src/features/expenses/categorize.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(root, 'fixtures/OpTransactionHistory06-09-2026.pdf');

const INR = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

const BRIEF_TABLE: Record<string, [number, number]> = {
  'Person Transactions': [279397, 648],
  'Dineout & Stays': [127128, 38],
  'Rent & Household': [56732, 4],
  'Local Merchant': [31679, 29],
  'Food Delivery': [31423, 59],
  'Cash Withdrawal': [27000, 5],
  'Daily Spends': [24036, 333],
  Family: [23815, 29],
  Grocery: [23486, 66],
  'Online Shopping': [17527, 6],
  Alcohol: [14041, 14],
  'Cab & Transport': [10738, 43],
  'Work & Software': [9927, 5],
  Subscriptions: [8850, 42],
  'My Ferrari': [7310, 270],
};
const INFLOW_CATS = new Set(['Salary', 'Income', 'Money Received']);

let failures = 0;
const check = (cond: boolean, msg: string) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) failures++;
};

async function main() {
  const lines = await extractPdfLines(PDF);
  const { txns, warnings } = parseIciciStatement(lines);
  console.log(`parsed ${txns.length} transactions\n`);

  const lists = seedLists();
  const sum = new Map<string, number>();
  const count = new Map<string, number>();
  const matchedBy = new Map<string, number>();
  let ferrariSum = 0;
  let ferrariCount = 0;

  for (const t of txns) {
    const c = categorise(t, lists);
    sum.set(c.category, (sum.get(c.category) ?? 0) + t.amount);
    count.set(c.category, (count.get(c.category) ?? 0) + 1);
    matchedBy.set(c.matchedBy, (matchedBy.get(c.matchedBy) ?? 0) + 1);
    if (c.category === 'My Ferrari') {
      ferrariSum += t.amount;
      ferrariCount++;
    }
  }

  console.log('— category breakdown (engine │ brief target) —');
  const cats = [...sum.keys()].sort((a, b) => (sum.get(b) ?? 0) - (sum.get(a) ?? 0));
  for (const cat of cats) {
    const s = sum.get(cat) ?? 0;
    const n = count.get(cat) ?? 0;
    const target = BRIEF_TABLE[cat];
    const tgt = target ? `   │ ${INR(target[0])} · ${target[1]}` : '';
    const off = target && (Math.abs(s - target[0]) > 1 || n !== target[1]) ? '   ⚠' : '';
    console.log(`  ${cat.padEnd(22)} ${INR(s).padStart(11)} · ${String(n).padStart(4)}${tgt}${off}`);
  }

  let spendSum = 0;
  let spendCount = 0;
  let inflowSum = 0;
  for (const [cat, s] of sum) {
    if (INFLOW_CATS.has(cat)) inflowSum += s;
    else {
      spendSum += s;
      spendCount += count.get(cat) ?? 0;
    }
  }

  console.log('\n— headline —');
  console.log(`  total spend   ${INR(spendSum)} · ${spendCount} debits   (target ₹7,10,855 · 1,613)`);
  console.log(`  total inflow  ${INR(inflowSum)}                  (target ₹7,05,548)`);

  console.log('\n— hard checks —');
  check((count.get('Card — Unclassified') ?? 0) === 1, `Card — Unclassified = 1 (got ${count.get('Card — Unclassified') ?? 0})`);
  check((count.get('Uncategorised') ?? 0) === 0, `Uncategorised = 0 (got ${count.get('Uncategorised') ?? 0})`);
  check(
    Math.round(ferrariSum) === 7310 && ferrariCount === 270,
    `My Ferrari = ₹7,310 · 270 (got ${INR(ferrariSum)} · ${ferrariCount})`,
  );

  console.log('\n— matched_by mix —');
  for (const [k, v] of [...matchedBy.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(10)} ${v}`);
  }

  if (warnings.length) {
    const distinct = new Set(warnings.map((w) => w.replace(/\d+/g, '#')));
    console.log(`\n  parser warnings: ${warnings.length} (${distinct.size} distinct)`);
  }

  console.log(failures === 0 ? '\nPASS (hard checks)' : `\nFAIL — ${failures} hard check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
