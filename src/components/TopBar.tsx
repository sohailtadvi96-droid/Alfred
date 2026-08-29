import type { ReactNode } from 'react';

export function TopBar({
  title,
  crumb = 'ALFRED',
  action,
  showWallet = true,
}: {
  title: string;
  crumb?: string;
  action?: ReactNode;
  showWallet?: boolean;
}) {
  return (
    <div className="topbar">
      <div className="tl">
        <div className="tlabel">{crumb}</div>
        <h1>{title}</h1>
      </div>
      <div className="tr">
        {showWallet && (
          <div className="wchip" data-tip="Balances arrive with the Expenses build" role="group" aria-label="Wallet">
            <span className="wc-l">Bal</span>
            <span className="wc-v">—</span>
            <button className="wc-b" type="button" aria-label="Add a transaction" data-tip="Add a transaction" disabled>
              +
            </button>
          </div>
        )}
        {action}
      </div>
    </div>
  );
}
