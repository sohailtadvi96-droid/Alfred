import { createContext, useContext } from 'react';

export interface PrivacyValue {
  /** universal toggle — masks money-in figures (Income, money-in category cards) */
  hidden: boolean;
  toggle: () => void;
  /** wallet-only toggle — masks account balances + across-accounts total */
  walletHidden: boolean;
  toggleWallet: () => void;
}

export const PrivacyContext = createContext<PrivacyValue>({
  hidden: false,
  toggle: () => {},
  walletHidden: false,
  toggleWallet: () => {},
});

export const usePrivacy = () => useContext(PrivacyContext);

export const MASK = '••••••';
