import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from '../Icon';
import { PHONE_TABS, type PhoneTabId } from '../nav';
import { useRemindersDueCount } from '@/features/reminders/hooks';
import { tabTarget } from './phoneNav';

/** The phone's bottom bar: five fixed tabs, floating off the edges. The active
 *  tab is a brass pill with its label inline; the others are a quiet icon and
 *  label. Each tab is a real address — its last one, or its root when it is
 *  already the active tab. */
export function TabBar({ active }: { active: PhoneTabId }) {
  const due = useRemindersDueCount();

  return (
    <nav className="ph-tabbar" aria-label="Sections">
      {PHONE_TABS.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            to={tabTarget(t.id, active)}
            className={clsx('ph-tab', on && 'on')}
            aria-current={on ? 'page' : undefined}
          >
            <Icon name={t.icon} size={20} />
            <span className="ph-tab-label">{t.label}</span>
            {t.id === 'reminders' && due > 0 && (
              <span className="ph-badge" aria-label={`${due} due now or overdue`}>
                {due}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
