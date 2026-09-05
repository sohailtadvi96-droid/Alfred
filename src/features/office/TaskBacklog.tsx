import { FormEvent, useMemo, useState } from 'react';
import { errMessage } from '@/lib/errors';
import { todayKey } from './calendar';
import { dueLabel } from './datetime';
import { TaskDialog } from './TaskDialog';
import { TaskRow } from './TaskRow';
import { useDeleteTask, useSaveTask, useSetTaskStatus, useTasks } from './hooks';
import type { OfficeTask, TaskPriority } from './types';

const byDue = (a: OfficeTask, b: OfficeTask) =>
  (a.due_date ?? '').localeCompare(b.due_date ?? '');

function DueChip({ date }: { date: string }) {
  const d = dueLabel(date);
  return <span className={`office-due tone-${d.tone}`}>{d.text}</span>;
}

export function TaskBacklog() {
  const { data: tasks, isLoading, error } = useTasks();
  const save = useSaveTask();
  const setStatus = useSetTaskStatus();
  const del = useDeleteTask();

  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [edit, setEdit] = useState<OfficeTask | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const today = todayKey();
  const groups = useMemo(() => {
    const open = (tasks ?? []).filter((t) => t.status === 'open');
    return {
      overdue: open.filter((t) => t.due_date && t.due_date < today).sort(byDue),
      undated: open.filter((t) => !t.due_date),
      later: open.filter((t) => t.due_date && t.due_date >= today).sort(byDue),
      done: (tasks ?? []).filter((t) => t.status === 'done'),
    };
  }, [tasks, today]);

  const openCount = groups.overdue.length + groups.undated.length + groups.later.length;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await save.mutateAsync({ id: null, title, notes: '', due_date: due || null, priority });
      setTitle('');
      setDue('');
      setPriority('normal');
    } catch (err) {
      setBanner(errMessage(err, 'Could not add the task.'));
    }
  }

  const row = (t: OfficeTask) => (
    <TaskRow
      key={t.id}
      task={t}
      onToggle={() =>
        setStatus.mutate({ id: t.id, status: t.status === 'done' ? 'open' : 'done' })
      }
      onEdit={() => setEdit(t)}
      onDelete={() => del.mutate(t.id)}
      trailing={t.due_date ? <DueChip date={t.due_date} /> : undefined}
    />
  );

  return (
    <section className="office-section office-section-wide">
      <div className="office-section-head">
        <h3>Tasks</h3>
        <span className="office-count">{openCount} open</span>
      </div>

      {banner && <div className="err">{banner}</div>}

      {error ? (
        <div className="office-empty">Couldn’t load tasks.</div>
      ) : isLoading ? (
        <div className="office-empty">Loading…</div>
      ) : openCount === 0 ? (
        <div className="office-empty">No open tasks. Add one below.</div>
      ) : (
        <div className="office-list">
          {groups.overdue.length > 0 && (
            <>
              <div className="office-group-label overdue">Overdue</div>
              {groups.overdue.map(row)}
            </>
          )}
          {groups.undated.length > 0 && (
            <>
              <div className="office-group-label">No date</div>
              {groups.undated.map(row)}
            </>
          )}
          {groups.later.length > 0 && (
            <>
              <div className="office-group-label">Upcoming</div>
              {groups.later.map(row)}
            </>
          )}
        </div>
      )}

      {groups.done.length > 0 && (
        <>
          <button className="office-done-toggle" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide' : 'Show'} {groups.done.length} done
          </button>
          {showDone && <div className="office-list">{groups.done.map(row)}</div>}
        </>
      )}

      <form className="office-add" onSubmit={onAdd}>
        <input
          className="input sm-select"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          aria-label="New task title"
        />
        <input
          className="input sm-select"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date"
        />
        <select
          className="input sm-select"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          aria-label="Priority"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
        <button className="btn sec sm" type="submit" disabled={save.isPending || !title.trim()}>
          Add
        </button>
      </form>

      <TaskDialog
        open={edit != null}
        onOpenChange={(v) => !v && setEdit(null)}
        edit={edit ?? undefined}
      />
    </section>
  );
}
