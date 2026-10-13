-- A package can only reference active capabilities in the Supabase catalog.
-- This closes the gap between the Super Admin UI validation and direct REST
-- writes, so no client can assign invented feature keys.
create or replace function public.validate_package_feature_catalog()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invalid text[];
begin
  new.features := coalesce(new.features, '[]'::jsonb);
  if jsonb_typeof(new.features) <> 'array' then
    raise exception 'Package features must be a JSON array.' using errcode = '22023';
  end if;

  select array_agg(feature_key order by feature_key)
  into v_invalid
  from (
    select distinct value as feature_key
    from jsonb_array_elements_text(new.features)
  ) requested
  left join public.features catalog
    on catalog.key = requested.feature_key and catalog.enabled
  where catalog.key is null;

  if coalesce(array_length(v_invalid, 1), 0) > 0 then
    raise exception 'Unknown or disabled package features: %', array_to_string(v_invalid, ', ')
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists packages_validate_feature_catalog on public.packages;
create trigger packages_validate_feature_catalog
  before insert or update of features on public.packages
  for each row execute function public.validate_package_feature_catalog();

-- Feature availability is enforced in the same Supabase source used for the
-- public packages section and Super Admin package editor.
create or replace function public.cafe_feature_enabled(p_cafe_slug text, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscription_requests subscription
    join public.packages package on package.id = subscription.plan_key
    join public.features feature on feature.key = p_feature and feature.enabled
    where lower(coalesce(subscription.cafe_slug, '')) = lower(p_cafe_slug)
      and lower(coalesce(subscription.status, '')) in ('active', 'approved')
      and lower(coalesce(package.status, '')) = 'active'
      and package.features ? p_feature
  )
$$;

-- Complete database and Auth cleanup. Storage is removed by the trusted
-- delete-cafe Edge Function before this transactional RPC runs.
drop function if exists public.delete_cafe_tenant(text);
create or replace function public.delete_cafe_tenant(p_cafe_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_slug text;
  v_user_ids uuid[];
  v_table text;
  v_has_cafe_id boolean;
  v_has_cafe_slug boolean;
  v_remaining_cafes bigint;
  v_remaining_roles bigint;
  v_remaining_subscriptions bigint;
  v_remaining_users bigint;
begin
  if public.get_user_role() <> 'superadmin' then
    raise exception 'Only Super Admin can delete a cafe.' using errcode = '42501';
  end if;

  select slug into v_slug from public.cafes where id = p_cafe_id for update;
  if v_slug is null then
    raise exception 'Cafe not found.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_user_ids
  from public.user_roles
  where cafe_id = p_cafe_id or lower(coalesce(cafe_slug, '')) = lower(v_slug);

  -- Remove every current and future public tenant table that declares either
  -- tenant key. Platform catalogs are explicitly excluded.
  for v_table in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name not in ('cafes', 'user_roles', 'subscription_requests', 'packages', 'features')
  loop
    select exists (
      select 1 from information_schema.columns column_info
      where column_info.table_schema = 'public' and column_info.table_name = v_table and column_info.column_name = 'cafe_id'
    ), exists (
      select 1 from information_schema.columns column_info
      where column_info.table_schema = 'public' and column_info.table_name = v_table and column_info.column_name = 'cafe_slug'
    ) into v_has_cafe_id, v_has_cafe_slug;

    if v_has_cafe_id and v_has_cafe_slug then
      execute format('delete from public.%I where cafe_id = $1 or lower(coalesce(cafe_slug, '''')) = lower($2)', v_table)
        using p_cafe_id, v_slug;
    elsif v_has_cafe_id then
      execute format('delete from public.%I where cafe_id = $1', v_table) using p_cafe_id;
    elsif v_has_cafe_slug then
      execute format('delete from public.%I where lower(coalesce(cafe_slug, '''')) = lower($1)', v_table) using v_slug;
    end if;
  end loop;

  delete from public.subscription_requests
  where cafe_id = p_cafe_id or lower(coalesce(cafe_slug, '')) = lower(v_slug);
  delete from public.user_roles
  where cafe_id = p_cafe_id or lower(coalesce(cafe_slug, '')) = lower(v_slug);
  delete from public.cafes where id = p_cafe_id;
  delete from auth.users where id = any(v_user_ids);

  select count(*) into v_remaining_cafes from public.cafes
  where id = p_cafe_id or lower(coalesce(slug, '')) = lower(v_slug);
  select count(*) into v_remaining_roles from public.user_roles
  where cafe_id = p_cafe_id or lower(coalesce(cafe_slug, '')) = lower(v_slug);
  select count(*) into v_remaining_subscriptions from public.subscription_requests
  where cafe_id = p_cafe_id or lower(coalesce(cafe_slug, '')) = lower(v_slug);
  select count(*) into v_remaining_users from auth.users where id = any(v_user_ids);

  if v_remaining_cafes > 0 or v_remaining_roles > 0 or v_remaining_subscriptions > 0 or v_remaining_users > 0 then
    raise exception 'Tenant deletion verification failed.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'cafeSlug', v_slug,
    'usersDeleted', coalesce(array_length(v_user_ids, 1), 0),
    'remainingCafes', v_remaining_cafes,
    'remainingUserRoles', v_remaining_roles,
    'remainingSubscriptions', v_remaining_subscriptions,
    'remainingAuthUsers', v_remaining_users
  );
end;
$$;

revoke all on function public.delete_cafe_tenant(text) from public, anon;
grant execute on function public.delete_cafe_tenant(text) to authenticated;
