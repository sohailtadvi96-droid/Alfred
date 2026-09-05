import { GoogleSync } from './GoogleSync';
import { JournalArchive } from './JournalArchive';
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
      <JournalArchive />
    </div>
  );
}
