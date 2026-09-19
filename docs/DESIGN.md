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
                              ├─ download media as-is, write design-media/{user}/{item}.{ext}
                              ├─ vision call → caption, tags, palette
                              ├─ embedding call → vector(1536)
                              └─ update row, enrich_status = 'done'
```

Two functions, not one, so the extension never waits on a vision call. No resize step —
resizing is a read-time concern (§1 Data model note on `thumb_path`, Step 5).

### Data model (after 0029)

| Column | Purpose |
|---|---|
| `media_type` | `image` / `video` / `gif` — drives grid playback |
| `poster_url` | still frame for video/gif |
| `thumb_path` | path inside the private `design-media` bucket — the **original**, unresized bytes (no codec survives the edge runtime to resize on ingest; see Gotchas). Despite the name, this is not a thumbnail — request a rendition via Storage's image-transform endpoint at read time instead of serving this path directly. |
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

**Prompt for Claude Code** (superseded — kept for history; see the note below it for
what actually shipped):

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

**What actually shipped, and why it differs:** no codec (WASM `imagescript`, native
`createImageBitmap`/`OffscreenCanvas`) survives this edge runtime — see Gotchas. Resize
was moved to read time instead: `design-ingest` downloads the resolved still and uploads
it **unresized** to `{user_id}/{item_id}.{ext}` (`ext` from the response's declared
content-type — jpeg/png/webp, or gif since 0032/Step 5's GIF fix), and callers request a
sized rendition from Supabase Storage's image-transform endpoint
(`/storage/v1/render/image/authenticated/design-media/{path}?width=&quality=`) rather
than reading `thumb_path` directly. A gif is stored as-is too — no thumbnailing attempt
on ingest. The transform endpoint is tried first for a static frame at read time (grid,
vision model); confirmed by testing that it doesn't actually work on a real animated
gif (`.download()` with `transform` throws), so both fall back to the original animated
file — the grid renders it directly, the vision model gets it raw (worked fine in
testing on a 6MB file, tags/caption came back sensible).

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

> Extend `design-ingest`: after `thumb_path` is written, request a transformed
> rendition from Storage's image-transform endpoint
> (`/storage/v1/render/image/authenticated/design-media/{thumb_path}?width=800`) —
> **not** the stored original, which is unresized and can be several MB — and send that
> to a vision model. Ask for strict JSON — `{ caption, tags, medium, colors }` where
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

**Shipped.** Beyond the original prompt below, also folded in four display-side issues
deferred from Step 3: cards with no image at all (not just a failed load) now get the
same graceful placeholder as a broken `<img>`; a video item's still (poster_url, or the
cached thumb once it exists) renders with no playback attempt (Step 8's job); every card
shows its source domain, computed client-side from `link_url`/`image_url` rather than
trusting the stored `source` column (extension-captured rows never had it set); gif
thumb_paths are excluded from the transformed batch entirely and get a plain signed URL
instead, since 0032's testing already showed the transform endpoint doesn't work on a
real animated gif — the grid renders the gif directly, same fallback the vision call
uses. **Correction (post-launch):** the original prompt below asks for one batched
`createSignedUrls` call per page — the installed `@supabase/storage-js` never forwards a
`transform` option on that batched method at all (only the singular `createSignedUrl`
does), so a batched call here silently served full-size originals instead of grid-sized
renditions. `signedUrlsFor` now calls `createSignedUrl` once per path instead — still
split by transform option (transformable vs. gif), just no longer one network call per
page. Also fixed a bug this step's own polling would have surfaced immediately: manual
saves via "Add reference" never go through design-ingest, so they now insert with
`enrich_status='skipped'` (0029's own convention for pre-pipeline rows) instead of
inheriting the column's `'pending'` default and sitting in the new shimmer state forever.
The retry button does **not** call `design-ingest` directly — it goes through a new
`design-retry` function instead; see the Gotchas entry below for why and how.

**Prompt for Claude Code** (original scope — see above for what was added):

> Update `src/features/design/` and `DesignBoardPage`: items with
> `enrich_status='pending'` or `'running'` render a shimmer placeholder; `'failed'`
> renders with a retry button that re-invokes `design-ingest`. Load thumbnails from
> `thumb_path` via `createSignedUrls` in a single batched call per page of results —
> `thumb_path` holds the original, unresized upload (Step 3), so request a **transformed**
> rendition at grid size (`{ transform: { width: <grid tile px>, quality: 70 } }`), not
> the original — falling back to `image_url` when `thumb_path` is null. Add a medium
> filter row. Poll or subscribe so a pending item resolves without a manual refresh.

**Acceptance**
- Saving from the extension makes an item appear within a couple of seconds and resolve
  on its own.
- A failed item is visibly failed and retryable.
- No broken image icons anywhere.

**Verification note:** type-checked clean (`tsc --noEmit`) and every changed/new file
transforms cleanly through Vite's own dev pipeline (checked directly — not just that the
dev server boots). Could not visually verify in an authenticated browser session — this
app requires a real login and I don't have (and shouldn't ask for) the credentials. If
something looks off once you're in the UI, that's the gap to check first.

**This didn't hold up:** `tsc -b` was later found broken on `main` against the installed
`@supabase/storage-js@2.112.4` — its batched `createSignedUrls` doesn't type (or run) with
a `transform` option — so this step's build was never actually green against the
dependency versions checked into `package-lock.json`. See the correction above.

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
- **Don't cache source video.** Thumbnails and posters only; the bucket's 25MB
  per-object cap (0031, raised from 0030's original 10MB once ingest started storing
  full unresized originals — see below) still isn't sized for source video.
- **`design-ingest` needs `verify_jwt = false`** in `supabase/config.toml` — it's invoked
  machine-to-machine by `design-capture` with the service-role key purely to pass the
  platform gate, and does its own auth internally. Left at the CLI's default (`true`,
  since an unlisted function gets no explicit block), every invoke 401s before any of
  its code runs — and since `fetch()` only rejects on network errors, not HTTP error
  statuses, a bare `.catch()` on the invoke call never even logs it. Rows land in
  `design_items` at `enrich_status='pending'` and stay there forever with no error
  recorded. Check `supabase functions list` for `"verify_jwt"` on every new function.
- **No image codec survives this edge runtime — resize moved to read time,
  permanently, by decision.** `imagescript` (both `deno.land/x` and `npm:` forms)
  crashes the function on invoke (`BOOT_ERROR` / `WORKER_ERROR`) even with a bare
  `import` and no usage — confirmed by bisecting an import-only build against a
  no-imagescript baseline. The WASM-free alternative doesn't pan out either:
  `createImageBitmap` exists as a global here, but `OffscreenCanvas` does not
  (`typeof OffscreenCanvas === 'function'` is `false`), so there's no way to draw a
  decoded bitmap anywhere or re-encode it — confirmed by a probe deploy. Given both dead
  ends, the decision is: `design-ingest` stores the fetched bytes **unresized**
  (jpeg/png/webp/gif — 0032 added gif to the bucket's mime allowlist once it was clear
  no codec would ever re-encode one anyway), and every read requests a sized rendition
  from Storage's image-transform endpoint
  (`/storage/v1/render/image/authenticated/design-media/{path}?width=&quality=`) instead
  — confirmed available on this project's plan (an authenticated request against a real
  path reached actual object-resolution logic — a plan-gated project errors before that
  point). 0031 raised the bucket's per-object cap from 10MB to 25MB accordingly. Despite
  its name, `thumb_path` now holds the original, not a thumbnail — see §1 Data model.
- **Behance 403s the ingest fetch even with a full browser header set** (`User-Agent`,
  `Accept`, `Accept-Language`, `Referer` all set) — confirmed candidate for the
  headless-browser fallback mentioned in Step 3's acceptance notes, not just a missing
  header. Untested whether it's TLS fingerprinting, a Cloudflare/Akamai challenge, or a
  cookie/JS requirement; whichever it is, no amount of static header tuning fixed it.
- **YouTube 429-rate-limits Supabase's egress IP on repeated fetches.** A plain curl
  from an ordinary residential/dev connection gets clean 200s on the same URL, every
  time; the same URL fetched from `design-ingest` got 429 on every attempt in a row —
  Supabase's shared edge egress IPs look to be under enough load from other tenants'
  functions hitting YouTube that it's actively throttling them, independent of anything
  this function does. Noted only, not fixed. Worth remembering for Step 4: adding a
  vision-model call per item is more outbound volume per save, and if that pushes
  through the same egress path it's more exposure to this, not less.
- **Fixed: `design-ingest` was reachable by anyone with the URL, for any `item_id`, no
  auth at all.** `verify_jwt = false` has to stay (it's machine-to-machine, no user
  session in play), but the platform gate being off isn't the same as no gate — the
  handler now checks its own `Authorization` header against `SUPABASE_SERVICE_ROLE_KEY`
  and returns 403 on anything else (confirmed: both a missing header and a wrong bearer
  value get rejected). The exposure had gotten more reachable than when it was first
  flagged in Step 3 — Step 5's retry button called this function straight from the
  browser — which is what made fixing it now, not later. Frontend retry no longer talks
  to `design-ingest` at all: it calls a new **`design-retry`** function
  (`verify_jwt = true`), which runs under the caller's own JWT, does an RLS-scoped
  `update(...).eq('id', item_id).select().single()` (ownership check and the
  `enrich_status='running'` transition in one round trip — zero rows back means it
  isn't the caller's item, 404, not a distinguishable-from-nonexistent leak), and only
  then hands off to `design-ingest` server-side with the service-role key, same pattern
  as design-capture's original handoff. A browser holding only a user JWT now has no
  path to `design-ingest` at all.

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
