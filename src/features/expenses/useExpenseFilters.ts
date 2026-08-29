import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { monthKey } from '@/lib/format';
import type { Direction } from './categories';
import type { TxnFilter } from './api';

export interface ExpenseFilters {
  month: string;
  flow: Direction | undefined;
  category: string | undefined;
  accountId: string | undefined;
  /** shape TransactionList / MonthDashboard expect */
  filter: Omit<TxnFilter, 'month'>;
  search: string;
  setMonth: (m: string) => void;
  setFlow: (d: Direction | undefined) => void;
  patch: (next: Partial<Omit<TxnFilter, 'month'>>) => void;
}

/** Expenses filter state lives in the URL, so it's shared between the
 *  dashboard and the transactions page and survives the arrow jump. */
export function useExpenseFilters(): ExpenseFilters {
  const [sp, setSp] = useSearchParams();

  const month = sp.get('month') || monthKey();
  const flowRaw = sp.get('flow');
  const flow: Direction | undefined = flowRaw === 'debit' || flowRaw === 'credit' ? flowRaw : undefined;
  const category = sp.get('category') || undefined;
  const accountId = sp.get('account') || undefined;

  const write = useCallback(
    (mut: (p: URLSearchParams) => void) => {
      setSp(
        (prev) => {
          const p = new URLSearchParams(prev);
          mut(p);
          return p;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const setMonth = useCallback(
    (m: string) => write((p) => (m === monthKey() ? p.delete('month') : p.set('month', m))),
    [write],
  );

  const setFlow = useCallback(
    (d: Direction | undefined) =>
      write((p) => {
        p.delete('category');
        if (d) p.set('flow', d);
        else p.delete('flow');
      }),
    [write],
  );

  const patch = useCallback(
    (next: Partial<Omit<TxnFilter, 'month'>>) =>
      write((p) => {
        if ('direction' in next) next.direction ? p.set('flow', next.direction) : p.delete('flow');
        if ('category' in next) next.category ? p.set('category', next.category) : p.delete('category');
        if ('accountId' in next) next.accountId ? p.set('account', next.accountId) : p.delete('account');
      }),
    [write],
  );

  const filter = useMemo(
    () => ({ direction: flow, category, accountId }),
    [flow, category, accountId],
  );

  return { month, flow, category, accountId, filter, search: sp.toString(), setMonth, setFlow, patch };
}
