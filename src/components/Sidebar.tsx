import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from './Icon';
import { useAuth } from '@/auth/AuthProvider';
import { useRemindersDueCount } from '@/features/reminders/hooks';
import { LATER, MODULES } from './nav';

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { user, signOut } = useAuth();
  const initial = (user?.email ?? 'A').charAt(0).toUpperCase();
  const dueCount = useRemindersDueCount();

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
