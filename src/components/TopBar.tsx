import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { usePhoneChrome } from './phone/chrome';

export function TopBar({
  title,
  crumb = 'ALFRED',
  action,
  showWallet = true,
  walletLabel = 'Bal',
  walletValue = '—',
  onWalletAdd,
}: {
  title: string;
  crumb?: string;
  action?: ReactNode;
  showWallet?: boolean;
  walletLabel?: string;
  walletValue?: string;
  onWalletAdd?: () => void;
}) {
  // Phone only: the labelled back button for a nested screen (PhoneShell).
  const back = usePhoneChrome()?.back ?? null;

  return (
    <div className={back ? 'topbar has-back' : 'topbar'}>
      {back && (
        <button type="button" className="ph-back" onClick={back.onBack}>
          <Icon name="chevron" size={16} />
          {back.label}
        </button>
      )}
      <div className="tl">
        <div className="tlabel">{crumb}</div>
        <h1>{title}</h1>
      </div>
      <div className="tr">
        {showWallet && (
          <div
            className="wchip"
            data-tip={onWalletAdd ? 'Across accounts' : 'Balances arrive with the Expenses build'}
            role="group"
            aria-label="Wallet"
          >
            <span className="wc-l">{walletLabel}</span>
            <span className="wc-v">{walletValue}</span>
            <button
              className="wc-b"
              type="button"
              aria-label="Add a transaction"
              data-tip="Add a transaction"
              onClick={onWalletAdd}
              disabled={!onWalletAdd}
            >
              +
            </button>
          </div>
        )}
        {action}
      </div>
    </div>
  );
}
