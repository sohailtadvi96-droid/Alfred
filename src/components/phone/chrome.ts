import { createContext, useContext } from 'react';

/** What AppShell tells the screens inside it (useNavChrome). The back button
 *  it describes is rendered as .phone-only, so desktop never shows it. */
export interface PhoneChrome {
  /** the labelled back button for a nested screen; null at a tab's root */
  back: { label: string; onBack: () => void } | null;
}

export const PhoneChromeContext = createContext<PhoneChrome | null>(null);

export function usePhoneChrome(): PhoneChrome | null {
  return useContext(PhoneChromeContext);
}
