import { supabase } from '@/lib/supabase';
import { hostOf } from './tags';
import type { BoardWithCover, DesignBoard, DesignItem, ItemBoardLink, NewBoard, NewItem } from './types';

const MEDIA_BUCKET = 'design-media';
const SIGNED_URL_TTL = 60 * 60; // an hour — DESIGN.md gotchas: batch and set a sane TTL

// ---------- boards ----------
export async function listBoards(): Promise<BoardWithCover[]> {
  const [boardsRes, itemsRes, linksRes] = await Promise.all([
    supabase.from('design_boards').select('*').order('created_at', { ascending: false }),
    supabase
      .from('design_items')
      .select('id, board_id, image_url, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('design_item_boards').select('item_id, board_id'),
  ]);
  if (boardsRes.error) throw boardsRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (linksRes.error) throw linksRes.error;

  type Row = { id: string; board_id: string; image_url: string | null };
  const items = (itemsRes.data ?? []) as Row[]; // newest first
  const byId = new Map(items.map((it) => [it.id, it]));

  // A board's members: items homed there, then items cross-listed into it —
  // Set-deduped so a redundant link to an item's own home never double-counts.
  // items is newest-first and links are folded in by that same order, so the
  // first four members with an image are the four most recent.
  const members = new Map<string, Set<string>>();
  const home = new Map<string, number>();
  const add = (boardId: string, itemId: string) => {
    const set = members.get(boardId) ?? new Set<string>();
    set.add(itemId);
    members.set(boardId, set);
  };
  for (const it of items) {
    add(it.board_id, it.id);
    home.set(it.board_id, (home.get(it.board_id) ?? 0) + 1);
  }
  for (const l of (linksRes.data ?? []) as { item_id: string; board_id: string }[]) {
    if (byId.has(l.item_id)) add(l.board_id, l.item_id);
  }

  const order = new Map(items.map((it, i) => [it.id, i]));
  return (boardsRes.data as DesignBoard[]).map((b) => {
    const ids = [...(members.get(b.id) ?? [])].sort((x, y) => order.get(x)! - order.get(y)!);
    const covers: string[] = [];
    for (const id of ids) {
      const src = byId.get(id)!.image_url;
      if (src && covers.length < 4) covers.push(src); // no thumb_path/transform pass here yet — skip null rather than break <img>
    }
    return { ...b, itemCount: ids.length, homeCount: home.get(b.id) ?? 0, covers };
  });
}

/** Every cross-listing row for this user — small (one per extra board an item
 *  appears in), so fetched whole rather than per item. */
export async function listItemBoardLinks(): Promise<ItemBoardLink[]> {
  const { data, error } = await supabase.from('design_item_boards').select('item_id, board_id');
  if (error) throw error;
  return data as ItemBoardLink[];
}

export async function saveBoard(input: NewBoard): Promise<void> {
  const row = { name: input.name.trim(), description: input.description.trim() || null };
  if (input.id) {
    const { error } = await supabase.from('design_boards').update(row).eq('id', input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('design_boards').insert(row);
    if (error) throw error;
  }
}

export async function deleteBoard(id: string): Promise<void> {
  const { error } = await supabase.from('design_boards').delete().eq('id', id);
  if (error) throw error;
}

// ---------- items ----------
/** A board's items: homed there OR cross-listed into it (design_board_items,
 *  0037 — one select, RLS-scoped, already newest-first). */
export async function listItems(boardId: string): Promise<DesignItem[]> {
  const { data, error } = await supabase.rpc('design_board_items', { p_board_id: boardId });
  if (error) throw error;
  return data as DesignItem[];
}

export async function listAllItems(): Promise<DesignItem[]> {
  const { data, error } = await supabase
    .from('design_items')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as DesignItem[];
}

export async function saveItem(input: NewItem): Promise<void> {
  const link = input.link_url.trim();
  const image = input.image_url.trim();
  const row = {
    board_id: input.board_id,
    title: input.title.trim() || null,
    image_url: image,
    link_url: link || null,
    source: hostOf(link) ?? hostOf(image),
    note: input.note.trim() || null,
    tags: input.tags,
  };
  if (input.id) {
    const { error } = await supabase.from('design_items').update(row).eq('id', input.id);
    if (error) throw error;
  } else {
    // A manual save already has a working image_url — it never goes through
    // design-ingest, so it must not default to 'pending' (the column
    // default) or the UI would show it stuck processing forever. Same
    // meaning 0029 gave pre-pipeline rows: nothing to enrich, not a failure.
    const { error } = await supabase.from('design_items').insert({ ...row, enrich_status: 'skipped' });
    if (error) throw error;
  }
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from('design_items').delete().eq('id', id);
  if (error) throw error;
}

/** Re-invokes design-ingest for one item — used by the retry action on a
 *  failed card. Goes through design-retry, not design-ingest directly:
 *  design-ingest only accepts the service-role key, which the browser never
 *  holds — design-retry runs under this session's own JWT, confirms the
 *  item belongs to this user via RLS, then hands off server-side. Returns
 *  once the row is already back to 'running' (design-retry sets that
 *  itself); the row's next poll gets a fresh signed URL/status, not this
 *  call's own response. */
export async function retryIngest(itemId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('design-retry', { body: { item_id: itemId } });
  if (error) throw error;
}

export interface BackfillDimensionsBatch {
  scanned: number;
  updated: number;
  unparsed: number;
  failed: number;
  failures: { id: string; error: string }[];
  has_more: boolean;
}

/** One page of the 0036 dimensions backfill (see design-backfill-dimensions's
 *  own file header) — runs under this session's own token, RLS-scoped to
 *  the caller's own rows. Caller loops on has_more until it's false. */
export async function backfillDimensions(): Promise<BackfillDimensionsBatch> {
  const { data, error } = await supabase.functions.invoke('design-backfill-dimensions', { body: {} });
  if (error) {
    // A non-2xx surfaces as a generic "non-2xx status code" message — the
    // function's own { error } body says what actually went wrong.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? (error as Error).message);
  }
  return data as BackfillDimensionsBatch;
}

type Transform = { width: number; height?: number; resize?: 'cover' | 'contain' | 'fill'; quality?: number };

/** One signed URL per path, not Storage's batched createSignedUrls: the
 *  installed storage-js's batch method never forwards a `transform` option
 *  to the server at all (confirmed by reading its request body — only the
 *  singular createSignedUrl sends `transform`), so a batched call here
 *  would silently serve full-size originals instead of grid-sized
 *  renditions. Each entry carries its own transform (or none, for a gif —
 *  see getThumbUrls). */
async function signedUrlsFor(
  entries: { path: string; transform?: Transform }[],
): Promise<Record<string, string>> {
  if (entries.length === 0) return {};
  const signed = await Promise.all(
    entries.map(async ({ path, transform }) => {
      const { data, error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL, transform ? { transform } : undefined);
      if (error) throw error;
      return [path, data.signedUrl] as const;
    }),
  );
  return Object.fromEntries(signed);
}

// Storage's image transform rejects sides over 2500px.
const MAX_TRANSFORM_SIDE = 2400;

/** The rendition request for one item. With stored dimensions it asks for
 *  the exact true-ratio box (`contain`, so nothing is cropped or stretched):
 *  a bare `width` leaves the height to Storage, whose default resize mode is
 *  `cover` — it reshaped renditions to the wrong aspect, which is what made
 *  a card look right on the original image_url and wrong a second later when
 *  the rendition replaced it. No dimensions (never backfilled) falls back to
 *  the width-only request. */
function transformFor(
  it: Pick<DesignItem, 'width' | 'height'>,
  gridWidthPx: number,
): Transform {
  if (!it.width || !it.height) return { width: gridWidthPx, quality: 70 };
  let w = gridWidthPx;
  let h = Math.round((gridWidthPx * it.height) / it.width);
  if (h > MAX_TRANSFORM_SIDE) {
    h = MAX_TRANSFORM_SIDE;
    w = Math.max(1, Math.round((MAX_TRANSFORM_SIDE * it.width) / it.height));
  }
  return { width: w, height: h, resize: 'contain', quality: 70 };
}

/** Per page of results (see signedUrlsFor): every non-gif thumb_path gets
 *  a grid-sized transformed rendition, every gif path gets its original
 *  signed URL so the grid renders it directly. */
export async function getThumbUrls(
  items: Pick<DesignItem, 'thumb_path' | 'media_type' | 'width' | 'height'>[],
  gridWidthPx: number,
): Promise<Record<string, string>> {
  const entries: { path: string; transform?: Transform }[] = [];
  for (const it of items) {
    if (!it.thumb_path) continue;
    entries.push({
      path: it.thumb_path,
      transform: it.media_type === 'gif' ? undefined : transformFor(it, gridWidthPx),
    });
  }
  return signedUrlsFor(entries);
}

/** Untransformed signed URL for one cached original — the lightbox's "click
 *  for full size," never batched with the grid's transformed request. */
export async function getOriginalUrl(thumbPath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(thumbPath, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}
