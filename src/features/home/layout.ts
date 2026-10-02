import type { ModuleId } from './types';

export type RailWidth = 'expanded' | 'slim' | 'hidden';
export type TileSize = 'sm' | 'md' | 'lg';

export interface BoardLayout {
  order: ModuleId[];
  sizes: Partial<Record<ModuleId, TileSize>>;
}

const RAIL_KEY = 'alfred-home-rail';
const BOARD_KEY = 'alfred-home-board';

export const DEFAULT_BOARD_ORDER: ModuleId[] = [
  'reminders',
  'expenses',
  'work',
  'design',
  'goals',
  'invest',
  'health',
  'travel',
];

/** The size a tile takes until the user picks one. Everything is `sm` except
 *  "Next up": three titled rows with a tick and a due label need the width. */
const DEFAULT_TILE_SIZE: Partial<Record<ModuleId, TileSize>> = { reminders: 'md' };

export function tileSize(layout: BoardLayout, module: ModuleId): TileSize {
  return layout.sizes[module] ?? DEFAULT_TILE_SIZE[module] ?? 'sm';
}

const DEFAULT_BOARD_LAYOUT: BoardLayout = {
  order: DEFAULT_BOARD_ORDER,
  sizes: {},
};

export function readRailWidth(): RailWidth {
  try {
    const v = localStorage.getItem(RAIL_KEY);
    if (v === 'expanded' || v === 'slim' || v === 'hidden') return v;
  } catch {
    /* ignore */
  }
  return 'expanded';
}

export function writeRailWidth(v: RailWidth) {
  try {
    localStorage.setItem(RAIL_KEY, v);
  } catch {
    /* ignore */
  }
}

/** What a stored layout knew about before it started recording `known` --
 *  i.e. every board module that existed before Reminders (R8). */
const PRE_KNOWN_MODULES: ModuleId[] = ['expenses', 'work', 'design', 'goals', 'invest', 'health', 'travel'];

/** A saved `order` only lists the modules that existed when it was saved, so
 *  a module added to the app later would never appear on an existing board.
 *  `known` (written alongside the layout) records which modules the layout
 *  has already seen: one that isn't in it is new and goes to the front, one
 *  that is in it but missing from `order` was removed on purpose and stays
 *  removed. */
function withNewModules(order: ModuleId[], known: ModuleId[]): ModuleId[] {
  const fresh = DEFAULT_BOARD_ORDER.filter((m) => !known.includes(m) && !order.includes(m));
  return fresh.length > 0 ? [...fresh, ...order] : order;
}

export function readBoardLayout(): BoardLayout {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return DEFAULT_BOARD_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<BoardLayout> & { known?: ModuleId[] };
    if (!Array.isArray(parsed.order)) return DEFAULT_BOARD_LAYOUT;
    const known = Array.isArray(parsed.known) ? parsed.known : PRE_KNOWN_MODULES;
    return { order: withNewModules(parsed.order, known), sizes: parsed.sizes ?? {} };
  } catch {
    return DEFAULT_BOARD_LAYOUT;
  }
}

export function writeBoardLayout(layout: BoardLayout) {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify({ ...layout, known: DEFAULT_BOARD_ORDER }));
  } catch {
    /* ignore */
  }
}
