export type SourceId = 'unsplash' | 'pexels' | 'openverse';

export const ALL_SOURCES: SourceId[] = ['unsplash', 'pexels', 'openverse'];

/** One image, normalised across every provider. */
export interface SearchResult {
  /** stable across a session: `${source}:${providerId}` */
  id: string;
  source: SourceId;
  /** small image for the results grid */
  thumb_url: string;
  /** a larger version — what the app stores when you save it */
  image_url: string;
  /** the page this image lives on, at the source */
  link_url: string;
  title: string | null;
  author: string | null;
  author_url: string | null;
  /** licence label — Openverse only, null elsewhere */
  license: string | null;
  width: number | null;
  height: number | null;
}

/** per-source outcome, so the UI can show "Unsplash: not configured" etc. */
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
