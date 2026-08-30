import { FormEvent, useEffect, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { useSaveTask } from './hooks';
import type { OfficeTask, TaskPriority } from './types';

const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high'];

export function TaskDialog({
  open,
  onOpenChange,
  edit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  edit?: OfficeTask;
}) {
  const save = useSaveTask();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(edit?.title ?? '');
    setNotes(edit?.notes ?? '');
    setDue(edit?.due_date ?? '');
    setPriority(edit?.priority ?? 'normal');
    setError(null);
  }, [open, edit]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Give the task a title.');
    try {
      await save.mutateAsync({
        id: edit?.id ?? null,
        title,
        notes,
        due_date: due || null,
        priority,
      });
      onOpenChange(false);
    } catch (err) {
      setError(errMessage(err, 'Could not save the task.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? 'Edit task' : 'New task'}
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className="btn primary sm"
            type="submit"
            form="task-form"
            disabled={save.isPending || !title.trim()}
          >
            {save.isPending ? 'Saving…' : edit ? 'Save changes' : 'Add task'}
          </button>
        </>
      }
    >
      <form id="task-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="t-title">Title</label>
          <input
            id="t-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Send the revised proposal"
            autoFocus
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="t-due">Due date</label>
            <input
              id="t-due"
              className="input"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="t-pri">Priority</label>
            <select
              id="t-pri"
              className="input"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="t-notes">Notes</label>
          <textarea
            id="t-notes"
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
          />
        </div>
        {error && <div className="err" style={{ marginTop: -6 }}>{error}</div>}
      </form>
    </Dialog>
  );
}
