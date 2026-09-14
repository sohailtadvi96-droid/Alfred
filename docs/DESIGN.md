# Design module — build plan

Scope: Alfred's Design module as a **personal reference library**. Capture is the
point. Discover, the Apify aggregator, client-facing boards and PDF export are
explicitly out of scope for this pass.

Read alongside the root `CLAUDE.md`. This document is the contract — if something
here contradicts an older note in `docs/MVP.md`, this wins.

---

## 0. Where it stands

`design_items` today is `image_url` + optional `link_url` + `tags text[]`. That is a
bookmark bucket with three weaknesses:

1. **Link rot** — hotlinked images expire or get blocked, so the library decays.
2. **Capture friction** — nothing saves to it except manual paste, so it stays empty.
3. **Recall by tag doesn't scale** — past a few hundred items you don't remember your
   own tags, you remember what the thing looked like.

Everything below exists to fix those three, in that order.

---

## 1. Target shape

```
  browser (Chrome extension)
        │  POST /functions/v1/design-capture   { page_url, image_url?, medium?, board_id? }
        ▼
  design-capture ──── insert design_items (enrich_status = 'pending') ──▶ returns 200 fast
        │
        └── waitUntil ──▶ design-ingest
                              ├─ unfurl page_url → og:image / og:video / og:video:poster
                              ├─ download media, resize, write design-media/{user}/{item}.jpg
                              ├─ vision call → caption, tags, palette
                              ├─ embedding call → vector(1536)
                              └─ update row, enrich_status = 'done'
```

Two functions, not one, so the extension never waits on a vision call.

### Data model (after 0029)

| Column | Purpose |
|---|---|
| `media_type` | `image` / `video` / `gif` — drives grid playback |
| `poster_url` | still frame for video/gif |
| `thumb_path` | path inside the private `design-media` bucket |
| `medium` | hard facet: identity / packaging / editorial / motion / type / web / illustration / other |
| `colors` | `[{"hex":"#2b1d18","pct":0.41}, …]` |
| `caption` | vision-generated description; also the embedded text |
| `embedding` | `vector(1536)`, HNSW + cosine |
| `enrich_status` | pending / running / done / failed / skipped |
| `enrich_error` | error message from the last failed enrichment attempt (Step 4); null once a run succeeds — surfaced by the retry button in Step 5 |
| `enriched_at` | timestamp of last successful enrichment |

**Inbox board.** `design_items.board_id` stays `not null` — capture never leaves an
item boardless. Instead 0029 adds `design_boards.is_inbox boolean not null default
false`, guarantees exactly one `is_inbox = true` row per user, and adds
`design_inbox_board()` (`security definer`, returns the caller's inbox board `uuid`,
creating it on first call if somehow missing). An unfiled save — no `board_id` in the
capture payload — resolves to that inbox board rather than being rejected or stored
with a null `board_id`.

---

## 2. Pre-flight

Do these before writing any code. Each one is a thing that otherwise fails halfway
through a step and costs an hour.

- [ ] Work on a branch — `design-module` — not on main.
- [ ] `supabase db pull` first, so local schema matches the deployed project. Migrations
      are immutable once pushed; you do not want to discover drift at step 3.
- [ ] Confirm `pgvector` is available on the project (Database → Extensions in the
      dashboard). It ships with Supabase Postgres, but confirm before 0029 runs.
- [ ] Set the function secrets now: `supabase secrets set OPENAI_API_KEY=…`
      (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically).
- [ ] Decide the embedding model and stick to it. The plan assumes
      `text-embedding-3-small` at 1536 dimensions — that number is baked into the
      HNSW index and changing it later means a new column, not an `alter`.

---

## 3. Steps

Each step is independently shippable. Do not start the next one until the acceptance
criteria pass — the whole reason for this ordering is that a failure at step 5 should
never make you wonder whether step 3 was wrong.

### Step 1 — Push the migrations

Copy `0029_design_enrichment.sql` and `0030_design_media_storage.sql` into
`supabase/migrations/` and push them yourself with the CLI. Don't delegate this; you
want to read any constraint error directly. (Renumbered from the plan's original
0017/0018 — those numbers were already taken by unrelated migrations shipped before
this module started; see root `CLAUDE.md`'s migration range.)

```bash
supabase db push
```

**Acceptance**
- Both migrations apply with no error.
- `design-media` bucket exists and is **not** public.
- Existing `design_items` rows all read `media_type = 'image'`, `enrich_status = 'skipped'`.
- `select count(*) from design_items where embedding is not null;` returns 0 without error
  (proves the type and index resolved).
- `design_items.image_url` is nullable.
- Exactly one `design_boards` row with `is_inbox = true` exists per user.
- `select design_inbox_board();` returns a uuid.

**If it fails:** the likeliest cause is the `extensions.vector` schema qualification. If
your project has `vector` installed into `public`, drop the `extensions.` prefix in both
the column type and the index operator class.

---

### Step 2 — `design-capture` edge function

Thin insert. No network work beyond firing the ingest call.

**Prompt for Claude Code:**

> Create a new Supabase edge function `supabase/functions/design-capture/index.ts`,
> following the same structure and CORS handling as the existing `design-search`
> function. It accepts POST JSON: `{ page_url, image_url?, link_url?, title?, medium?,
> board_id? }`. Authenticate the caller from the Authorization bearer token using the
> anon key client so RLS applies — do not use the service role here. Insert one row into
> `design_items` with `enrich_status='pending'`, `image_url` set to `image_url` if
> provided otherwise null, and `link_url` set to `page_url`. Reject the request with 400
> if both `page_url` and `image_url` are missing, and if `medium` is not one of the eight
> allowed slugs. Return `{ id }` with status 201. After the insert, invoke the
> `design-ingest` function with `{ item_id }` using `EdgeRuntime.waitUntil` so the
> response is not blocked — never `await` it.

**Acceptance**
- `curl` with a valid user JWT creates a row and returns in under ~300ms.
- A request with no auth header returns 401.
- A bad `medium` returns 400 and creates nothing.

---

### Step 3 — `design-ingest`, media only (no AI yet)

Deliberately split. Get caching correct and verified before any model call goes in, so
that when enrichment misbehaves you know the media path is sound.

**Two constraints that shape this step:**

- **No ffmpeg in edge functions.** You cannot extract a frame from a video. Poster
  frames come from metadata — `og:image`, `og:video:poster`, `twitter:image` — which
  every real video host publishes. If none is present, store the item with
  `media_type='video'` and a null `poster_url` and let the UI show a placeholder.
- **Send a real User-Agent.** A default Deno fetch gets 403'd by a good number of sites.

**Prompt for Claude Code:**

> Create `supabase/functions/design-ingest/index.ts`. It accepts `{ item_id }` and uses
> the **service role** client. Steps: load the row; set `enrich_status='running'`; if
> `image_url` is null, fetch `link_url` with a browser-like User-Agent header and parse
> Open Graph and Twitter card meta tags to find the media URL, preferring
> `og:video` → `og:image` → `twitter:image`; set `media_type` to video when an
> `og:video` or `og:video:type` is present, gif when the resolved URL ends `.gif`,
> otherwise image; set `poster_url` from `og:image` or `og:video:poster` for video
> items. Then download the resolved still image, resize it to max 800px on the long edge
> as JPEG quality 80 using the `imagescript` Deno library, and upload it to the
> `design-media` bucket at `{user_id}/{item_id}.jpg`. Write `thumb_path` back to the row
> and set `enrich_status='done'`, `enriched_at=now()`. Wrap everything so any thrown
> error sets `enrich_status='failed'` and stores the message — the row must never be
> left in `running`. Add a 20-second timeout on every outbound fetch.

**Acceptance** — save one item from each and confirm `thumb_path` is populated and the
object exists in the bucket:
- Behance project page
- Dribbble shot
- Pinterest pin
- Savee or Cosmos item
- A direct `.jpg` URL
- A `.gif`
- A Vimeo or YouTube page (expect `media_type='video'` with a poster)

Log which of these fail and on what. That list, not a guess, decides whether you ever
need a headless-browser fallback — and for which two or three domains.

---

### Step 4 — Enrichment inside `design-ingest`

Only once step 3's acceptance list is green.

**Prompt for Claude Code:**

> Extend `design-ingest`: after the thumbnail is written, send the resized image to a
> vision model and ask for strict JSON — `{ caption, tags, medium, colors }` where
> caption is one sentence describing subject, style and mood; tags is 5–10 lowercase
> single-or-two-word terms; medium is one of the eight allowed slugs; colors is the 5
> dominant colours as `[{hex, pct}]` sorted by pct descending. Parse defensively —
> strip markdown fences, and on a parse failure keep the thumbnail and set
> `enrich_status='failed'` rather than discarding the row. Only set `medium` if the row
> doesn't already have one, since a medium chosen in the extension is the user's
> explicit choice and outranks the model. Merge model tags into the existing `tags`
> array without duplicating. Then embed `caption + ' ' + tags.join(' ')` with
> `text-embedding-3-small` and write it to `embedding`.

**Acceptance**
- Ten saved items all reach `done` with non-null `caption`, `colors`, `embedding`.
- An item saved with an explicit medium keeps it.
- Read the ten captions. If they're vague, fix the prompt now — every search you run
  later is only as good as these.

---

### Step 5 — Frontend states

**Prompt for Claude Code:**

> Update `src/features/design/` and `DesignBoardPage`: items with
> `enrich_status='pending'` or `'running'` render a shimmer placeholder; `'failed'`
> renders with a retry button that re-invokes `design-ingest`. Load thumbnails from
> `thumb_path` via `createSignedUrls` in a single batched call per page of results,
> falling back to `image_url` when `thumb_path` is null. Add a medium filter row.
> Poll or subscribe so a pending item resolves without a manual refresh.

**Acceptance**
- Saving from the extension makes an item appear within a couple of seconds and resolve
  on its own.
- A failed item is visibly failed and retryable.
- No broken image icons anywhere.

---

### Step 6 — Extension

Load `alfred-clipper` unpacked, fill in the options page, then run the step 3 site list
again but through the real right-click flow.

**Acceptance**
- Tick badge on success, error notification with a readable message on failure.
- Close the browser, reopen a day later, save again — it must still work, proving the
  refresh-token path.
- Medium submenu sets the medium on the row.

---

### Step 7 — Semantic search

**Prompt for Claude Code:**

> Add a migration with an RPC `design_search(query_embedding vector(1536), match_count
> int, board_filter uuid default null, medium_filter text default null)` returning
> items ordered by cosine distance, filtered to `auth.uid()`. Add a `design-embed-query`
> edge function that embeds a text query with the same model. Wire a search input on
> `DesignPage` that embeds the query and calls the RPC, with the medium chips as
> additional filters.

**Acceptance**
- A query describing something by appearance rather than by its tags returns it.
- Medium filter and search compose correctly.

---

### Step 8 — Motion playback

**Prompt for Claude Code:**

> In the board grid, `media_type='video'` items render `poster_url` (or the cached
> thumbnail) and swap to a muted, looping, `playsinline` autoplay video on hover, or on
> tap for touch. Only one plays at a time. `gif` items show the static thumbnail and
> swap to the original on hover.

---

### Step 9 — Orphan sweep

Schedule a `pg_cron` job to drain `design_media_orphans` — read paths, delete the
storage objects, delete the rows. Weekly is plenty.

---

## 4. Gotchas, collected

- **Never edit a pushed migration.** Add `NNNN_`.
- **`EdgeRuntime.waitUntil` is required** for the capture → ingest handoff. Without it
  the function terminates when it returns the response and the ingest call is killed
  mid-flight.
- **Service role stays server-side.** `design-capture` runs under the user's JWT so RLS
  applies; only `design-ingest` uses the service role, and it must scope every write by
  the row's own `user_id`.
- **Instagram will not unfurl.** It's login-walled. Accept it or save the image directly
  via right-click.
- **Signed URLs expire.** Batch them per page and set a sane TTL — an hour is fine.
- **Don't cache source video.** Thumbnails and posters only; the 10MB bucket cap in 0030
  enforces this.

---

## 5. Parked

Not in this pass, in rough order of when they'd become worth it:

- Discover / Apify multi-site search — reconsider only if step 3's failure list shows
  several domains needing a headless fallback, at which point it becomes the unfurl
  escape hatch rather than a search feature.
- Board → moodboard PDF export.
- Boards linked to `projects` for client work.
- Duplicate detection via perceptual hash.
- Re-enrich sweep for the `skipped` legacy rows.
