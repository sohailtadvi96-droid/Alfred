import { GoogleSync } from './GoogleSync';
import { NotesPanel } from './NotesPanel';
import { OfficeCalendar } from './OfficeCalendar';
import { TaskBacklog } from './TaskBacklog';

export function OfficeView() {
  return (
    <div className="office">
      <GoogleSync />
      <OfficeCalendar />
      <TaskBacklog />
      <NotesPanel />
    </div>
  );
}
