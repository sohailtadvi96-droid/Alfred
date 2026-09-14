-- 0031_design_media_cap_increase.sql
-- design-ingest (Step 3 of docs/DESIGN.md) now stores original media bytes
-- unresized — resizing moved to read time via Supabase Storage's
-- image-transform endpoint, since no image codec survives the edge runtime
-- (see docs/DESIGN.md gotchas). 10MB was sized for a pre-resized 800px
-- thumbnail; a real, un-resized design asset needs more headroom.

update storage.buckets
   set file_size_limit = 26214400 -- 25 MB
 where id = 'design-media';
