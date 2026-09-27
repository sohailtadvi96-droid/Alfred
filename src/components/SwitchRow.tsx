/** A labelled on/off switch as its own row: label + one-line hint on the
 *  left, the switch on the right, in a surface-2 box. Shared between
 *  ReminderSheet ("Counts as a task") and Goals' "Remind me" row. */
export function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="switch-row">
      <div className="switch-row-text">
        <label htmlFor={id} className="switch-row-label">
          {label}
        </label>
        {hint && <span className="switch-row-hint">{hint}</span>}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        className={`switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}
