-- =============================================================
-- Fix: RLS drift on remote project (moznzrdhfwoliwptpfxk)
-- =============================================================
-- Symptom A: every SELECT on user_roles returns HTTP 500 with
--   {"code":"42P17","message":"infinite recursion detected in policy for relation \"user_roles\""}
--   -> login shows "Access Denied: Your account has not been provisioned with a role."
-- Symptom B: /:cafeSlug/admin (and other tenant pages) redirect to /404
--   -> anon reads of `cafes` return [] because `cafes_read_public` is missing.
-- Cause: the remote DB is out of sync with supabase-migration.sql; stale or
--   missing RLS policies exist on user_roles / cafes / other tables.
-- Fix: below drops EVERY policy on each table (any name, any vintage) and
--   re-applies the current policies from supabase-migration.sql.
--
-- Run in Supabase Dashboard > SQL Editor (project moznzrdhfwoliwptpfxk).
-- Safe to run multiple times.
-- =============================================================

-- =============================================================
-- 1. user_roles
-- =============================================================
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'user_roles'
  loop
    execute format('drop policy if exists %I on public.user_roles', p.policyname);
  end loop;
end $$;

create or replace function public.get_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles where id = auth.uid()
$$;

create or replace function public.get_user_cafe_slug()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select cafe_slug from public.user_roles where id = auth.uid()
$$;

create policy "user_roles_read_tenant_scoped" on public.user_roles
  for select using (
    id = auth.uid()
    or cafe_slug = public.get_user_cafe_slug()
    or public.get_user_role() = 'superadmin'
  );

create policy "user_roles_insert_tenant_scoped" on public.user_roles
  for insert with check (
    public.get_user_role() = 'superadmin'
    or (
      public.get_user_role() = 'admin'
      and cafe_slug = public.get_user_cafe_slug()
    )
    or (select count(*) from public.user_roles) = 0
  );

create policy "user_roles_update_tenant_scoped" on public.user_roles
  for update using (
    public.get_user_role() = 'superadmin'
    or (public.get_user_role() = 'admin' and cafe_slug = public.get_user_cafe_slug())
  )
  with check (
    public.get_user_role() = 'superadmin'
    or (
      public.get_user_role() = 'admin'
      and cafe_slug = public.get_user_cafe_slug()
      and role <> 'superadmin'
    )
  );

create policy "user_roles_update_own" on public.user_roles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.user_roles where id = auth.uid())
  );

create policy "user_roles_delete_tenant_scoped" on public.user_roles
  for delete using (
    public.get_user_role() = 'superadmin'
    or (public.get_user_role() = 'admin' and cafe_slug = public.get_user_cafe_slug())
  );

grant select, insert, update, delete on public.user_roles to authenticated;

-- =============================================================
-- 2. cafes — public reads (slug resolution / tenant guard), superadmin writes
-- =============================================================
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'cafes'
  loop
    execute format('drop policy if exists %I on public.cafes', p.policyname);
  end loop;
end $$;

alter table public.cafes enable row level security;

create policy "cafes_read_public" on public.cafes
  for select using (true);

create policy "cafes_write_superadmin" on public.cafes
  for insert with check (public.get_user_role() = 'superadmin');

create policy "cafes_update_superadmin" on public.cafes
  for update using (public.get_user_role() = 'superadmin');

create policy "cafes_delete_superadmin" on public.cafes
  for delete using (public.get_user_role() = 'superadmin');

grant select on public.cafes to anon, authenticated;
grant insert, update, delete on public.cafes to authenticated;

-- =============================================================
-- 3. subscription_requests — public insert (pricing page), superadmin writes
-- =============================================================
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'subscription_requests'
  loop
    execute format('drop policy if exists %I on public.subscription_requests', p.policyname);
  end loop;
end $$;

alter table public.subscription_requests enable row level security;

create policy "subscription_requests_insert_public" on public.subscription_requests
  for insert with check (true);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscription_requests' and column_name = 'cafe_slug'
  ) then
    create policy "subscription_requests_read_tenant" on public.subscription_requests
      for select using (
        public.get_user_role() = 'superadmin'
        or (auth.role() = 'authenticated' and cafe_slug = public.get_user_cafe_slug())
      );
  else
    create policy "subscription_requests_read_superadmin" on public.subscription_requests
      for select using (public.get_user_role() = 'superadmin');
  end if;
end $$;

create policy "subscription_requests_write_superadmin" on public.subscription_requests
  for update using (public.get_user_role() = 'superadmin');

create policy "subscription_requests_delete_superadmin" on public.subscription_requests
  for delete using (public.get_user_role() = 'superadmin');

grant insert on public.subscription_requests to anon, authenticated;
grant select, update, delete on public.subscription_requests to authenticated;

-- =============================================================
-- 4. packages — public reads (pricing page), superadmin writes
-- =============================================================
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'packages'
  loop
    execute format('drop policy if exists %I on public.packages', p.policyname);
  end loop;
end $$;

alter table public.packages enable row level security;

create policy "packages_read_public" on public.packages
  for select using (true);

create policy "packages_write_superadmin" on public.packages
  for insert with check (public.get_user_role() = 'superadmin');

create policy "packages_update_superadmin" on public.packages
  for update using (public.get_user_role() = 'superadmin');

create policy "packages_delete_superadmin" on public.packages
  for delete using (public.get_user_role() = 'superadmin');

grant select on public.packages to anon, authenticated;
grant insert, update, delete on public.packages to authenticated;

-- =============================================================
-- 5. announcements — public reads, superadmin writes
-- =============================================================
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'announcements'
  loop
    execute format('drop policy if exists %I on public.announcements', p.policyname);
  end loop;
end $$;

alter table public.announcements enable row level security;

create policy "announcements_read_public" on public.announcements
  for select using (true);

create policy "announcements_write_superadmin" on public.announcements
  for insert with check (public.get_user_role() = 'superadmin');

create policy "announcements_update_superadmin" on public.announcements
  for update using (public.get_user_role() = 'superadmin');

create policy "announcements_delete_superadmin" on public.announcements
  for delete using (public.get_user_role() = 'superadmin');

grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;

-- =============================================================
-- 6. inventory — staff, tenant-scoped when cafe_slug column exists
-- =============================================================
do $$
declare p record;
begin
  if to_regclass('public.inventory') is not null then
    for p in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = 'inventory'
    loop
      execute format('drop policy if exists %I on public.inventory', p.policyname);
    end loop;

    alter table public.inventory enable row level security;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory' and column_name = 'cafe_slug'
    ) then
      execute 'create policy "inventory_read_tenant" on public.inventory for select using (auth.role() = ''authenticated'' and (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin''))';
      execute 'create policy "inventory_write_tenant" on public.inventory for insert with check (auth.role() = ''authenticated'' and (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin''))';
      execute 'create policy "inventory_update_tenant" on public.inventory for update using (auth.role() = ''authenticated'' and (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin''))';
      execute 'create policy "inventory_delete_tenant" on public.inventory for delete using (auth.role() = ''authenticated'' and (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin''))';
    else
      create policy "inventory_read_staff" on public.inventory
        for select using (auth.role() = 'authenticated');
      create policy "inventory_write_staff" on public.inventory
        for insert with check (auth.role() = 'authenticated');
      create policy "inventory_update_staff" on public.inventory
        for update using (auth.role() = 'authenticated');
      create policy "inventory_delete_staff" on public.inventory
        for delete using (auth.role() = 'authenticated');
    end if;

    grant select, insert, update, delete on public.inventory to authenticated;
  end if;
end $$;

-- =============================================================
-- 7. Sanity checks — expect: user_roles=5 policies, cafes=4
-- =============================================================
select 'user_roles' as table_name, count(*) as policies
from pg_policies
where schemaname = 'public' and tablename = 'user_roles'
union all
select 'cafes', count(*)
from pg_policies
where schemaname = 'public' and tablename = 'cafes'
union all
select 'subscription_requests', count(*)
from pg_policies
where schemaname = 'public' and tablename = 'subscription_requests'
union all
select 'packages', count(*)
from pg_policies
where schemaname = 'public' and tablename = 'packages'
union all
select 'announcements', count(*)
from pg_policies
where schemaname = 'public' and tablename = 'announcements'
union all
select 'inventory', count(*)
from pg_policies
where schemaname = 'public' and tablename = 'inventory';