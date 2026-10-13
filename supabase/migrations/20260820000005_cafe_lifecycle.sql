-- Run once in Supabase SQL Editor after tenant-isolation.sql.
-- The function is callable only by the authenticated Superadmin and removes a
-- cafe's database records and Auth users together.
create or replace function public.delete_cafe_tenant(p_cafe_id text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_slug text;
  v_user_ids uuid[];
  v_table text;
begin
  if public.get_user_role() <> 'superadmin' then
    raise exception 'Only Super Admin can delete a cafe.' using errcode = '42501';
  end if;
  select slug into v_slug from public.cafes where id = p_cafe_id for update;
  if v_slug is null then raise exception 'Cafe not found.' using errcode = 'P0002'; end if;

  select array_agg(id) into v_user_ids from public.user_roles
  where cafe_id = p_cafe_id or lower(cafe_slug) = lower(v_slug);

  foreach v_table in array array['menu_items', 'orders', 'tables', 'payment_options', 'settings', 'audit_logs', 'push_subscriptions', 'inventory'] loop
    if to_regclass(format('public.%I', v_table)) is not null
       and exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = v_table and c.column_name = 'cafe_slug') then
      execute format('delete from public.%I where lower(cafe_slug) = lower($1)', v_table) using v_slug;
    end if;
  end loop;

  if to_regclass('public.subscription_requests') is not null then
    delete from public.subscription_requests where cafe_id = p_cafe_id or lower(cafe_slug) = lower(v_slug);
  end if;
  delete from public.user_roles where cafe_id = p_cafe_id or lower(cafe_slug) = lower(v_slug);
  delete from public.cafes where id = p_cafe_id;
  if v_user_ids is not null then delete from auth.users where id = any(v_user_ids); end if;
end;
$$;

revoke all on function public.delete_cafe_tenant(text) from public, anon;
grant execute on function public.delete_cafe_tenant(text) to authenticated;

-- Permanently remove historical demo data. This is deliberately destructive.
do $$
declare
  v_demo_id text;
  v_demo_users uuid[];
  v_table text;
begin
  select id into v_demo_id from public.cafes where lower(slug) = 'demo-cafe';
  select array_agg(id) into v_demo_users from public.user_roles where lower(cafe_slug) = 'demo-cafe';
  foreach v_table in array array['menu_items', 'orders', 'tables', 'payment_options', 'settings', 'audit_logs', 'push_subscriptions', 'inventory'] loop
    if to_regclass(format('public.%I', v_table)) is not null
       and exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = v_table and c.column_name = 'cafe_slug') then
      execute format('delete from public.%I where lower(cafe_slug) = ''demo-cafe''', v_table);
    end if;
  end loop;
  if to_regclass('public.subscription_requests') is not null then delete from public.subscription_requests where lower(cafe_slug) = 'demo-cafe'; end if;
  delete from public.user_roles where lower(cafe_slug) = 'demo-cafe';
  if v_demo_id is not null then delete from public.cafes where id = v_demo_id; end if;
  if v_demo_users is not null then delete from auth.users where id = any(v_demo_users); end if;
end $$;
