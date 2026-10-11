import type { IconName } from './Icon';

/** Navigation shared by the desktop sidebar and the phone dock. */

export interface NavItem {
  to: string;
  label: string;
  index: string;
  icon: IconName;
  tip: string;
}

export const MODULES: NavItem[] = [
  { to: '/expenses', label: 'Expenses', index: '01', icon: 'expenses', tip: 'Money in and out, by category' },
  { to: '/secrets', label: 'Secrets', index: '02', icon: 'secrets', tip: 'Passwords and keys, encrypted at rest' },
  { to: '/work', label: 'Work', index: '03', icon: 'work', tip: 'Freelance projects and invoices · office tasks, meetings and notes' },
  { to: '/design', label: 'Design', index: '04', icon: 'design', tip: 'Inspiration library — references on boards, cross-cut by tags' },
  { to: '/goals', label: 'Goals', index: '05', icon: 'goals', tip: 'Targets, pace, and the weekly review — reads progress, never stores it' },
  { to: '/reminders', label: 'Reminders', index: '06', icon: 'bell', tip: 'One-time and recurring reminders — today, upcoming, and streaks' },
];

export const LATER: NavItem[] = [
  { to: '#', label: 'Invest', index: '07', icon: 'invest', tip: 'Planned — not in the first build' },
  { to: '#', label: 'Health', index: '08', icon: 'health', tip: 'Planned — not in the first build' },
];

// ---------- phone dock (docs/mobile/IMPLEMENTATION.md, Phase 1) ----------

export type DockId = 'home' | 'expenses' | 'reminders' | 'work' | 'goals' | 'design' | 'secrets';

export interface DockItem {
  id: DockId;
  to: string;
  label: string;
  icon: IconName;
}

// Module index order, same as the sidebar. Add Invest / Health / Travel only
// once those modules are built.
export const DOCK: DockItem[] = [
  { id: 'home', to: '/home', label: 'Home', icon: 'home' },
  { id: 'expenses', to: '/expenses', label: 'Expenses', icon: 'expenses' },
  { id: 'reminders', to: '/reminders', label: 'Reminders', icon: 'bell' },
  { id: 'work', to: '/work', label: 'Work', icon: 'work' },
  { id: 'goals', to: '/goals', label: 'Goals', icon: 'goals' },
  { id: 'design', to: '/design', label: 'Design', icon: 'design' },
  { id: 'secrets', to: '/secrets', label: 'Secrets', icon: 'secrets' },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Which dock item an address belongs to. Settings is opened from Home's A
 *  mark, so it belongs to Home (as in the prototype); anything unknown too. */
export function dockFor(pathname: string): DockId {
  return DOCK.find((d) => under(pathname, d.to))?.id ?? 'home';
}

/** Short screen names — the back button's label. */
export function screenLabel(pathname: string): string {
  const exact: Record<string, string> = {
    '/home': 'Home',
    '/expenses': 'Expenses',
    '/expenses/transactions': 'Transactions',
    '/expenses/review': 'Review queue',
    '/expenses/people': 'Family & shops',
    '/expenses/insights': 'Insights',
    '/reminders': 'Reminders',
    '/work': 'Work',
    '/work/invoices': 'Invoices',
    '/goals': 'Goals',
    '/design': 'Design',
    '/design/discover': 'Discover',
    '/secrets': 'Secrets',
    '/settings': 'Settings',
  };
  if (exact[pathname]) return exact[pathname];
  if (pathname.startsWith('/work/invoices/')) return 'Invoice';
  if (pathname.startsWith('/work/day/')) return 'Office day';
  if (pathname.startsWith('/work/')) return 'Project';
  if (pathname.startsWith('/design/')) return 'Board';
  return 'Back';
}

/** Where a nested screen goes back to when there's no in-app history to go
 *  back through (opened from a link, a notification or a reload). null for a
 *  module's root, which has no back button. */
export function parentOf(pathname: string): string | null {
  if (DOCK.some((d) => d.to === pathname)) return null;
  if (pathname === '/settings') return '/home';
  if (pathname.startsWith('/expenses/')) return '/expenses';
  if (pathname.startsWith('/work/invoices/')) return '/work/invoices';
  if (pathname.startsWith('/work/')) return '/work';
  if (pathname.startsWith('/design/')) return '/design';
  return null;
}

/** The crumb over a bottom sheet's title (phones only), as the prototype
 *  numbers modules: the same numbers as the desktop TopBar crumbs. */
const SHEET_CRUMB: Record<DockId, string | null> = {
  home: null,
  expenses: '01 / EXPENSES',
  secrets: '02 / SECRETS',
  work: '03 / WORK',
  design: '04 / DESIGN',
  goals: '05 / GOALS',
  reminders: '06 / REMINDERS',
};
export function sheetCrumb(pathname: string): string | null {
  if (pathname === '/settings') return 'SETTINGS';
  return SHEET_CRUMB[dockFor(pathname)];
}
