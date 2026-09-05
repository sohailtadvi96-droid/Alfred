import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { money, timeAgo } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { useAccountBalances, useDeleteAccount, useLastStatementImport } from './hooks';
import { usePrivacy } from './privacy';
import { AddAccountDialog } from './AddAccountDialog';
import { ImportStatementDialog } from './ImportStatementDialog';

export function AccountsWallet() {
  const { data: accounts, isLoading } = useAccountBalances();
  const { data: lastImport } = useLastStatementImport();
  const { walletHidden, toggleWallet } = usePrivacy();
  const del = useDeleteAccount();
  const location = useLocation();

  const [manage, setManage] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const list = accounts ?? [];
  const total = list.reduce((s, a) => s + a.balance_cents, 0);
  const show = (c: number) => (walletHidden ? '••••••' : money(c, true));

  function removeAccount(id: string, name: string) {
    if (confirm(`Remove "${name}"? Its transactions stay — they're just unlinked from this account.`)) {
      del.mutate(id);
    }
  }

  return (
    <div className="wallet-wrap">
      <div className={`wallet${manage ? ' managing' : ''}`}>
        {isLoading ? (
          <div className="acct a3" style={{ opacity: 0.5 }}>
            Loading… <span className="bal">—</span>
          </div>
        ) : list.length > 0 ? (
          list.slice(0, 4).map((a, i) => (
            <div key={a.account_id} className={`acct a${(i % 3) + 1}`}>
              {a.name}
              {a.last4 ? ` ··${a.last4}` : ''} <span className="bal">{show(a.balance_cents)}</span>
              {manage && (
                <button
                  type="button"
                  className="acct-del"
                  onClick={() => removeAccount(a.account_id, a.name)}
                  data-tip={`Delete ${a.name}`}
                  aria-label={`Delete ${a.name}`}
                >
                  ×
                </button>
              )}
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

          <div className="pocket-controls">
            <button
              type="button"
              className={`pk-btn${walletHidden ? ' on' : ''}`}
              onClick={toggleWallet}
              data-tip={walletHidden ? 'Show wallet' : 'Hide wallet'}
              aria-label={walletHidden ? 'Show wallet' : 'Hide wallet'}
            >
              <Icon name="eye" size={14} />
            </button>

            <div className="pk-right">
              <button
                type="button"
                className="pk-btn"
                onClick={() => setAddOpen(true)}
                data-tip="Add account"
                aria-label="Add account"
              >
                +
              </button>
              <button
                type="button"
                className={`pk-btn${manage ? ' on danger' : ''}`}
                onClick={() => setManage((m) => !m)}
                data-tip={manage ? 'Done' : 'Remove an account'}
                aria-label={manage ? 'Done removing accounts' : 'Remove an account'}
                disabled={list.length === 0}
              >
                −
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="wallet-actions">
        <button className="btn sec sm" onClick={() => setImportOpen(true)}>
          Import statement
        </button>
        <Link
          className="btn sec sm"
          to={{ pathname: '/expenses/transactions', search: location.search }}
          data-tip="Open the full ledger — flow, category & account filters"
        >
          Open ledger →
        </Link>
      </div>

      {lastImport && (
        <div className="wallet-lastimport">Last statement import · {timeAgo(lastImport)}</div>
      )}

      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
      <ImportStatementDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
