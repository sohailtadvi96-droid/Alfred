import { createContext, useContext } from 'react';

export interface PrivacyValue {
  /** when true, every currency amount on the Expenses page is masked */
  hidden: boolean;
  toggle: () => void;
}

export const PrivacyContext = createContext<PrivacyValue>({ hidden: false, toggle: () => {} });

export const usePrivacy = () => useContext(PrivacyContext);

export const MASK = '••••••';
