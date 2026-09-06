/**
 * End-to-end: PDF lines → parseIciciStatement → buildEngineRows (the exact path
 * the import dialog runs). Checks row shape, dedup-ref uniqueness + stability,
 * and that every category is a real slug.
 *
 *   node scripts/test-engine-import.ts
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPdfLines } from './extract-pdf.ts';
import { seedLists } from './seeds.ts';
import { parseIciciStatement } from '../src/features/expenses/icici.ts';
import { buildEngineRows, isIciciStatement } from '../src/features/expenses/engineImport.ts';
import { ENGINE_CATEGORY_SLUG } from '../src/features/expenses/taxonomy.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(root, 'fixtures/OpTransactionHistory06-09-2026.pdf');

const VALID_SLUGS = new Set(Object.values(ENGINE_CATEGORY_SLUG));

let failures = 0;
const check = (cond: boolean, msg: string) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) failures++;
};

async function main() {
  const lines = await extractPdfLines(PDF);
  const lists = seedLists();

  check(isIciciStatement(lines), 'isIciciStatement() recognises the fixture');

  const { txns } = parseIciciStatement(lines);
  const a = buildEngineRows(txns, lists);
  const b = buildEngineRows(parseIciciStatement(lines).txns, lists);

  check(a.ok.length === 1804, `1,804 rows built (got ${a.ok.length})`);
  check(a.skipped === 0, `0 rows skipped (got ${a.skipped})`);

  const refs = new Set(a.ok.map((r) => r.external_ref));
  check(refs.size === a.ok.length, `all external_ref unique (${refs.size}/${a.ok.length})`);

  const stable = a.ok.every((r, i) => r.external_ref === b.ok[i].external_ref);
  check(stable, 'external_ref identical on a second run (idempotent dedupe)');

  const badSlug = a.ok.find((r) => !VALID_SLUGS.has(r.category));
  check(!badSlug, `every category is a known slug${badSlug ? ` (bad: ${badSlug.category})` : ''}`);

  const shape = a.ok.every(
    (r) =>
      typeof r.occurred_at === 'string' &&
      r.amount_cents > 0 &&
      (r.direction === 'debit' || r.direction === 'credit') &&
      typeof r.matched_by === 'string' &&
      typeof r.confidence === 'string',
  );
  check(shape, 'every row has occurred_at / amount_cents / direction / matched_by / confidence');

  const credits = a.ok.filter((r) => r.direction === 'credit').length;
  console.log(`\n  ${credits} credit rows, ${a.ok.length - credits} debit rows`);
  console.log('  sample:', JSON.stringify(a.ok[0], null, 0));

  console.log(failures === 0 ? '\nPASS' : `\nFAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
