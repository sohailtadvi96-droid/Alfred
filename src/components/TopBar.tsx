import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { usePhoneChrome } from './phone/chrome';

export function TopBar({
  title,
  crumb = 'ALFRED',
  action,
  phoneAction,
  showWallet = true,
  walletLabel = 'Bal',
  walletValue = '—',
  onWalletAdd,
}: {
  title: string;
  crumb?: string;
  action?: ReactNode;
  /** Phones only: round icon actions (.hbtn) shown instead of `action` and
   *  the wallet chip. Pages that don't pass it keep `action` on phones too. */
  phoneAction?: ReactNode;
  showWallet?: boolean;
  walletLabel?: string;
  walletValue?: string;
  onWalletAdd?: () => void;
}) {
  // The labelled back button for a nested screen; only phone CSS shows it.
  const back = usePhoneChrome()?.back ?? null;

  const actions = (
    <>
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
    </>
  );

  return (
    <div className={back ? 'topbar has-back' : 'topbar'}>
      {back && (
        <button type="button" className="topbar-back phone-only" onClick={back.onBack}>
          <Icon name="chevron" size={16} />
          {back.label}
        </button>
      )}
      <div className="tl">
        <div className="tlabel">{crumb}</div>
        <h1>{title}</h1>
      </div>
      <div className="tr">
        {phoneAction ? (
          <>
            {/* display: contents — the wrapper must not change the desktop flex row */}
            <span className="desk-only" style={{ display: 'contents' }}>
              {actions}
            </span>
            <span className="phone-only topbar-phone-actions">{phoneAction}</span>
          </>
        ) : (
          actions
        )}
      </div>
    </div>
  );
}
