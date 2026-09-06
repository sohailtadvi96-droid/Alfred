import { supabase } from '@/lib/supabase';
import { addMonths, monthRange } from '@/lib/format';
import type { Direction, RawCategoryRow } from './categories';
import type { Lists } from './categorize';
import { recategoriseStored, type RecategoriseUpdate, type StoredTxn } from './engineImport';
import type {
  Account,
  AccountBalance,
  CategoryRule,
  Counterparty,
  FerrariShop,
  MonthSummary,
  NewTransaction,
  Person,
  ReviewTxn,
  Transaction,
} from './types';

export interface TxnFilter {
  month: string;
  category?: string;
  direction?: Direction;
  accountId?: string;
}

export async function listTransactions(filter: TxnFilter): Promise<Transaction[]> {
  const { start, end } = monthRange(filter.month);
  let q = supabase
    .from('transactions')
    .select('*')
    .gte('occurred_at', start)
    .lt('occurred_at', end)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (filter.category) q = q.eq('category', filter.category);
  if (filter.direction) q = q.eq('direction', filter.direction);
  if (filter.accountId) q = q.eq('account_id', filter.accountId);

  const { data, error } = await q;
  if (error) throw error;
  return data as Transaction[];
}

export async function addTransaction(input: NewTransaction): Promise<void> {
  const { error } = await supabase.from('transactions').insert({ ...input, source_type: 'manual' });
  if (error) throw error;
}

/** Bank-statement CSV import — the `statement` ingestion adapter.
 *  rows are NormalizedRow objects from features/expenses/csv.ts.
 *  Returns the number newly inserted (duplicates are skipped server-side). */
export async function importStatementRows(
  rows: Record<string, unknown>[],
  accountId: string | null,
): Promise<number> {
  const payload = accountId ? rows.map((r) => ({ ...r, account_id: accountId })) : rows;
  const { data, error } = await supabase.rpc('ingest_transactions', {
    p_source_type: 'statement',
    p_rows: payload,
  });
  if (error) throw error;

  // record "last imported" (best effort — never fail the import over this)
  try {
    const stamp = { last_run_at: new Date().toISOString(), status: 'ok' };
    const { data: existing } = await supabase
      .from('ingestion_sources')
      .select('id')
      .eq('type', 'statement')
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      await supabase.from('ingestion_sources').update(stamp).eq('id', existing.id);
    } else {
      await supabase
        .from('ingestion_sources')
        .insert({ type: 'statement', name: 'Bank statement CSV', ...stamp });
    }
  } catch {
    /* ignore */
  }

  return (data as number) ?? 0;
}

/** Re-run categorisation rules over rows still on the fallback category.
 *  Returns how many transactions were moved. */
export async function recategorizeAll(): Promise<number> {
  const { data, error } = await supabase.rpc('recategorize_all');
  if (error) throw error;
  return (data as number) ?? 0;
}

// ---------- engine (client-side categorisation) ----------

/** Load the engine's Lists (family VPAs, Ferrari shops, merchant overrides)
 *  from Supabase. Falls back to empty if the engine tables aren't there yet. */
export async function loadEngineLists(): Promise<Lists> {
  const empty: Lists = { familyVpas: new Set(), ferrariShops: new Set(), overrides: new Map() };
  try {
    const [people, ferrari, rules] = await Promise.all([
      supabase.from('people').select('vpa').eq('is_family', true),
      supabase.from('ferrari_shops').select('vpa'),
      supabase.from('merchant_rules').select('match_type,match_value,category,merchant'),
    ]);
    if (people.error || ferrari.error || rules.error) return empty;
    return {
      familyVpas: new Set((people.data ?? []).map((r) => r.vpa as string)),
      ferrariShops: new Set((ferrari.data ?? []).map((r) => r.vpa as string)),
      overrides: new Map(
        (rules.data ?? []).map((r) => [
          r.match_type === 'counterparty'
            ? String(r.match_value).toUpperCase()
            : String(r.match_value),
          { category: r.category as string, merchant: (r.merchant as string | null) ?? undefined },
        ]),
      ),
    };
  } catch {
    return empty;
  }
}

/** Re-categorise every statement transaction in the browser with the current
 *  Lists, and write back only the ones whose slug changed. The engine module
 *  never touches the network — rows are paged out, classified, patched back. */
export async function recategorizeAllClient(lists: Lists): Promise<number> {
  const PAGE = 1000;
  let from = 0;
  let moved = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id,direction,amount_cents,raw_snippet,category')
      .eq('source_type', 'statement')
      .order('occurred_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;

    const rows = (data ?? []) as StoredTxn[];
    if (!rows.length) break;

    moved += await applyRecategoriseUpdates(recategoriseStored(rows, lists));

    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return moved;
}

/** Patch a batch of re-categorise updates back to `transactions`, in chunks. */
async function applyRecategoriseUpdates(updates: RecategoriseUpdate[]): Promise<number> {
  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50);
    const res = await Promise.all(
      chunk.map((u) =>
        supabase
          .from('transactions')
          .update({
            category: u.category,
            channel: u.channel,
            counterparty: u.counterparty,
            vpa: u.vpa,
            remark: u.remark,
            matched_by: u.matched_by,
            confidence: u.confidence,
          })
          .eq('id', u.id),
      ),
    );
    const failed = res.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }
  return updates.length;
}

// ---------- people / ferrari shops (family & pinned-shop lists) ----------

export async function listPeople(): Promise<Person[]> {
  const { data, error } = await supabase
    .from('people')
    .select('id,vpa,display_name,is_family,note,created_at,updated_at')
    .order('display_name', { nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Person[];
}

export async function listFerrariShops(): Promise<FerrariShop[]> {
  const { data, error } = await supabase
    .from('ferrari_shops')
    .select('id,vpa,display_name,added_by,created_at')
    .order('display_name', { nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as FerrariShop[];
}

/** Distinct counterparties seen in transactions, aggregated by VPA. Powers the
 *  "add someone not yet tagged" search on the manage screen. */
export async function listCounterparties(): Promise<Counterparty[]> {
  const rows: { vpa: string | null; counterparty: string | null; direction: Direction; amount_cents: number }[] =
    [];
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select('vpa,counterparty,direction,amount_cents')
      .not('vpa', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const byVpa = new Map<string, Counterparty>();
  for (const r of rows) {
    const vpa = (r.vpa ?? '').trim();
    if (!vpa) continue;
    const e = byVpa.get(vpa) ?? { vpa, name: r.counterparty ?? vpa, txnCount: 0, netCents: 0 };
    e.txnCount += 1;
    e.netCents += r.direction === 'credit' ? r.amount_cents : -r.amount_cents;
    if (!e.name && r.counterparty) e.name = r.counterparty;
    byVpa.set(vpa, e);
  }
  return [...byVpa.values()].sort((a, b) => b.txnCount - a.txnCount);
}

/** Upsert a `people` row's family flag. The row is kept on un-family so the
 *  display name and note survive; only an explicit un-set clears the flag. */
export async function setFamilyMember(
  vpa: string,
  displayName: string | null,
  isFamily: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('people')
    .upsert(
      { vpa, display_name: displayName, is_family: isFamily },
      { onConflict: 'user_id,vpa' },
    );
  if (error) throw error;
}

/** Pin or unpin a Ferrari shop. Unpinning removes the row (re-add to restore). */
export async function setFerrariShop(
  vpa: string,
  displayName: string | null,
  pinned: boolean,
): Promise<void> {
  if (pinned) {
    const { error } = await supabase
      .from('ferrari_shops')
      .upsert({ vpa, display_name: displayName, added_by: 'manual' }, { onConflict: 'user_id,vpa' });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('ferrari_shops').delete().eq('vpa', vpa);
    if (error) throw error;
  }
}

/** Re-classify the transactions matching a VPA or counterparty against the
 *  given Lists. `dryRun` returns the count that would move without writing. */
export async function recategoriseMatching(
  match: { vpa?: string; counterparty?: string },
  lists: Lists,
  dryRun = false,
): Promise<{ scanned: number; moved: number }> {
  let q = supabase.from('transactions').select('id,direction,amount_cents,raw_snippet,category');
  if (match.vpa) q = q.eq('vpa', match.vpa);
  else if (match.counterparty) q = q.ilike('counterparty', match.counterparty);
  else return { scanned: 0, moved: 0 };

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as StoredTxn[];
  const updates = recategoriseStored(rows, lists);
  if (!dryRun) await applyRecategoriseUpdates(updates);
  return { scanned: rows.length, moved: updates.length };
}


/** How many of a VPA's transactions would move if it were (un)tagged. */
export async function previewVpaTag(
  vpa: string,
  kind: 'family' | 'ferrari',
  next: boolean,
): Promise<{ scanned: number; moved: number }> {
  const lists = await loadEngineLists();
  const set = kind === 'family' ? lists.familyVpas : lists.ferrariShops;
  if (next) set.add(vpa);
  else set.delete(vpa);
  return recategoriseMatching({ vpa }, lists, true);
}

/** Tag/untag a VPA and re-categorise its existing transactions. */
export async function commitVpaTag(
  vpa: string,
  displayName: string | null,
  kind: 'family' | 'ferrari',
  next: boolean,
): Promise<{ scanned: number; moved: number }> {
  if (kind === 'family') await setFamilyMember(vpa, displayName, next);
  else await setFerrariShop(vpa, displayName, next);
  const lists = await loadEngineLists(); // re-read: now reflects the change
  return recategoriseMatching({ vpa }, lists, false);
}

// ---------- review queue ----------

const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

/** Engine-classified rows that want a human look: low/medium confidence,
 *  confidence ascending then amount descending (04a-BUILD-BRIEF Task 4). */
export async function listReviewQueue(limit = 300): Promise<ReviewTxn[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id,occurred_at,direction,amount_cents,category,merchant_raw,counterparty,vpa,confidence,matched_by',
    )
    .in('confidence', ['low', 'medium']);
  if (error) throw error;

  const rows = (data ?? []) as ReviewTxn[];
  rows.sort(
    (a, b) =>
      (CONFIDENCE_RANK[a.confidence ?? 'medium'] ?? 1) -
        (CONFIDENCE_RANK[b.confidence ?? 'medium'] ?? 1) || b.amount_cents - a.amount_cents,
  );
  return rows.slice(0, limit);
}

/** Pin a merchant to a category (engine Tier 0) and re-categorise every
 *  matching transaction, so the correction compounds. Keyed on VPA when the
 *  row has one, else the counterparty name. */
export async function pinMerchant(input: {
  matchType: 'vpa' | 'counterparty';
  matchValue: string;
  categorySlug: string;
  merchant: string | null;
}): Promise<{ moved: number }> {
  const stored =
    input.matchType === 'counterparty' ? input.matchValue.toUpperCase() : input.matchValue;

  const { error } = await supabase.from('merchant_rules').upsert(
    {
      match_type: input.matchType,
      match_value: stored,
      category: input.categorySlug, // slug; slugForCategory() passes slugs through
      merchant: input.merchant,
      source: 'manual',
    },
    { onConflict: 'user_id,match_type,match_value' },
  );
  if (error) throw error;

  const lists = await loadEngineLists(); // now includes the new override
  const res = await recategoriseMatching(
    input.matchType === 'vpa' ? { vpa: input.matchValue } : { counterparty: input.matchValue },
    lists,
    false,
  );
  return { moved: res.moved };
}

// ---------- AI fallback (last resort, ~0.1% of rows) ----------

export interface AiCandidate {
  key: string; // the merchant_rules match_value (VPA as-is, counterparty uppercased)
  matchType: 'vpa' | 'counterparty';
  matchValue: string; // original casing, for the re-categorise query
  merchant: string | null;
  counterparty: string | null;
  vpa: string | null;
  remark: string | null;
  channel: string | null;
  amount: number;
  direction: Direction;
}

/** Low-confidence rows the engine couldn't place, minus anything already pinned
 *  in merchant_rules — deduped to one per merchant key. */
export async function listAiCandidates(limit = 30): Promise<AiCandidate[]> {
  const [txnRes, ruleRes] = await Promise.all([
    supabase
      .from('transactions')
      .select(
        'direction,amount_cents,merchant_raw,counterparty,vpa,remark,channel,category',
      )
      .eq('confidence', 'low'),
    supabase.from('merchant_rules').select('match_value'),
  ]);
  if (txnRes.error) throw txnRes.error;
  if (ruleRes.error) throw ruleRes.error;

  const pinned = new Set((ruleRes.data ?? []).map((r) => String(r.match_value)));
  const seen = new Set<string>();
  const out: AiCandidate[] = [];

  for (const t of (txnRes.data ?? []) as Array<{
    direction: Direction;
    amount_cents: number;
    merchant_raw: string | null;
    counterparty: string | null;
    vpa: string | null;
    remark: string | null;
    channel: string | null;
    category: string;
  }>) {
    if (t.category === 'bank_charges') continue; // needsAI() excludes it
    const vpa = (t.vpa ?? '').trim();
    const cp = (t.counterparty ?? '').trim();
    const matchType: 'vpa' | 'counterparty' = vpa ? 'vpa' : 'counterparty';
    const matchValue = vpa || cp;
    if (!matchValue) continue;
    const key = matchType === 'counterparty' ? matchValue.toUpperCase() : matchValue;
    if (pinned.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      matchType,
      matchValue,
      merchant: t.merchant_raw,
      counterparty: t.counterparty,
      vpa: t.vpa,
      remark: t.remark,
      channel: t.channel,
      amount: t.amount_cents / 100,
      direction: t.direction,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export interface AiRunResult {
  candidates: number;
  answered: number;
  pinned: number;
  moved: number;
  notConfigured?: boolean;
}

/** One batched Claude call for the leftover rows; write each answer as a
 *  merchant_rules pin so the same merchant is never sent again. */
export async function runAiFallback(limit = 30): Promise<AiRunResult> {
  const cands = await listAiCandidates(limit);
  if (!cands.length) return { candidates: 0, answered: 0, pinned: 0, moved: 0 };

  const items = cands.map((c) => ({
    key: c.key,
    merchant: c.merchant ?? '',
    counterparty: c.counterparty ?? '',
    vpa: c.vpa ?? '',
    remark: c.remark ?? '',
    channel: c.channel ?? '',
    amount: c.amount,
    direction: c.direction,
  }));

  const { data, error } = await supabase.functions.invoke<{
    answers?: { key: string; category: string; merchant: string }[];
  }>('categorise-ai', { body: { items } });

  if (error) {
    let notConfigured = false;
    try {
      const ctx = (error as { context?: Response }).context;
      const b = ctx && (await ctx.json());
      if (b?.error === 'not configured') notConfigured = true;
    } catch {
      /* fall through */
    }
    if (notConfigured) return { candidates: cands.length, answered: 0, pinned: 0, moved: 0, notConfigured: true };
    throw error;
  }

  const answers = data?.answers ?? [];
  const byKey = new Map(cands.map((c) => [c.key, c]));
  let pinned = 0;
  let moved = 0;
  for (const a of answers) {
    const c = byKey.get(a.key);
    if (!c) continue;
    const res = await pinMerchant({
      matchType: c.matchType,
      matchValue: c.matchValue,
      categorySlug: a.category,
      merchant: a.merchant || c.merchant,
    });
    pinned += 1;
    moved += res.moved;
  }
  return { candidates: cands.length, answered: answers.length, pinned, moved };
}

/** When a bank-statement CSV was last imported (ISO), or null. */
export async function getLastStatementImport(): Promise<string | null> {
  const { data, error } = await supabase
    .from('ingestion_sources')
    .select('last_run_at')
    .eq('type', 'statement')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.last_run_at as string | null) ?? null;
}

export async function updateTransaction(
  id: string,
  patch: Partial<Pick<Transaction, 'category' | 'note' | 'account_id' | 'merchant_raw'>>,
): Promise<void> {
  const { error } = await supabase.from('transactions').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

/** Month dashboard: this month + previous month, aggregated client-side. */
export async function getMonthSummary(month: string): Promise<MonthSummary> {
  const cur = monthRange(month);
  const prev = monthRange(addMonths(month, -1));

  const [{ data: curRows, error: e1 }, { data: prevRows, error: e2 }] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount_cents, direction, category')
      .gte('occurred_at', cur.start)
      .lt('occurred_at', cur.end),
    supabase
      .from('transactions')
      .select('amount_cents, direction')
      .gte('occurred_at', prev.start)
      .lt('occurred_at', prev.end),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const byCat = new Map<string, { direction: Direction; cents: number; count: number }>();
  let spend = 0;
  let income = 0;
  for (const r of (curRows ?? []) as { amount_cents: number; direction: Direction; category: string }[]) {
    if (r.direction === 'debit') spend += r.amount_cents;
    else income += r.amount_cents;
    const key = `${r.direction}:${r.category}`;
    const e = byCat.get(key) ?? { direction: r.direction, cents: 0, count: 0 };
    e.cents += r.amount_cents;
    e.count += 1;
    byCat.set(key, e);
  }
  let prevSpend = 0;
  for (const r of (prevRows ?? []) as { amount_cents: number; direction: Direction }[]) {
    if (r.direction === 'debit') prevSpend += r.amount_cents;
  }

  return {
    month,
    spendCents: spend,
    incomeCents: income,
    prevSpendCents: prevSpend,
    count: curRows?.length ?? 0,
    byCategory: [...byCat.entries()]
      .map(([key, v]) => ({
        category: key.slice(key.indexOf(':') + 1),
        direction: v.direction,
        cents: v.cents,
        count: v.count,
      }))
      .sort((a, b) => b.cents - a.cents),
  };
}

export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await supabase.from('accounts').select('*').order('created_at');
  if (error) throw error;
  return data as Account[];
}

export async function listAccountBalances(): Promise<AccountBalance[]> {
  const { data, error } = await supabase.from('account_balances').select('*').order('name');
  if (error) throw error;
  return data as AccountBalance[];
}

export async function addAccount(input: {
  name: string;
  type: string;
  last4: string | null;
  opening_balance_cents: number;
}): Promise<void> {
  const { error } = await supabase.from('accounts').insert(input);
  if (error) throw error;
}

/** Delete an account. Its transactions keep their rows (account_id -> null). */
export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
}

/** User override rule for a merchant substring. */
export async function addCategoryRule(input: {
  pattern: string;
  direction: Direction;
  category: string;
}): Promise<void> {
  const { error } = await supabase.from('category_rules').insert({
    match_type: 'contains',
    pattern: input.pattern.toLowerCase(),
    direction: input.direction,
    category: input.category,
    priority: 10,
  });
  if (error) throw error;
}

/** Apply a category to every existing transaction whose merchant matches. */
export async function applyCategoryToMatching(input: {
  pattern: string;
  direction: Direction;
  category: string;
}): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ category: input.category })
    .eq('direction', input.direction)
    .ilike('merchant_raw', `%${input.pattern}%`);
  if (error) throw error;
}

// ---------- categories ----------
export async function listCategories(): Promise<RawCategoryRow[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('slug,label,direction,color,sort,is_system,user_id')
    .order('sort');
  if (error) throw error;
  return data as RawCategoryRow[];
}

export async function upsertCategory(input: {
  slug: string;
  label: string;
  direction: Direction;
  color: string;
  sort?: number;
}): Promise<void> {
  const { error } = await supabase.rpc('upsert_category', {
    p_slug: input.slug,
    p_label: input.label,
    p_direction: input.direction,
    p_color: input.color,
    p_sort: input.sort ?? 100,
  });
  if (error) throw error;
}

export async function deleteCategory(slug: string, direction: Direction): Promise<void> {
  const { error } = await supabase.rpc('delete_category', { p_slug: slug, p_direction: direction });
  if (error) throw error;
}

export async function listUserRules(): Promise<CategoryRule[]> {
  const { data, error } = await supabase
    .from('category_rules')
    .select('*')
    .not('user_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as CategoryRule[];
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase.from('category_rules').delete().eq('id', id);
  if (error) throw error;
}
