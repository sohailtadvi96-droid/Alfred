import { PHONE_TABS, tabFor, type PhoneTabId } from '../nav';

/** Phone navigation memory, per device (localStorage): each tab's last
 *  address, so switching tabs returns to where you were in it, and the last
 *  address overall, so reopening the installed app lands on the last screen.
 *  Every value is a real address (pathname + search) — no in-memory stacks. */

const TABS_KEY = 'alfred-phone-tabs';
const LAST_KEY = 'alfred-phone-last';
// sessionStorage: present for the rest of this app session, gone on a cold launch
const SESSION_KEY = 'alfred-phone-session';

type TabMemory = Partial<Record<PhoneTabId, string>>;

function readTabs(): TabMemory {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    return raw ? (JSON.parse(raw) as TabMemory) : {};
  } catch {
    return {};
  }
}

/** Record where the user is. Called on every phone navigation. */
export function rememberLocation(pathname: string, search: string): void {
  const address = pathname + search;
  try {
    const tabs = readTabs();
    tabs[tabFor(pathname)] = address;
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
    localStorage.setItem(LAST_KEY, address);
  } catch {
    /* storage disabled — tabs just open at their root */
  }
}

/** Where a tab button goes: the tab's root when it is the active tab (tap
 *  the active tab to return to its root), else its last address. */
export function tabTarget(tab: PhoneTabId, activeTab: PhoneTabId): string {
  const root = PHONE_TABS.find((t) => t.id === tab)?.root ?? '/home';
  if (tab === activeTab) return root;
  const last = readTabs()[tab];
  return last && tabFor(last.split('?')[0]) === tab ? last : root;
}

/** On a cold launch of the installed app (which always starts at the
 *  manifest's start_url, /home), the address to restore instead — or null.
 *  Only ever answers once per app session, and never for a deep link (a
 *  notification tap opens /reminders, which is not /home). */
export function launchRestoreTarget(pathname: string, search: string, standalone: boolean): string | null {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return null;
    sessionStorage.setItem(SESSION_KEY, '1');
    if (!standalone || pathname !== '/home' || search) return null;
    const last = localStorage.getItem(LAST_KEY);
    return last && last !== '/home' ? last : null;
  } catch {
    return null;
  }
}
