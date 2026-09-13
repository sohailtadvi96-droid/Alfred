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
  'expenses',
  'work',
  'design',
  'goals',
  'invest',
  'health',
  'travel',
];

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

export function readBoardLayout(): BoardLayout {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return DEFAULT_BOARD_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<BoardLayout>;
    if (!Array.isArray(parsed.order)) return DEFAULT_BOARD_LAYOUT;
    return { order: parsed.order, sizes: parsed.sizes ?? {} };
  } catch {
    return DEFAULT_BOARD_LAYOUT;
  }
}

export function writeBoardLayout(layout: BoardLayout) {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}
