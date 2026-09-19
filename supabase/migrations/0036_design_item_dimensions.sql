-- 0036_design_item_dimensions.sql
-- Natural pixel dimensions of each item's cached media, parsed by design-ingest
-- straight from the downloaded bytes' file header (PNG IHDR / JPEG SOF / WebP
-- VP8-VP8L-VP8X) — no image codec survives the edge runtime (see
-- docs/DESIGN.md Gotchas), so this is the only way to learn real dimensions
-- without a read-time round trip. Lets the grid size masonry cards from the
-- real aspect ratio instead of the browser's natural-layout guess.
--
-- Nullable, and deliberately not backfilled here: existing rows predate this
-- column and stay null until (if ever) they go through design-ingest again —
-- the client falls back to its pre-existing sizing for a null width.

alter table public.design_items
  add column if not exists width integer,
  add column if not exists height integer;

alter table public.design_items
  drop constraint if exists design_items_dimensions_check;
alter table public.design_items
  add constraint design_items_dimensions_check
  check (
    (width is null) = (height is null)
    and (width is null or width > 0)
    and (height is null or height > 0)
  );
