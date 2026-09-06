/**
 * Row-by-row: engine output vs the fixture CSV's own `category` / `matched_by`
 * columns (the real regression target — "tested against 1,804 real transactions").
 *
 *   node scripts/diff-icici-categorise.ts [--all] [--cat "Rent & Household"]
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { extractPdfLines } from './extract-pdf.ts';
import { seedLists } from './seeds.ts';
import { parseIciciStatement } from '../src/features/expenses/icici.ts';
import { categorise, normalize } from '../src/features/expenses/categorize.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(root, 'fixtures/OpTransactionHistory06-09-2026.pdf');
const CSV = path.join(root, 'fixtures/statement-categorised.csv');

const args = process.argv.slice(2);
const showAll = args.includes('--all');
const onlyCat = args.includes('--cat') ? args[args.indexOf('--cat') + 1] : null;

async function main() {
  const [lines, csvText] = await Promise.all([extractPdfLines(PDF), readFile(CSV, 'utf8')]);
  const { txns } = parseIciciStatement(lines);
  const { data: rows } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const lists = seedLists();

  let catMatch = 0;
  let mbMatch = 0;
  const transitions = new Map<string, number>();
  const examples = new Map<string, string[]>();

  for (let i = 0; i < txns.length; i++) {
    const t = txns[i];
    const fx = rows[i];
    const c = categorise(t, lists);

    if (c.category === fx.category) catMatch++;
    if (c.matchedBy === fx.matched_by) mbMatch++;

    if (c.category !== fx.category) {
      const key = `${fx.category}  →  ${c.category}`;
      transitions.set(key, (transitions.get(key) ?? 0) + 1);
      const f = normalize(t.narration);
      const line = `    #${fx.sno} ${t.direction} ₹${t.amount}  vpa="${f.vpa}" cp="${f.counterparty}" remark="${f.remark}"  [fx.matched_by=${fx.matched_by} → engine=${c.matchedBy}]`;
      const arr = examples.get(key) ?? [];
      if (arr.length < (showAll ? 9999 : 6)) arr.push(line);
      examples.set(key, arr);
    }
  }

  console.log(`rows: ${txns.length}`);
  console.log(`category agreement : ${catMatch}/${txns.length}  (${((100 * catMatch) / txns.length).toFixed(1)}%)`);
  console.log(`matched_by agreement: ${mbMatch}/${txns.length}  (${((100 * mbMatch) / txns.length).toFixed(1)}%)`);
  console.log(`\n— disagreements (fixture → engine) —`);

  const sorted = [...transitions.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, n] of sorted) {
    if (onlyCat && !key.startsWith(onlyCat + '  ')) continue;
    console.log(`\n  ${key}   ×${n}`);
    for (const ex of examples.get(key) ?? []) console.log(ex);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
