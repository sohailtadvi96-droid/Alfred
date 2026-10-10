import type { IconName } from './Icon';

/** Navigation shared by the desktop sidebar and the phone tab bar. */

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

// ---------- phone ----------

export type PhoneTabId = 'home' | 'expenses' | 'reminders' | 'work' | 'more';

export interface PhoneTab {
  id: PhoneTabId;
  label: string;
  icon: IconName;
  /** the tab's root address — tapping the active tab returns here */
  root: string;
  /** every address that belongs to the tab (prefix match on a path segment) */
  prefixes: string[];
}

export const PHONE_TABS: PhoneTab[] = [
  { id: 'home', label: 'Home', icon: 'home', root: '/home', prefixes: ['/home'] },
  { id: 'expenses', label: 'Expenses', icon: 'expenses', root: '/expenses', prefixes: ['/expenses'] },
  { id: 'reminders', label: 'Reminders', icon: 'bell', root: '/reminders', prefixes: ['/reminders'] },
  { id: 'work', label: 'Work', icon: 'work', root: '/work', prefixes: ['/work'] },
  {
    id: 'more',
    label: 'More',
    icon: 'more',
    root: '/more',
    prefixes: ['/more', '/goals', '/design', '/secrets', '/settings'],
  },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Which tab an address belongs to; Home for anything unknown. */
export function tabFor(pathname: string): PhoneTabId {
  return PHONE_TABS.find((t) => t.prefixes.some((p) => under(pathname, p)))?.id ?? 'home';
}

/** Short screen names, used as the back button's label. */
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
    '/more': 'More',
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

/** The screen a nested address goes back to when there is no in-app history
 *  to go back through (opened from a link, a notification, or a reload).
 *  null for a tab's root. */
export function parentOf(pathname: string): string | null {
  if (PHONE_TABS.some((t) => t.root === pathname)) return null;
  if (pathname.startsWith('/expenses/')) return '/expenses';
  if (pathname.startsWith('/work/invoices/')) return '/work/invoices';
  if (pathname.startsWith('/work/')) return '/work';
  if (pathname.startsWith('/design/')) return '/design';
  if (['/goals', '/design', '/secrets', '/settings'].includes(pathname)) return '/more';
  return null;
}
