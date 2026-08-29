import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { TxnFilter } from './api';
import type { NewTransaction, Transaction } from './types';

const keys = {
  txns: (f: TxnFilter) => ['expenses', 'txns', f] as const,
  summary: (month: string) => ['expenses', 'summary', month] as const,
  accounts: ['expenses', 'accounts'] as const,
  balances: ['expenses', 'balances'] as const,
  rules: ['expenses', 'rules'] as const,
};

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['expenses'] });
}

export function useTransactions(filter: TxnFilter) {
  return useQuery({ queryKey: keys.txns(filter), queryFn: () => api.listTransactions(filter) });
}

export function useMonthSummary(month: string) {
  return useQuery({ queryKey: keys.summary(month), queryFn: () => api.getMonthSummary(month) });
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

export function useAddTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTransaction) => api.addTransaction(input),
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
