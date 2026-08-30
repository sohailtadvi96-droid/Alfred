import { EventList } from './EventList';
import { GoogleSync } from './GoogleSync';
import { NotesPanel } from './NotesPanel';
import { TaskList } from './TaskList';
import { TodayView } from './TodayView';
import { useGoogleCalendar } from './useGoogleCalendar';

export function OfficeView() {
  const gcal = useGoogleCalendar(14);

  return (
    <div className="office">
      <TodayView googleEvents={gcal.events} />

      <div className="office-grid">
        <EventList googleEvents={gcal.events} syncStrip={<GoogleSync gcal={gcal} />} />
        <TaskList />
      </div>

      <NotesPanel />
    </div>
  );
}
