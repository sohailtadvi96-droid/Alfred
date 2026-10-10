import { createContext, useContext } from 'react';

/** What the phone shell tells the screens inside it. Only PhoneShell provides
 *  it, so on desktop usePhoneChrome() is null and nothing renders differently. */
export interface PhoneChrome {
  /** the labelled back button for a nested screen; null at a tab's root */
  back: { label: string; onBack: () => void } | null;
}

export const PhoneChromeContext = createContext<PhoneChrome | null>(null);

export function usePhoneChrome(): PhoneChrome | null {
  return useContext(PhoneChromeContext);
}
