import type { SearchResult, SourceId } from './types.ts';

const PER_PAGE = 24;

/** Thrown when a provider needs an API key that isn't set. */
export class NotConfiguredError extends Error {
  constructor(source: string) {
    super(`${source} is not configured — set its API key in Supabase secrets.`);
    this.name = 'NotConfiguredError';
  }
}

type Fetcher = (query: string, page: number) => Promise<SearchResult[]>;

// ---------- Unsplash ----------
const unsplash: Fetcher = async (query, page) => {
  const key = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!key) throw new NotConfiguredError('Unsplash');

  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('content_filter', 'high');

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
  });
  if (!res.ok) throw new Error(`Unsplash ${res.status}: ${await res.text()}`);
  const json = await res.json();

  return (json.results ?? []).map((p: Record<string, any>): SearchResult => ({
    id: `unsplash:${p.id}`,
    source: 'unsplash',
    thumb_url: p.urls?.small,
    image_url: p.urls?.regular ?? p.urls?.full ?? p.urls?.raw,
    link_url: p.links?.html ?? 'https://unsplash.com',
    title: p.description ?? p.alt_description ?? null,
    author: p.user?.name ?? null,
    author_url: p.user?.links?.html ?? null,
    license: null,
    width: p.width ?? null,
    height: p.height ?? null,
  }));
};

// ---------- Pexels ----------
const pexels: Fetcher = async (query, page) => {
  const key = Deno.env.get('PEXELS_API_KEY');
  if (!key) throw new NotConfiguredError('Pexels');

  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(PER_PAGE));

  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels ${res.status}: ${await res.text()}`);
  const json = await res.json();

  return (json.photos ?? []).map((p: Record<string, any>): SearchResult => ({
    id: `pexels:${p.id}`,
    source: 'pexels',
    thumb_url: p.src?.medium ?? p.src?.small,
    image_url: p.src?.large2x ?? p.src?.large ?? p.src?.original,
    link_url: p.url ?? 'https://pexels.com',
    title: p.alt || null,
    author: p.photographer ?? null,
    author_url: p.photographer_url ?? null,
    license: null,
    width: p.width ?? null,
    height: p.height ?? null,
  }));
};

// ---------- Openverse (no key needed for light use) ----------
const openverse: Fetcher = async (query, page) => {
  const url = new URL('https://api.openverse.org/v1/images/');
  url.searchParams.set('q', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(PER_PAGE));
  url.searchParams.set('mature', 'false');

  const token = Deno.env.get('OPENVERSE_TOKEN'); // optional — raises the rate limit
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ALFRED/1.0 (personal inspiration tool)',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Openverse ${res.status}: ${await res.text()}`);
  const json = await res.json();

  return (json.results ?? []).map((p: Record<string, any>): SearchResult => ({
    id: `openverse:${p.id}`,
    source: 'openverse',
    thumb_url: p.thumbnail ?? p.url,
    image_url: p.url,
    link_url: p.foreign_landing_url ?? p.url,
    title: p.title ?? null,
    author: p.creator ?? null,
    author_url: p.creator_url ?? null,
    license:
      p.license && p.license_version
        ? `${String(p.license).toUpperCase()} ${p.license_version}`
        : p.license
          ? String(p.license).toUpperCase()
          : null,
    width: p.width ?? null,
    height: p.height ?? null,
  }));
};

export const PROVIDERS: Record<SourceId, Fetcher> = { unsplash, pexels, openverse };
