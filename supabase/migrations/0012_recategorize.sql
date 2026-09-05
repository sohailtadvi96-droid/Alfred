-- 0012_recategorize.sql — re-run categorisation rules over transactions that
-- fell through to the fallback category. Categorisation runs at insert time, so
-- rows imported before a rule existed stay 'misc'/'person' until this is run.

create or replace function public.recategorize_all()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  with upd as (
    update public.transactions t
    set category = public.categorize(coalesce(t.merchant_raw, ''), t.direction),
        updated_at = now()
    where t.user_id = v_uid
      and (
        (t.direction = 'debit'  and t.category = 'misc') or
        (t.direction = 'credit' and t.category = 'person')
      )
      and public.categorize(coalesce(t.merchant_raw, ''), t.direction) <> t.category
    returning 1
  )
  select count(*) into v_count from upd;

  return v_count;
end;
$$;

revoke all on function public.recategorize_all() from public;
grant execute on function public.recategorize_all() to authenticated;
