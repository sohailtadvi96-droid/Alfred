import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Icon, type IconName } from '@/components/Icon';
import { useGoals } from '@/features/goals/hooks';
import { useBoards } from '@/features/design/hooks';

interface Row {
  to: string;
  label: string;
  index: string;
  icon: IconName;
  module: string;
  sub: string;
}

/** The phone's fifth tab (docs/mobile/alfred-mobile-prototype.html, committed
 *  version): the modules that don't get a tab of their own, and Settings. */
export function MorePage() {
  const { data: goals } = useGoals();
  const { data: boards } = useBoards();
  const activeGoals = (goals ?? []).filter((g) => g.status === 'active').length;
  const refs = (boards ?? []).reduce((s, b) => s + b.homeCount, 0);

  const rows: Row[] = [
    { to: '/goals', label: 'Goals', index: '05', icon: 'goals', module: 'goals', sub: goals ? `${activeGoals} active` : 'Targets and pace' },
    {
      to: '/design',
      label: 'Design',
      index: '04',
      icon: 'design',
      module: 'design',
      sub: boards ? `${boards.length} boards · ${refs} references` : 'Inspiration boards',
    },
    { to: '/secrets', label: 'Secrets', index: '02', icon: 'secrets', module: 'secrets', sub: 'Passwords and keys' },
    { to: '/settings', label: 'Settings', index: '', icon: 'settings', module: 'settings', sub: 'Ground, notifications, account' },
  ];

  return (
    <>
      <TopBar title="More" crumb="ALFRED" showWallet={false} />
      <div className="wrap ph-more">
        <nav className="ph-card ph-menu" aria-label="More sections">
          {rows.map((r) => (
            <Link key={r.to} to={r.to} className="ph-menu-row">
              <span className="ph-chip" data-module={r.module}>
                <Icon name={r.icon} size={16} />
              </span>
              <span className="ph-row-main">
                <span className="ph-row-t">{r.label}</span>
                <span className="ph-row-s">{r.sub}</span>
              </span>
              {r.index && <span className="ph-menu-n">{r.index}</span>}
              <Icon name="chevron" size={14} className="ph-chev" />
            </Link>
          ))}
        </nav>
        <p className="ph-footnote">Invest, Health and Travel arrive when they’re built.</p>
      </div>
    </>
  );
}
