-- DigiMenu tenant isolation hardening.
-- Run after supabase-migration.sql in the hosted Supabase project.
-- Existing rows without a tenant remain unassigned and are inaccessible until
-- they are migrated to a real cafe. New writes must carry cafe_slug.

create table if not exists public.cafes (
  id text primary key,
  name text not null,
  slug text not null unique,
  owner_email text default '',
  subscription_id text,
  status text not null default 'active' check (status in ('active', 'suspended', 'pending', 'rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  status_updated_at timestamptz
);
create unique index if not exists cafes_slug_lower_idx on public.cafes (lower(slug));

alter table public.user_roles add column if not exists cafe_id text;

-- A user, cafe, and subscription share the same immutable cafe_id. Keep the
-- legacy cafe_slug only for routing and backfill existing records before the
-- application switches to cafe_id as the access-control source of truth.
update public.user_roles roles
set cafe_id = cafes.id
from public.cafes cafes
where roles.cafe_id is null
  and lower(roles.cafe_slug) = lower(cafes.slug);

do $$
begin
  if to_regclass('public.subscription_requests') is not null then
    alter table public.subscription_requests add column if not exists cafe_id text;
    alter table public.subscription_requests add column if not exists cafe_slug text;
    update public.subscription_requests requests
    set cafe_id = cafes.id
    from public.cafes cafes
    where requests.cafe_id is null
      and lower(requests.cafe_slug) = lower(cafes.slug);
  end if;
end $$;

-- Older approved requests may predate the cafes registry. Register only
-- approved/active subscriptions, then bind both the request and its admin to
-- that canonical cafe. Pending, rejected, and expired requests stay invalid.
do $$
begin
  if to_regclass('public.subscription_requests') is not null then
    insert into public.cafes (
      id, name, slug, owner_email, subscription_id, status, created_at
    )
    select
      coalesce(nullif(requests.cafe_id, ''), 'cafe_sub_' || requests.id),
      coalesce(nullif(requests.customer_name, ''), requests.cafe_slug),
      lower(trim(requests.cafe_slug)),
      coalesce(requests.email, ''),
      requests.id,
      'active',
      coalesce(requests.requested_at, now())
    from public.subscription_requests requests
    where lower(coalesce(requests.status, '')) in ('approved', 'active')
      and nullif(trim(requests.cafe_slug), '') is not null
    on conflict (slug) do update
      set owner_email = excluded.owner_email,
          subscription_id = excluded.subscription_id,
          status = 'active';

    update public.subscription_requests requests
    set cafe_id = cafes.id
    from public.cafes cafes
    where lower(requests.cafe_slug) = lower(cafes.slug)
      and (requests.cafe_id is null or requests.cafe_id <> cafes.id);

    update public.user_roles roles
    set cafe_id = cafes.id
    from public.cafes cafes
    where lower(roles.cafe_slug) = lower(cafes.slug)
      and (roles.cafe_id is null or roles.cafe_id <> cafes.id);
  end if;
end $$;

-- Route and access state are refreshed from these authoritative tables. The
-- publication is required before Postgres Changes listeners can receive them.
do $$
begin
  if to_regclass('public.cafes') is not null then
    begin
      alter publication supabase_realtime add table public.cafes;
    exception when duplicate_object then null;
    end;
  end if;
  if to_regclass('public.subscription_requests') is not null then
    begin
      alter publication supabase_realtime add table public.subscription_requests;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

alter table public.cafes enable row level security;
drop policy if exists "cafes_read_public" on public.cafes;
create policy "cafes_read_public" on public.cafes for select using (true);
drop policy if exists "cafes_write_superadmin" on public.cafes;
create policy "cafes_write_superadmin" on public.cafes
  for insert to authenticated with check (public.get_user_role() = 'superadmin');
drop policy if exists "cafes_update_superadmin" on public.cafes;
create policy "cafes_update_superadmin" on public.cafes
  for update to authenticated
  using (public.get_user_role() = 'superadmin')
  with check (public.get_user_role() = 'superadmin');
drop policy if exists "cafes_delete_superadmin" on public.cafes;
create policy "cafes_delete_superadmin" on public.cafes
  for delete to authenticated using (public.get_user_role() = 'superadmin');

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array['menu_items', 'orders', 'payment_options', 'settings', 'audit_logs', 'push_subscriptions'] loop
    if to_regclass(format('public.%s', v_table_name)) is not null
       and not exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and information_schema.columns.table_name = v_table_name and column_name = 'cafe_slug'
       ) then
      execute format('alter table public.%I add column cafe_slug text', v_table_name);
      execute format('create index if not exists %I on public.%I (cafe_slug)', v_table_name || '_cafe_slug_idx', v_table_name);
    end if;
  end loop;
end $$;

-- Remove the older role-only/permissive policies before the tenant policies
-- below are evaluated. PostgreSQL combines policies with OR semantics.
do $$
declare
  v_policy_name text;
  v_table_name text;
begin
  foreach v_table_name in array array['menu_items', 'orders', 'payment_options', 'settings', 'audit_logs', 'push_subscriptions'] loop
    foreach v_policy_name in array array[
      'menu_items_read_public', 'menu_items_write_staff', 'menu_items_update_staff', 'menu_items_delete_staff',
      'orders_insert_public', 'orders_read_staff', 'orders_update_staff', 'orders_delete_admin',
      'payment_options_read_staff', 'payment_options_write_staff', 'payment_options_update_staff', 'payment_options_delete_staff',
      'settings_read_staff', 'settings_write_staff', 'settings_update_staff',
      'audit_logs_insert_staff', 'audit_logs_read_staff', 'push_subscriptions_write_staff', 'push_subscriptions_read_staff'
    ] loop
      execute format('drop policy if exists %I on public.%I', v_policy_name, v_table_name);
    end loop;
  end loop;
end $$;

-- The authenticated user's tenant is the only tenant visible to cafe staff.
-- Super Admin retains platform-wide access. Public customer menu reads remain
-- available through the app's cafe-scoped query, while authenticated staff
-- access is always constrained by get_user_cafe_slug().
do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array['menu_items', 'orders', 'tables', 'payment_options', 'settings', 'audit_logs', 'push_subscriptions'] loop
    if to_regclass(format('public.%s', v_table_name)) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and information_schema.columns.table_name = v_table_name and column_name = 'cafe_slug'
       ) then
      execute format('alter table public.%I enable row level security', v_table_name);
      execute format('drop policy if exists %I on public.%I', v_table_name || '_tenant_select', v_table_name);
      execute format('create policy %I on public.%I for select to authenticated using (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin'')', v_table_name || '_tenant_select', v_table_name);
      execute format('drop policy if exists %I on public.%I', v_table_name || '_tenant_insert', v_table_name);
      execute format('create policy %I on public.%I for insert to authenticated with check (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin'')', v_table_name || '_tenant_insert', v_table_name);
      execute format('drop policy if exists %I on public.%I', v_table_name || '_tenant_update', v_table_name);
      execute format('create policy %I on public.%I for update to authenticated using (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin'') with check (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin'')', v_table_name || '_tenant_update', v_table_name);
      execute format('drop policy if exists %I on public.%I', v_table_name || '_tenant_delete', v_table_name);
      execute format('create policy %I on public.%I for delete to authenticated using (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin'')', v_table_name || '_tenant_delete', v_table_name);
    end if;
  end loop;
end $$;

-- Subscription and cafe status are already tenant-aware. Ensure UPDATE has a
-- WITH CHECK clause so a row cannot be reassigned to another cafe.
do $$
begin
  if to_regclass('public.subscription_requests') is not null then
    drop policy if exists "subscription_requests_write_superadmin" on public.subscription_requests;
    create policy "subscription_requests_write_superadmin" on public.subscription_requests
      for update to authenticated
      using (public.get_user_role() = 'superadmin')
      with check (public.get_user_role() = 'superadmin');
  end if;
end $$;
