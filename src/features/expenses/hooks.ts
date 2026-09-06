import { useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { TxnFilter } from './api';
import { FALLBACK_CATEGORIES, resolveCategories, type Category, type Direction } from './categories';
import type { NewTransaction, Transaction } from './types';

const keys = {
  txns: (f: TxnFilter) => ['expenses', 'txns', f] as const,
  summary: (month: string) => ['expenses', 'summary', month] as const,
  accounts: ['expenses', 'accounts'] as const,
  balances: ['expenses', 'balances'] as const,
  rules: ['expenses', 'rules'] as const,
  categories: ['expenses', 'categories'] as const,
};

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['expenses'] });
}

export function useTransactions(filter: TxnFilter) {
  return useQuery({
    queryKey: keys.txns(filter),
    queryFn: () => api.listTransactions(filter),
    placeholderData: keepPreviousData, // no flash when the month/filters change
  });
}

export function useMonthSummary(month: string) {
  return useQuery({
    queryKey: keys.summary(month),
    queryFn: () => api.getMonthSummary(month),
    placeholderData: keepPreviousData,
  });
}

export function useAccounts() {
  return useQuery({ queryKey: keys.accounts, queryFn: api.listAccounts });
}

export function useAccountBalances() {
  return useQuery({ queryKey: keys.balances, queryFn: api.listAccountBalances });
}

export function useUserRules() {
  return useQuery({ queryKey: keys.rules, queryFn: api.listUserRules });
}

export interface CategoryHelpers {
  all: Category[];
  loading: boolean;
  forDirection: (d: Direction) => Category[];
  get: (slug: string, d: Direction) => Category | undefined;
  label: (slug: string, d: Direction) => string;
  color: (slug: string, d: Direction) => string;
}

export function useCategories(): CategoryHelpers {
  const q = useQuery({
    queryKey: keys.categories,
    queryFn: api.listCategories,
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const all = q.isError ? FALLBACK_CATEGORIES : resolveCategories(q.data ?? []);
    const get = (slug: string, d: Direction) => all.find((c) => c.slug === slug && c.direction === d);
    return {
      all,
      loading: q.isLoading,
      forDirection: (d: Direction) => all.filter((c) => c.direction === d),
      get,
      label: (slug: string, d: Direction) => get(slug, d)?.label ?? slug,
      color: (slug: string, d: Direction) => get(slug, d)?.color ?? '#8D9E79',
    };
  }, [q.data, q.isError, q.isLoading]);
}

export function useUpsertCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.upsertCategory,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, direction }: { slug: string; direction: Direction }) =>
      api.deleteCategory(slug, direction),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAddTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTransaction) => api.addTransaction(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useImportStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, accountId }: { rows: Record<string, unknown>[]; accountId: string | null }) =>
      api.importStatementRows(rows, accountId),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useLastStatementImport() {
  return useQuery({
    queryKey: ['expenses', 'ingestion', 'statement'] as const,
    queryFn: api.getLastStatementImport,
    staleTime: 60_000,
  });
}

/** Family / Ferrari / merchant-override lists for the client-side engine. */
export function useEngineLists() {
  return useQuery({
    queryKey: ['expenses', 'engineLists'] as const,
    queryFn: api.loadEngineLists,
    staleTime: 5 * 60_000,
  });
}

export function usePeople() {
  return useQuery({ queryKey: ['expenses', 'people'] as const, queryFn: api.listPeople });
}

export function useFerrariShops() {
  return useQuery({ queryKey: ['expenses', 'ferrariShops'] as const, queryFn: api.listFerrariShops });
}

export function useCounterparties() {
  return useQuery({
    queryKey: ['expenses', 'counterparties'] as const,
    queryFn: api.listCounterparties,
    staleTime: 60_000,
  });
}

/** Tag/untag a VPA as family or a Ferrari shop, and re-categorise its rows. */
export function useCommitVpaTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      vpa: string;
      displayName: string | null;
      kind: 'family' | 'ferrari';
      next: boolean;
    }) => api.commitVpaTag(args.vpa, args.displayName, args.kind, args.next),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useReviewQueue() {
  return useQuery({
    queryKey: ['expenses', 'reviewQueue'] as const,
    queryFn: () => api.listReviewQueue(),
  });
}

/** Pin a merchant → category (engine Tier 0) and re-categorise matches. */
export function usePinMerchant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      matchType: 'vpa' | 'counterparty';
      matchValue: string;
      categorySlug: string;
      merchant: string | null;
    }) => api.pinMerchant(args),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAiCandidates() {
  return useQuery({
    queryKey: ['expenses', 'aiCandidates'] as const,
    queryFn: () => api.listAiCandidates(),
    staleTime: 60_000,
  });
}

/** Run the batched AI fallback over the leftover low-confidence rows. */
export function useAiFallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.runAiFallback(),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useRecategorizeAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const lists = await api.loadEngineLists();
      return api.recategorizeAllClient(lists);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Transaction> }) =>
      api.updateTransaction(id, patch),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAddAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.addAccount,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Recategorise one txn, and optionally make it a standing rule for the merchant. */
export function useRecategorise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      txn: Transaction;
      category: string;
      makeRule: boolean;
    }) => {
      await api.updateTransaction(args.txn.id, { category: args.category });
      if (args.makeRule && args.txn.merchant_raw) {
        const pattern = args.txn.merchant_raw.trim();
        await api.addCategoryRule({ pattern, direction: args.txn.direction, category: args.category });
        await api.applyCategoryToMatching({ pattern, direction: args.txn.direction, category: args.category });
      }
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.deleteRule, onSuccess: () => invalidateAll(qc) });
}
