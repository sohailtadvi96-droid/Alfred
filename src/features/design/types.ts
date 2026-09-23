export interface DesignBoard {
  id: string;
  name: string;
  description: string | null;
  /** the one catch-all board per user (0029) */
  is_inbox: boolean;
  created_at: string;
  updated_at: string;
}

export type MediaType = 'image' | 'video' | 'gif';
export type EnrichStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface DesignItem {
  id: string;
  board_id: string;
  title: string | null;
  /** null until design-ingest resolves it (or forever, for a page-only save
   *  of a video) — poster_url/thumb_path carry video, this carries stills. */
  image_url: string | null;
  link_url: string | null;
  source: string | null;
  note: string | null;
  tags: string[];
  medium: string | null;
  created_at: string;
  updated_at: string;
  media_type: MediaType;
  /** video's poster frame URL, as found on the source page — null for image/gif */
  poster_url: string | null;
  /** path in the private design-media bucket — the cached original, not a
   *  thumbnail despite the name (see docs/DESIGN.md) */
  thumb_path: string | null;
  caption: string | null;
  colors: { hex: string; pct: number }[] | null;
  enrich_status: EnrichStatus;
  enrich_error: string | null;
  /** Natural pixel size of the cached media, parsed from the file header by
   *  design-ingest — null for a pre-migration row or one that never went
   *  through ingest (gif, or a manual page-only save). */
  width: number | null;
  height: number | null;
}

/** A board plus the numbers the overview card needs: how many references it
 *  holds and up to four recent image URLs for the mosaic cover. */
export interface BoardWithCover extends DesignBoard {
  /** every item in the board: homed here (design_items.board_id) plus
   *  cross-listed into it (design_item_boards) — tiles overlap by design, so
   *  these do NOT sum to the library size */
  itemCount: number;
  /** only the items homed here. Each item has exactly one home, so this is
   *  what sums to the library size, and it is what deleting the board deletes
   *  (design_items.board_id cascades; cross-listing rows just go away) */
  homeCount: number;
  covers: string[];
}

/** one extra board an item also appears in (design_item_boards, 0037) */
export interface ItemBoardLink {
  item_id: string;
  board_id: string;
}

export interface NewBoard {
  id: string | null;
  name: string;
  description: string;
}

export interface NewItem {
  id: string | null;
  board_id: string;
  title: string;
  image_url: string;
  link_url: string;
  note: string;
  tags: string[];
}

/** id used for the "everything, across boards" pseudo-board */
export const ALL_BOARD = 'all';
