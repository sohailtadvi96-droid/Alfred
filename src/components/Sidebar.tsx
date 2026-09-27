import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Icon, type IconName } from './Icon';
import { useAuth } from '@/auth/AuthProvider';
import { useRemindersToday } from '@/features/reminders/hooks';

interface NavItem {
  to: string;
  label: string;
  index: string;
  icon: IconName;
  tip: string;
}

const MODULES: NavItem[] = [
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

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { user, signOut } = useAuth();
  const initial = (user?.email ?? 'A').charAt(0).toUpperCase();
  const { data: remindersToday } = useRemindersToday();
  // A skipped occurrence is still in this list (so reminder_streak can see
  // it), but it's not something to act on any more -- exclude it here the
  // same way TodayTab's Daily section does, or a dismissed reminder would
  // keep nagging from the badge.
  const dueCount = (remindersToday ?? []).filter(
    (r) => r.completion_status !== 'skipped' && (r.due_state === 'due_now' || r.due_state === 'overdue'),
  ).length;

  return (
    <aside className="side">
      <div className="logo">
        <NavLink to="/home" className="logo-link" data-tip={collapsed ? 'Home' : undefined} aria-label="Home">
          <span className="mark">A</span>
          <span>
            <b>ALFRED</b>
            <small>PERSONAL BUTLER</small>
          </span>
        </NavLink>
        {!collapsed && (
          <button
            className="railtoggle"
            onClick={onToggleCollapsed}
            data-tip="Collapse"
            aria-label="Collapse sidebar"
          >
            <Icon name="chevron" size={14} />
          </button>
        )}
      </div>

      <nav>
        {MODULES.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            className={({ isActive }) => clsx(isActive && 'active', collapsed && 'tip-right')}
            data-tip={collapsed ? m.label : m.tip}
          >
            <Icon name={m.icon} />
            <span className="label">{m.label}</span>
            <span className="n">{m.index}</span>
            {m.icon === 'bell' && dueCount > 0 && (
              <span className="rem-nav-badge" aria-label={`${dueCount} due now or overdue`}>
                {dueCount}
              </span>
            )}
          </NavLink>
        ))}

        <div className="grp">Later</div>
        {LATER.map((m) => (
          <a
            key={m.label}
            aria-disabled="true"
            style={{ opacity: 0.5, pointerEvents: 'none' }}
            data-tip={m.tip}
          >
            <Icon name={m.icon} />
            <span className="label">{m.label}</span>
            <span className="n">{m.index}</span>
          </a>
        ))}
      </nav>

      <div className="foot">
        <span className="av">{initial}</span>
        <span className="who">
          <div className="nm">{user?.email?.split('@')[0] ?? 'Signed in'}</div>
          <button className="so" onClick={() => void signOut()}>
            Sign out
          </button>
        </span>
        <NavLink
          to="/settings"
          className="railtoggle"
          data-tip="Settings"
          aria-label="Settings"
          style={{ marginLeft: 'auto' }}
        >
          <Icon name="settings" size={14} />
        </NavLink>
      </div>

      {collapsed && (
        <button
          className="railtoggle"
          onClick={onToggleCollapsed}
          data-tip="Expand"
          aria-label="Expand sidebar"
          style={{ marginTop: 8 }}
        >
          <Icon name="chevron" size={14} />
        </button>
      )}
    </aside>
  );
}
