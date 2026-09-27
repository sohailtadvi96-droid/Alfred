import { useState } from 'react';
import { QuickAdd } from './QuickAdd';
import { StatStrip } from './StatStrip';
import { TodayTab } from './TodayTab';
import { useRemindersToday, useReminderRules, useUpcoming } from './hooks';

type Tab = 'today' | 'upcoming' | 'all';

export function RemindersView() {
  const [tab, setTab] = useState<Tab>('today');
  const { data: today } = useRemindersToday();
  const { data: upcoming } = useUpcoming();
  const { data: rules } = useReminderRules();

  const rows = today ?? [];

  return (
    <div className="rem-view">
      <StatStrip rows={rows} />
      <QuickAdd />

      <div className="rem-tabs">
        <button type="button" className={`rem-tab${tab === 'today' ? ' active' : ''}`} onClick={() => setTab('today')}>
          Today · {rows.length}
        </button>
        <button
          type="button"
          className={`rem-tab${tab === 'upcoming' ? ' active' : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Upcoming · {upcoming?.length ?? 0}
        </button>
        <button type="button" className={`rem-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>
          All · {rules?.length ?? 0}
        </button>
      </div>

      {tab === 'today' && <TodayTab />}
      {tab === 'upcoming' && <div className="rem-tab-placeholder">Coming in R5.</div>}
      {tab === 'all' && <div className="rem-tab-placeholder">Coming in R5.</div>}
    </div>
  );
}
