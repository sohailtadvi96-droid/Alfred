-- 0032_design_media_allow_gif.sql
-- design-ingest now stores gif items as-is (no thumbnailing attempt — no
-- codec in this runtime can re-encode one anyway, see docs/DESIGN.md
-- gotchas) instead of failing them outright. The bucket's mime allowlist
-- had no room for the format it was rejecting.

update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'image/gif')
 where id = 'design-media'
   and not ('image/gif' = any(allowed_mime_types));
