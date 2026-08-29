import { useState } from 'react';
import { money } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { useAccountBalances } from './hooks';
import { AddAccountDialog } from './AddAccountDialog';

export function AccountsWallet() {
  const { data: accounts, isLoading } = useAccountBalances();
  const [hidden, setHidden] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const total = (accounts ?? []).reduce((s, a) => s + a.balance_cents, 0);
  const show = (c: number) => (hidden ? '••••••' : money(c, true));

  return (
    <div className="wallet-wrap">
      <div className="wallet">
        {isLoading ? (
          <div className="acct a3" style={{ opacity: 0.5 }}>
            Loading… <span className="bal">—</span>
          </div>
        ) : accounts && accounts.length > 0 ? (
          accounts.slice(0, 4).map((a, i) => (
            <div key={a.account_id} className={`acct a${(i % 3) + 1}`}>
              {a.name}
              {a.last4 ? ` ··${a.last4}` : ''} <span className="bal">{show(a.balance_cents)}</span>
            </div>
          ))
        ) : (
          <div className="acct a3">
            No accounts yet <span className="bal">—</span>
          </div>
        )}
        <div className="pocket">
          <div className="tt">Across accounts</div>
          <div className="amt">{show(total)}</div>
          <button
            className={`eye${hidden ? ' off' : ''}`}
            onClick={() => setHidden((h) => !h)}
            data-tip={hidden ? 'Show figures' : 'Hide every figure'}
            aria-label={hidden ? 'Show figures' : 'Hide figures'}
          >
            <Icon name="eye" size={15} />
          </button>
        </div>
      </div>
      <button className="btn sec sm" onClick={() => setAddOpen(true)}>
        Add account
      </button>
      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
