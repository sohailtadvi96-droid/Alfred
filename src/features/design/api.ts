import { supabase } from '@/lib/supabase';
import { hostOf } from './tags';
import type { BoardWithCover, DesignBoard, DesignItem, NewBoard, NewItem } from './types';

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
  for (const r of (itemsRes.data ?? []) as { board_id: string; image_url: string }[]) {
    counts.set(r.board_id, (counts.get(r.board_id) ?? 0) + 1);
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
    const { error } = await supabase.from('design_items').insert(row);
    if (error) throw error;
  }
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from('design_items').delete().eq('id', id);
  if (error) throw error;
}
