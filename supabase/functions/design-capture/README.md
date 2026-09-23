# design-capture

Thin insert for the Design module's capture flow (Step 2 of `docs/DESIGN.md`).
No network work beyond firing `design-ingest` — that's what keeps a capture
fast regardless of how slow enrichment is.

Runs under the **caller's own JWT** (anon key client, RLS applies) — never
the service role. Only `design-ingest` (Step 3) uses the service role.

## Deploy

```bash
supabase functions deploy design-capture
```

No secrets of its own; `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## Request / response

```jsonc
// POST body
{ "page_url": "https://dribbble.com/shots/...", "image_url": "https://...", "medium": "editorial", "board_id": "..." }

// 201 — also_in is the board the item was cross-listed into, or null
{ "id": "...", "also_in": null }

// 400 — both page_url and image_url missing, or medium not one of the
// eight allowed slugs (identity/packaging/editorial/motion/type/web/
// illustration/other)
{ "error": "..." }

// 401 — no Authorization header
{ "error": "Missing Authorization header." }
```

Boards: `board_id` is the item's home — the caller's explicit `board_id`, else the
inbox. With an explicit `medium` and no `board_id`, the item is *additionally*
cross-listed (a `design_item_boards` row, 0037) into the existing board whose name
matches the medium case-insensitively; no match means no cross-listing, no board is
ever created, and a failed cross-listing is logged, not surfaced. Capture-time only —
`design-ingest` classifying a medium later never adds or moves anything.

Inserts one `design_items` row with `enrich_status='pending'`, then invokes
`design-ingest` with `{ item_id }` via `EdgeRuntime.waitUntil` — fire and
forget, never awaited, so a slow or missing `design-ingest` never blocks or
fails the 201.

## Depends on

Migration(s) adding `enrich_status`, `medium`, and relaxing `design_items`'s
`image_url`/`board_id` `NOT NULL` constraints (`docs/DESIGN.md` §1, Step 1).
Not present in this repo yet — see note below.
