-- 0008_project_brief.sql — the client's brief, kept apart from the short one-line description.
-- projects already has RLS ("projects owner all") covering every column, so nothing else to do.

alter table public.projects add column if not exists brief text;
