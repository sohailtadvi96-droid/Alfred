import type { AgendaEvent, OfficeEvent, OfficeTask } from './types';
import { dayLabel, localDateKey } from './datetime';

export function localToAgenda(e: OfficeEvent): AgendaEvent {
  return {
    id: `l:${e.id}`,
    source: 'local',
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    allDay: false,
    location: e.location,
    url: null,
  };
}

/** the raw office_events id back out of an agenda id (or null for google rows) */
export function localEventId(agendaId: string): string | null {
  return agendaId.startsWith('l:') ? agendaId.slice(2) : null;
}

export function mergeAgenda(
  local: OfficeEvent[] | undefined,
  google: AgendaEvent[] | undefined,
): AgendaEvent[] {
  const rows = [...(local ?? []).map(localToAgenda), ...(google ?? [])];
  return rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** group an already-sorted agenda into day buckets */
export function groupByDay(rows: AgendaEvent[]): { key: string; label: string; items: AgendaEvent[] }[] {
  const out: { key: string; label: string; items: AgendaEvent[] }[] = [];
  for (const r of rows) {
    const key = localDateKey(r.startsAt);
    let bucket = out.find((b) => b.key === key);
    if (!bucket) {
      bucket = { key, label: dayLabel(r.startsAt), items: [] };
      out.push(bucket);
    }
    bucket.items.push(r);
  }
  return out;
}

/** tasks that need attention today: due on/before today and still open */
export function tasksDueToday(tasks: OfficeTask[] | undefined): OfficeTask[] {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return (tasks ?? []).filter(
    (t) => t.status === 'open' && t.due_date && new Date(`${t.due_date}T00:00:00`) <= today,
  );
}
