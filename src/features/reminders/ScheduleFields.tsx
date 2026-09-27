import { describeSchedule } from './schedule';
import type { Reminder, ReminderFreq } from './types';

/** UI-level schedule picker -- "Weekdays" and "Custom days" are both
 *  freq='weekly' underneath, differing only in whether the day toggles are
 *  shown (Weekdays is a one-click Mon-Fri preset). Shared by ReminderSheet
 *  and Goals' inline "Remind me" panel (R6) -- the same five schedule
 *  shapes either place can describe. */
export type ScheduleMode = 'daily' | 'weekdays' | 'custom' | 'monthly' | 'every_n_days';

export const SCHEDULE_CHIPS: { mode: ScheduleMode; label: string }[] = [
  { mode: 'daily', label: 'Daily' },
  { mode: 'weekdays', label: 'Weekdays' },
  { mode: 'custom', label: 'Custom days' },
  { mode: 'monthly', label: 'Monthly' },
  { mode: 'every_n_days', label: 'Every N days' },
];

export const WEEKDAY_TOGGLES: { d: number; label: string }[] = [
  { d: 1, label: 'M' },
  { d: 2, label: 'T' },
  { d: 3, label: 'W' },
  { d: 4, label: 'T' },
  { d: 5, label: 'F' },
  { d: 6, label: 'S' },
  { d: 7, label: 'S' },
];

export function modeToFreq(mode: ScheduleMode): ReminderFreq {
  if (mode === 'weekdays' || mode === 'custom') return 'weekly';
  return mode as ReminderFreq;
}

export function sameDaySet(a: number[], b: number[]): boolean {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

export function isWeekdaysPreset(days: number[]): boolean {
  return sameDaySet(days, [1, 2, 3, 4, 5]);
}

export function scheduleModeFor(r: Pick<Reminder, 'freq' | 'weekdays'>): ScheduleMode {
  if (r.freq === 'weekly') return isWeekdaysPreset(r.weekdays ?? []) ? 'weekdays' : 'custom';
  return (r.freq ?? 'daily') as ScheduleMode;
}

/** A blank ScheduleValue for a fresh "Remind me" toggle-on, in either
 *  NewGoalDialog or GoalRow's edit block. */
export function emptyScheduleValue(mode: ScheduleMode, todayIso: string): ScheduleValue {
  return {
    scheduleMode: mode,
    weekdays: [],
    monthDay: '',
    intervalN: '2',
    timeOfDay: '',
    startDate: todayIso,
    noEnd: true,
    endDate: '',
  };
}

/** The reverse of the above -- seeds a ScheduleValue from an existing
 *  recurring Reminder, for editing one that's already linked. */
export function scheduleValueFromReminder(r: Reminder, todayIso: string): ScheduleValue {
  return {
    scheduleMode: scheduleModeFor(r),
    weekdays: r.weekdays ?? [],
    monthDay: r.month_day ? String(r.month_day) : '',
    intervalN: r.interval_n && r.interval_n >= 2 ? String(r.interval_n) : '2',
    timeOfDay: r.time_of_day ?? '',
    startDate: r.start_date ?? todayIso,
    noEnd: !r.end_date,
    endDate: r.end_date ?? '',
  };
}

export interface ScheduleValue {
  scheduleMode: ScheduleMode;
  weekdays: number[];
  monthDay: string;
  intervalN: string;
  timeOfDay: string;
  startDate: string;
  noEnd: boolean;
  endDate: string;
}

export interface ScheduleFieldErrors {
  weekdays?: string;
  month_day?: string;
  end_date?: string;
}

/** ScheduleValue -> the reminders.* columns it maps to -- shared by
 *  describeScheduleValue below and by Goals' "Remind me" save path (which
 *  builds an actual ReminderDraft from the same picker state). */
export function scheduleValueToFields(value: ScheduleValue) {
  const freq = modeToFreq(value.scheduleMode);
  const weekdays =
    value.scheduleMode === 'weekdays' ? [1, 2, 3, 4, 5] : value.scheduleMode === 'custom' ? value.weekdays : [];
  return {
    freq,
    weekdays,
    month_day: value.scheduleMode === 'monthly' ? Number(value.monthDay) || null : null,
    interval_n: value.scheduleMode === 'every_n_days' ? Math.max(2, Number(value.intervalN) || 2) : 1,
    time_of_day: value.timeOfDay || null,
    start_date: value.startDate || null,
    end_date: !value.noEnd ? value.endDate || null : null,
  };
}

/** The recurring-only subset of describeSchedule's fields, built from a
 *  ScheduleValue -- exported so a caller that wants the text without also
 *  rendering the box (the Goals row's own summary, say) can get it too. */
export function describeScheduleValue(value: ScheduleValue): string {
  const f = scheduleValueToFields(value);
  return describeSchedule({ kind: 'recurring', due_date: null, due_time: null, ...f });
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`field${error ? ' bad' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

/** Repeats chips, the day/month/interval picker that matches whichever
 *  chip is active, the time+start row, the Ends row, and (by default) the
 *  live summary box. Purely controlled -- no internal state, no RPC calls,
 *  so ReminderSheet and Goals' "Remind me" panel can each own their own
 *  form state and just hand a ScheduleValue + onChange down. */
export function ScheduleFields({
  value,
  onChange,
  errors,
  idPrefix = 'rem',
  summarySuffix,
  showSummary = true,
}: {
  value: ScheduleValue;
  onChange: (patch: Partial<ScheduleValue>) => void;
  errors?: ScheduleFieldErrors;
  /** distinguishes field ids when more than one ScheduleFields could ever
   *  be on the page at once -- defaults to the id ReminderSheet has always
   *  used, so its own behaviour/tests don't change. */
  idPrefix?: string;
  summarySuffix?: string;
  showSummary?: boolean;
}) {
  const currentFreq = modeToFreq(value.scheduleMode);
  const showStreakNote = currentFreq === 'weekly' || currentFreq === 'every_n_days';

  function toggleWeekday(d: number) {
    onChange({
      weekdays: value.weekdays.includes(d) ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d].sort(),
    });
  }

  return (
    <>
      <div className="field">
        <label>Repeats</label>
        <div className="rem-chip-row">
          {SCHEDULE_CHIPS.map((c) => (
            <button
              key={c.mode}
              type="button"
              className={`rem-chip${value.scheduleMode === c.mode ? ' on' : ''}`}
              onClick={() => onChange({ scheduleMode: c.mode })}
            >
              {c.label}
            </button>
          ))}
        </div>
        {errors?.weekdays && <span className="err">{errors.weekdays}</span>}
      </div>

      {value.scheduleMode === 'custom' && (
        <div className="field">
          <div className="rem-day-toggles">
            {WEEKDAY_TOGGLES.map((w) => (
              <button
                key={w.d}
                type="button"
                className={`rem-day-toggle${value.weekdays.includes(w.d) ? ' on' : ''}`}
                onClick={() => toggleWeekday(w.d)}
                aria-pressed={value.weekdays.includes(w.d)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {value.scheduleMode === 'monthly' && (
        <Field
          label="Day of month"
          htmlFor={`${idPrefix}-month-day`}
          error={errors?.month_day}
          hint={Number(value.monthDay) > 28 ? 'clamps to the last day in shorter months' : undefined}
        >
          <input
            id={`${idPrefix}-month-day`}
            type="number"
            min={1}
            max={31}
            className="input"
            value={value.monthDay}
            onChange={(e) => onChange({ monthDay: e.target.value })}
          />
        </Field>
      )}

      {value.scheduleMode === 'every_n_days' && (
        <Field label="Every how many days" htmlFor={`${idPrefix}-interval`}>
          <input
            id={`${idPrefix}-interval`}
            type="number"
            min={2}
            className="input"
            value={value.intervalN}
            onChange={(e) => onChange({ intervalN: e.target.value })}
          />
        </Field>
      )}

      <div className="field-row">
        <Field label="Time (optional)" htmlFor={`${idPrefix}-time-of-day`}>
          <input
            id={`${idPrefix}-time-of-day`}
            type="time"
            className="input"
            value={value.timeOfDay}
            onChange={(e) => onChange({ timeOfDay: e.target.value })}
          />
        </Field>
        <Field label="Starts" htmlFor={`${idPrefix}-start-date`}>
          <input
            id={`${idPrefix}-start-date`}
            type="date"
            className="input"
            value={value.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        </Field>
      </div>

      <div className="field">
        <label>Ends</label>
        <div className="seg">
          <button type="button" className={value.noEnd ? 'on' : ''} onClick={() => onChange({ noEnd: true })}>
            Never
          </button>
          <button type="button" className={!value.noEnd ? 'on' : ''} onClick={() => onChange({ noEnd: false })}>
            On a date
          </button>
        </div>
        {!value.noEnd && (
          <input
            type="date"
            className="input"
            style={{ marginTop: 8 }}
            value={value.endDate}
            onChange={(e) => onChange({ endDate: e.target.value })}
          />
        )}
        {errors?.end_date && <span className="err">{errors.end_date}</span>}
      </div>

      {showSummary && (
        <div className="rem-summary">
          <div>
            {describeScheduleValue(value)}
            {summarySuffix ?? ''}
          </div>
          {showStreakNote && <div className="rem-summary-note">Streak counts these days only</div>}
        </div>
      )}
    </>
  );
}
