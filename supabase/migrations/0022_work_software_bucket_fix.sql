-- 0022_work_software_bucket_fix.sql
-- 0021 proposed work_software = 'need' (freelance business tooling, not
-- personal consumption — see the Phase 5 conversation) but the seed list
-- omitted it, so it came back null instead. Fixing the miss.

update public.categories set bucket = 'need'
where user_id is null and kind = 'expense' and slug = 'work_software';
