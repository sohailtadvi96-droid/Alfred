import { DOCK, dockFor, type DockId } from '../nav';

/** Phone navigation memory, per device (localStorage): each dock item's last
 *  address — so switching modules returns to where you were in one, as the
 *  prototype's per-tab stacks do — and the last address overall, so reopening
 *  the installed app lands on the last screen. Every value is a real address
 *  (pathname + search); there are no in-memory stacks. Harmless on desktop:
 *  nothing there reads it. */

const DOCK_KEY = 'alfred-phone-dock';
const LAST_KEY = 'alfred-phone-last';
// sessionStorage: present for the rest of this app session, gone on a cold launch
const SESSION_KEY = 'alfred-phone-session';

type DockMemory = Partial<Record<DockId, string>>;

function readDock(): DockMemory {
  try {
    const raw = localStorage.getItem(DOCK_KEY);
    return raw ? (JSON.parse(raw) as DockMemory) : {};
  } catch {
    return {};
  }
}

/** Record where the user is. Called on every navigation. */
export function rememberLocation(pathname: string, search: string): void {
  const address = pathname + search;
  try {
    const mem = readDock();
    mem[dockFor(pathname)] = address;
    localStorage.setItem(DOCK_KEY, JSON.stringify(mem));
    localStorage.setItem(LAST_KEY, address);
  } catch {
    /* storage disabled — dock items just open at their root */
  }
}

/** Where a dock item goes: its root when it is the active item (tapping the
 *  active item returns to the module's root), else its last address. */
export function dockTarget(item: DockId, active: DockId): string {
  const root = DOCK.find((d) => d.id === item)?.to ?? '/home';
  if (item === active) return root;
  const last = readDock()[item];
  return last && dockFor(last.split('?')[0]) === item ? last : root;
}

/** On a cold launch of the installed app (which always starts at the
 *  manifest's start_url, /home), the address to restore instead — or null.
 *  Answers once per app session, and never for a deep link (a notification
 *  tap opens /reminders, which is not /home). */
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

/** Running as the installed home-screen app (not a browser tab). Not a
 *  breakpoint check — the layout never depends on it. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
