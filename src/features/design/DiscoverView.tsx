import { FormEvent, useMemo, useState } from 'react';
import { errMessage } from '@/lib/errors';
import { supabaseConfigured } from '@/lib/supabase';
import { ItemFormDialog } from './ItemFormDialog';
import { ResultCard } from './ResultCard';
import { useBoards, useInspirationSearch } from './hooks';
import { SOURCES, type SearchResult, type SourceId } from './discover';

function prefillFrom(r: SearchResult) {
  const credit = [r.author, r.license].filter(Boolean).join(' · ');
  return {
    image_url: r.image_url,
    link_url: r.link_url,
    title: r.title ?? '',
    note: credit ? `${credit} (${r.source})` : `via ${r.source}`,
    tags: [r.source] as string[],
  };
}

export function DiscoverView() {
  const { data: boards } = useBoards();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [sources, setSources] = useState<SourceId[]>(SOURCES.map((s) => s.id));
  const [saveTarget, setSaveTarget] = useState<SearchResult | null>(null);

  const search = useInspirationSearch(q, sources);
  const results = useMemo(
    () => (search.data?.pages ?? []).flatMap((p) => p.results),
    [search.data],
  );
  const reports = search.data?.pages.at(-1)?.sources;

  function toggleSource(id: SourceId) {
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setQ(input.trim());
  }

  return (
    <div className="discover">
      <form className="discover-bar" onSubmit={onSubmit} role="search">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search Unsplash, Pexels, Openverse — e.g. brutalist dashboard"
          aria-label="Search for inspiration"
        />
        <button className="btn primary" type="submit" disabled={!input.trim() || sources.length === 0}>
          Search
        </button>
      </form>

      <div className="discover-sources">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`tag as-button${sources.includes(s.id) ? ' on' : ''}`}
            aria-pressed={sources.includes(s.id)}
            onClick={() => toggleSource(s.id)}
          >
            {s.label}
            {reports?.[s.id]?.error && sources.includes(s.id) && (
              <span className="tag-n" title={reports[s.id].error ?? ''}>
                {reports[s.id].error === 'not configured' ? 'no key' : 'error'}
              </span>
            )}
          </button>
        ))}
      </div>

      {!supabaseConfigured ? (
        <div className="design-empty">
          Search runs through a Supabase Edge Function — set <code>VITE_SUPABASE_URL</code> /{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> and deploy <code>design-search</code> first.
        </div>
      ) : !q ? (
        <div className="design-empty">
          Type something and hit Search. Results come from free image APIs — Dribbble, Behance and
          Pinterest aren’t reachable without a paid aggregator.
        </div>
      ) : search.isLoading ? (
        <div className="design-empty">Searching…</div>
      ) : search.error ? (
        <div className="design-empty">{errMessage(search.error, 'Search failed.')}</div>
      ) : results.length === 0 ? (
        <div className="design-empty">Nothing came back for “{q}”. Try broader words.</div>
      ) : (
        <>
          <div className="item-grid">
            {results.map((r) => (
              <ResultCard key={r.id} result={r} onSave={setSaveTarget} />
            ))}
          </div>
          {search.hasNextPage && (
            <button
              className="btn sec"
              type="button"
              style={{ alignSelf: 'center' }}
              onClick={() => void search.fetchNextPage()}
              disabled={search.isFetchingNextPage}
            >
              {search.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}

      <ItemFormDialog
        open={!!saveTarget}
        onOpenChange={(v) => !v && setSaveTarget(null)}
        boards={boards ?? []}
        prefill={saveTarget ? prefillFrom(saveTarget) : undefined}
      />
    </div>
  );
}
