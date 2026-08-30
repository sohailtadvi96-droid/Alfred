import { GoogleSync } from './GoogleSync';
import { NotesPanel } from './NotesPanel';
import { OfficeCalendar } from './OfficeCalendar';
import { useGoogleCalendar } from './useGoogleCalendar';

export function OfficeView() {
  const gcal = useGoogleCalendar(14);

  return (
    <div className="office">
      <GoogleSync gcal={gcal} />
      <OfficeCalendar googleEvents={gcal.events} />
      <NotesPanel />
    </div>
  );
}
