import type { IconName } from '@/components/Icon';

export type ModuleId = 'expenses' | 'work' | 'design' | 'invest' | 'health' | 'goals' | 'travel';

export type TimeBoundKind = 'event' | 'task' | 'deliverable' | 'invoice' | 'milestone';

export type DueTone = 'overdue' | 'today' | 'soon' | 'later';

/** One chronological thing — the Rail is nothing but a sorted list of these. */
export interface TimeBound {
  id: string;
  /** the raw Office/Work row id — what Rail actions (mark done, etc.) mutate */
  entityId: string;
  module: ModuleId;
  kind: TimeBoundKind;
  title: string;
  subtitle: string | null;
  /** ISO instant used for sorting/positioning */
  at: string;
  allDay: boolean;
  done: boolean;
  tone: DueTone;
  needsAttention: boolean;
  href: string | null;
}

/** A gap in the Rail collapsed into a single "Xh free" hairline. */
export interface GapMarker {
  kind: 'gap';
  id: string;
  minutes: number;
}

/** A smaller, proportional gap between two items close in time — the Rail's
 *  "elastic" spacing, distinct from the collapsed hairline above. */
export interface SpacerMarker {
  kind: 'spacer';
  id: string;
  px: number;
}

/** The NOW marker's insertion point in the Rail's render list. */
export interface NowMarker {
  kind: 'now';
  id: 'now';
  at: string;
}

export type RailRow = TimeBound | GapMarker | SpacerMarker | NowMarker;

export interface SnapshotStat {
  label: string;
  value: string;
  hint?: string | null;
}

export interface SnapshotAction {
  label: string;
  href: string;
}

/** One Board tile's current state — a live read of a module, or a static
 *  preview. `stats` always shows; `moreStats` at md+, `detail` at lg only;
 *  `actions` shows its first entry at md and all entries at lg. */
export interface Snapshot {
  module: ModuleId;
  title: string;
  icon: IconName;
  live: boolean;
  href: string;
  stats: SnapshotStat[];
  moreStats?: SnapshotStat[];
  detail?: string | null;
  actions?: SnapshotAction[];
}
