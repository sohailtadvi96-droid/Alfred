import { supabase } from '@/lib/supabase';
import { hostOf } from './tags';
import type { BoardWithCover, DesignBoard, DesignItem, NewBoard, NewItem } from './types';

const MEDIA_BUCKET = 'design-media';
const SIGNED_URL_TTL = 60 * 60; // an hour — DESIGN.md gotchas: batch and set a sane TTL

// ---------- boards ----------
export async function listBoards(): Promise<BoardWithCover[]> {
  const [boardsRes, itemsRes] = await Promise.all([
    supabase.from('design_boards').select('*').order('created_at', { ascending: false }),
    supabase
      .from('design_items')
      .select('board_id, image_url, created_at')
      .order('created_at', { ascending: false }),
  ]);
  if (boardsRes.error) throw boardsRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const counts = new Map<string, number>();
  const covers = new Map<string, string[]>();
  for (const r of (itemsRes.data ?? []) as { board_id: string; image_url: string | null }[]) {
    counts.set(r.board_id, (counts.get(r.board_id) ?? 0) + 1);
    if (!r.image_url) continue; // no thumb_path/transform pass here yet — skip rather than break <img>
    const c = covers.get(r.board_id) ?? [];
    if (c.length < 4) c.push(r.image_url);
    covers.set(r.board_id, c);
  }

  return (boardsRes.data as DesignBoard[]).map((b) => ({
    ...b,
    itemCount: counts.get(b.id) ?? 0,
    covers: covers.get(b.id) ?? [],
  }));
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
export async function listItems(boardId: string): Promise<DesignItem[]> {
  const { data, error } = await supabase
    .from('design_items')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false });
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

/** Batched signed URLs for a set of design-media paths, one call per
 *  distinct transform option (Storage's createSignedUrls applies transform
 *  uniformly to the whole batch, so gif paths — no working transform, see
 *  docs/DESIGN.md — must be a separate untransformed batch, not mixed in). */
async function signedUrlsFor(
  paths: string[],
  transform?: { width: number; quality?: number },
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL, transform ? { transform } : undefined);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  }
  return out;
}

/** One batched fetch per page of results (per DESIGN.md Step 5): every
 *  non-gif thumb_path gets a grid-sized transformed rendition, every gif
 *  path gets its original signed URL so the grid renders it directly. */
export async function getThumbUrls(
  items: Pick<DesignItem, 'thumb_path' | 'media_type'>[],
  gridWidthPx: number,
): Promise<Record<string, string>> {
  const transformablePaths: string[] = [];
  const gifPaths: string[] = [];
  for (const it of items) {
    if (!it.thumb_path) continue;
    (it.media_type === 'gif' ? gifPaths : transformablePaths).push(it.thumb_path);
  }
  const [transformed, plain] = await Promise.all([
    signedUrlsFor(transformablePaths, { width: gridWidthPx, quality: 70 }),
    signedUrlsFor(gifPaths),
  ]);
  return { ...transformed, ...plain };
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
