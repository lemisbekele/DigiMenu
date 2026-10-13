-- =============================================================
-- 20260820000009_feature_catalog_and_cafe_delete.sql
--
-- 1. Adds the `features` catalog table — the authoritative list of
--    platform features. Package entitlements (packages.features) must
--    reference keys from this catalog, and every surface (Super Admin
--    Packages, #packages pricing, cafe-admin permissions, RLS) consumes
--    the same source.
-- 2. Replaces `delete_cafe_tenant` with a comprehensive version that
--    removes every cafe-scoped record (any table carrying cafe_slug),
--    subscriptions, roles, the cafe row and the associated Supabase
--    Auth users, then verifies nothing remains and returns a summary.
-- 3. Ensures `packages` and `features` are replicated for realtime.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Features catalog — single source of truth for feature identity.
-- ---------------------------------------------------------------
create table if not exists public.features (
  key text primary key,
  name text not null,
  description text not null default '',
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed the catalog with the features that actually exist in the
-- application (verified against FEATURE_REGISTRY in planService.js).
insert into public.features (key, name, description, enabled, updated_at)
values
  ('digitalMenu',     'Digital Menu',                'Digital menu with calories, customizations and QR table access.', true, now()),
  ('ordering',        'Online Ordering',             'Cart, checkout and customer order tracking.', true, now()),
  ('staffAccess',     'Staff Access',                'Role-based staff consoles and secure login.', true, now()),
  ('kds',             'Kitchen Display System',      'Kitchen Display System with timers, stations and ready-to-serve flow.', true, now()),
  ('orderHistory',    'Kitchen Order History',       'Browse completed kitchen orders with item breakdowns.', true, now()),
  ('cashierPos',      'Cashier POS',                 'Cashier POS with bank proof upload and payment approval.', true, now()),
  ('inventory',       'Inventory Management',        'Track stock, low-stock alerts and supplier costs.', true, now()),
  ('notifications',   'Notifications & Order Alerts','Real-time order alerts, push notifications and announcements.', true, now()),
  ('analytics',       'Dashboard & Analytics',       'Sales dashboards, reports and trend analysis.', true, now()),
  ('menuManagement',  'Menu Management',             'Create, edit and organize menu items with pricing and availability.', true, now()),
  ('tables',          'Table Management',            'Manage tables, QR codes and table assignments.', true, now()),
  ('settings',        'Cafe Settings',               'Billing settings, payment options and cafe configuration.', true, now()),
  ('userManagement',  'User Management',             'Create staff accounts, assign roles and manage access.', true, now()),
  ('auditLogs',       'Audit Logs',                  'Full audit trail of platform and cafe activity.', true, now()),
  ('multiLanguage',   'Multi-Language',              'English, Amharic and Afaan Oromo language support.', true, now())
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  enabled = excluded.enabled,
  updated_at = excluded.updated_at;

-- RLS: everyone can read the catalog (pricing/package management), only
-- Super Admin can write it.
alter table public.features enable row level security;
drop policy if exists "features_read_public" on public.features;
create policy "features_read_public" on public.features
  for select using (true);
drop policy if exists "features_write_superadmin" on public.features;
create policy "features_write_superadmin" on public.features
  for insert with check (public.get_user_role() = 'superadmin');
drop policy if exists "features_update_superadmin" on public.features;
create policy "features_update_superadmin" on public.features
  for update using (public.get_user_role() = 'superadmin');

-- Keep package entitlements aligned with the catalog: any package feature
-- key must exist in the catalog. Purge stale keys from every package.
update public.packages
set features = (
  select coalesce(jsonb_agg(f), '[]'::jsonb)
  from jsonb_array_elements_text(packages.features) f
  where exists (select 1 from public.features where key = f)
)
where features is not null;

-- ---------------------------------------------------------------
-- 2. Comprehensive cafe deletion
-- ---------------------------------------------------------------
-- The previous version returned void; drop it so the return type can change.
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
  v_remaining_cafes bigint;
  v_remaining_roles bigint;
  v_remaining_subs bigint;
  v_remaining_users bigint;
begin
  if public.get_user_role() <> 'superadmin' then
    raise exception 'Only Super Admin can delete a cafe.' using errcode = '42501';
  end if;

  select slug into v_slug from public.cafes where id = p_cafe_id for update;
  if v_slug is null then
    raise exception 'Cafe not found.' using errcode = 'P0002';
  end if;

  -- All users belonging to the cafe (owner/admin + staff).
  select coalesce(array_agg(id), '{}'::uuid[]) into v_user_ids
  from public.user_roles
  where cafe_id = p_cafe_id or lower(coalesce(cafe_slug, '')) = lower(v_slug);

  -- Every table that carries a cafe_slug column gets its cafe rows removed.
  -- This is future-proof: newly added tenant tables are covered automatically
  -- and no cafe-scoped record can be orphaned.
  for v_table in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'cafe_slug'
    order by c.table_name
  loop
    execute format(
      'delete from public.%I where lower(coalesce(cafe_slug, '''')) = lower($1)',
      v_table
    ) using v_slug;
  end loop;

  -- Subscription / package assignment records.
  delete from public.subscription_requests
  where cafe_id = p_cafe_id or lower(coalesce(cafe_slug, '')) = lower(v_slug);

  -- Roles and the cafe itself.
  delete from public.user_roles
  where cafe_id = p_cafe_id or lower(coalesce(cafe_slug, '')) = lower(v_slug);
  delete from public.cafes where id = p_cafe_id;

  -- Supabase Auth accounts of the deleted cafe (owner + staff).
  if v_user_ids is not null and array_length(v_user_ids, 1) > 0 then
    delete from auth.users where id = any(v_user_ids);
  end if;

  -- Verification: nothing may remain for this cafe anywhere.
  select count(*) into v_remaining_cafes
  from public.cafes where id = p_cafe_id or lower(coalesce(slug, '')) = lower(v_slug);
  select count(*) into v_remaining_roles
  from public.user_roles
  where cafe_id = p_cafe_id or lower(coalesce(cafe_slug, '')) = lower(v_slug);
  select count(*) into v_remaining_subs
  from public.subscription_requests
  where cafe_id = p_cafe_id or lower(coalesce(cafe_slug, '')) = lower(v_slug);
  select count(*) into v_remaining_users
  from auth.users where id = any(coalesce(v_user_ids, '{}'::uuid[]));

  return jsonb_build_object(
    'cafeSlug', v_slug,
    'usersDeleted', coalesce(array_length(v_user_ids, 1), 0),
    'remainingCafes', v_remaining_cafes,
    'remainingUserRoles', v_remaining_roles,
    'remainingSubscriptions', v_remaining_subs,
    'remainingAuthUsers', v_remaining_users
  );
end;
$$;

revoke all on function public.delete_cafe_tenant(text) from public, anon;
grant execute on function public.delete_cafe_tenant(text) to authenticated;

-- ---------------------------------------------------------------
-- 3. Realtime — packages and features must replicate so the Super Admin
--    Packages page, the #packages pricing section and cafe entitlements
--    all update without a manual refresh.
-- ---------------------------------------------------------------
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array['packages', 'features'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', relation_name);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;