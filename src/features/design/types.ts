export interface DesignBoard {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignItem {
  id: string;
  board_id: string;
  title: string | null;
  image_url: string;
  link_url: string | null;
  source: string | null;
  note: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

/** A board plus the numbers the overview card needs: how many references it
 *  holds and up to four recent image URLs for the mosaic cover. */
export interface BoardWithCover extends DesignBoard {
  itemCount: number;
  covers: string[];
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
