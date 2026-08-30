import { FormEvent, useMemo, useState } from 'react';
import { errMessage } from '@/lib/errors';
import { dueLabel, todayDateValue } from './datetime';
import { TaskDialog } from './TaskDialog';
import { useDeleteTask, useSaveTask, useSetTaskStatus, useTasks } from './hooks';
import type { OfficeTask, TaskPriority } from './types';

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: 'var(--neg)',
  normal: 'var(--wip)',
  low: 'var(--text-faint)',
};

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: OfficeTask;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = task.status === 'done';
  const due = dueLabel(task.due_date);
  return (
    <div className={`office-row${done ? ' done' : ''}`}>
      <label className="office-check">
        <input type="checkbox" checked={done} onChange={onToggle} aria-label={`${task.title} done`} />
      </label>
      <button type="button" className="office-row-main office-row-click" onClick={onEdit}>
        <span className="office-row-label">
          {!done && (
            <span
              className="office-pri-dot"
              style={{ ['--pri' as string]: PRIORITY_COLOR[task.priority] }}
              aria-label={`${task.priority} priority`}
            />
          )}
          {task.title}
        </span>
        <span className="office-row-sub">
          {due.text && <span className={`office-due tone-${due.tone}`}>{due.text}</span>}
          {task.notes && <span className="office-row-note">{task.notes}</span>}
        </span>
      </button>
      <button className="row-x" onClick={onDelete} data-tip="Delete" aria-label={`Delete ${task.title}`}>
        ×
      </button>
    </div>
  );
}

export function TaskList() {
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

  const { open, done } = useMemo(() => {
    const list = tasks ?? [];
    return {
      open: list.filter((t) => t.status === 'open'),
      done: list.filter((t) => t.status === 'done'),
    };
  }, [tasks]);

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

  return (
    <section className="office-section">
      <div className="office-section-head">
        <h3>Tasks</h3>
        <span className="office-count">{open.length} open</span>
      </div>

      {banner && <div className="err">{banner}</div>}

      <div className="office-list">
        {error ? (
          <div className="office-empty">Couldn’t load tasks.</div>
        ) : isLoading ? (
          <div className="office-empty">Loading…</div>
        ) : open.length === 0 ? (
          <div className="office-empty">Nothing open. Add one below.</div>
        ) : (
          open.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onToggle={() => setStatus.mutate({ id: t.id, status: 'done' })}
              onEdit={() => setEdit(t)}
              onDelete={() => del.mutate(t.id)}
            />
          ))
        )}
      </div>

      {done.length > 0 && (
        <>
          <button className="office-done-toggle" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide' : 'Show'} {done.length} done
          </button>
          {showDone && (
            <div className="office-list">
              {done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onToggle={() => setStatus.mutate({ id: t.id, status: 'open' })}
                  onEdit={() => setEdit(t)}
                  onDelete={() => del.mutate(t.id)}
                />
              ))}
            </div>
          )}
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
          min={todayDateValue()}
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

      <TaskDialog open={edit != null} onOpenChange={(v) => !v && setEdit(null)} edit={edit ?? undefined} />
    </section>
  );
}
