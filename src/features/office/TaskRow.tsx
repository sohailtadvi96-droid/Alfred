import type { ReactNode } from 'react';
import type { OfficeTask, TaskPriority } from './types';

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: 'var(--neg)',
  normal: 'var(--wip)',
  low: 'var(--text-faint)',
};

export function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
  trailing,
}: {
  task: OfficeTask;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** small chip shown before the notes line — e.g. a due-date label */
  trailing?: ReactNode;
}) {
  const done = task.status === 'done';
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
            />
          )}
          {task.title}
        </span>
        {(trailing || task.notes) && (
          <span className="office-row-sub">
            {trailing}
            {task.notes && <span className="office-row-note">{task.notes}</span>}
          </span>
        )}
      </button>
      <button
        className="row-x"
        onClick={onDelete}
        data-tip="Delete"
        aria-label={`Delete ${task.title}`}
      >
        ×
      </button>
    </div>
  );
}
