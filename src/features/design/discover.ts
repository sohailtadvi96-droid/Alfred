import { supabase } from '@/lib/supabase';

export type SourceId = 'unsplash' | 'pexels' | 'openverse';

export const SOURCES: { id: SourceId; label: string }[] = [
  { id: 'unsplash', label: 'Unsplash' },
  { id: 'pexels', label: 'Pexels' },
  { id: 'openverse', label: 'Openverse' },
];

export interface SearchResult {
  id: string;
  source: SourceId;
  thumb_url: string;
  image_url: string;
  link_url: string;
  title: string | null;
  author: string | null;
  author_url: string | null;
  license: string | null;
  width: number | null;
  height: number | null;
}

export interface SourceReport {
  count: number;
  error: string | null;
}

export interface SearchResponse {
  query: string;
  page: number;
  results: SearchResult[];
  sources: Record<SourceId, SourceReport>;
}

/** Calls the `design-search` Edge Function. Throws on transport / auth errors;
 *  per-source failures come back inside `sources`, not as a throw. */
export async function searchInspiration(
  q: string,
  sources: SourceId[],
  page: number,
): Promise<SearchResponse> {
  const { data, error } = await supabase.functions.invoke<SearchResponse>('design-search', {
    body: { q, sources, page },
  });
  if (error) throw error;
  if (!data) throw new Error('No response from search.');
  return data;
}
