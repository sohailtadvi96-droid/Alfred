import { useState } from 'react';
import { money } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { useAccountBalances } from './hooks';
import { usePrivacy } from './privacy';
import { AddAccountDialog } from './AddAccountDialog';
import { ImportCsvDialog } from './ImportCsvDialog';

export function AccountsWallet() {
  const { data: accounts, isLoading } = useAccountBalances();
  const { hidden, toggle } = usePrivacy();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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
            onClick={toggle}
            data-tip={hidden ? 'Show all amounts' : 'Hide all amounts'}
            aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
          >
            <Icon name="eye" size={15} />
          </button>
        </div>
      </div>
      <div className="wallet-actions">
        <button className="btn sec sm" onClick={() => setAddOpen(true)}>
          Add account
        </button>
        <button className="btn sec sm" onClick={() => setImportOpen(true)}>
          Import CSV
        </button>
      </div>
      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
      <ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
