import { supabase } from '@/lib/supabase';
import { addMonths, monthRange } from '@/lib/format';
import type { Direction } from './categories';
import type { Account, AccountBalance, CategoryRule, MonthSummary, NewTransaction, Transaction } from './types';

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

export async function addTransaction(input: NewTransaction): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...input, source_type: 'manual' })
    .select('*')
    .single();
  if (error) throw error;
  return data as Transaction;
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

  const byCat = new Map<string, number>();
  let spend = 0;
  let income = 0;
  for (const r of (curRows ?? []) as { amount_cents: number; direction: Direction; category: string }[]) {
    if (r.direction === 'debit') {
      spend += r.amount_cents;
      byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount_cents);
    } else {
      income += r.amount_cents;
    }
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
      .map(([category, cents]) => ({ category, cents }))
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
