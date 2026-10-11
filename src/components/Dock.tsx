import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from './Icon';
import { DOCK, dockFor } from './nav';
import { dockTarget } from './phone/phoneNav';
import { useRemindersDueCount } from '@/features/reminders/hooks';

/** The phone's bottom bar (docs/mobile/IMPLEMENTATION.md, Phase 1): every
 *  built module in one floating row that scrolls sideways. Rendered always,
 *  hidden above the phone breakpoint by .phone-only. Each item is a real
 *  address — the module's last one, or its root when it is already active. */
export function Dock() {
  const { pathname } = useLocation();
  const due = useRemindersDueCount();
  const scroller = useRef<HTMLDivElement>(null);
  const firstPaint = useRef(true);
  const active = dockFor(pathname);

  // Centre the active item whenever the module changes; leave the owner's own
  // scroll position alone otherwise.
  useEffect(() => {
    const sc = scroller.current;
    const on = sc?.querySelector<HTMLElement>('.dock-item.active');
    if (!sc || !on) return;
    sc.scrollTo({
      left: Math.max(0, on.offsetLeft - (sc.clientWidth - on.offsetWidth) / 2),
      behavior: firstPaint.current ? 'auto' : 'smooth',
    });
    firstPaint.current = false;
  }, [active]);

  return (
    <nav className="dock phone-only" aria-label="Sections">
      <div className="dock-scroll" ref={scroller}>
        {DOCK.map((d) => {
          const on = d.id === active;
          return (
            <Link
              key={d.id}
              to={dockTarget(d.id, active)}
              className={clsx('dock-item', on && 'active')}
              aria-current={on ? 'page' : undefined}
            >
              <Icon name={d.icon} size={20} />
              <span>{d.label}</span>
              {d.icon === 'bell' && due > 0 && (
                <span className="dock-badge" aria-label={`${due} due now or overdue`}>
                  {due}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
