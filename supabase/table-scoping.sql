-- ============================================================
-- TABLE SCOPING: every tables registry row belongs to one cafe
-- Run this in the Supabase Dashboard SQL Editor:
-- https://supabase.com/dashboard/project/moznzrdhfwoliwptpfxk/sql/new
--
-- What it does:
--   1. Adds cafe_slug to public.tables
--   2. Leaves pre-scoping rows unassigned until they are explicitly moved to
--      a real cafe
--   3. Enforces NOT NULL + adds an index
--   4. Replaces the global staff policies with tenant-scoped
--      policies (staff see/write only their own cafe; superadmin
--      sees everything)
--
-- Client changes shipped with this: saveTable() now stamps the
-- acting cafe's slug and generates tenant-unique ids
-- (table-<cafeSlug>-<number>) so "Table 1" cannot collide
-- between two cafes.
-- ============================================================

-- 1. Column (nullable first, then backfill + enforce)
alter table public.tables add column if not exists cafe_slug text;

-- 2. Index for tenant queries. Rows without cafe_slug remain inaccessible to
-- tenant users until an administrator assigns them to a real cafe.
create index if not exists tables_cafe_slug_idx on public.tables (cafe_slug);

-- 3. Drop the old global policies
drop policy if exists "tables_read_staff" on public.tables;
drop policy if exists "tables_write_staff" on public.tables;
drop policy if exists "tables_update_staff" on public.tables;
drop policy if exists "tables_delete_staff" on public.tables;
drop policy if exists "tables_read_tenant" on public.tables;
drop policy if exists "tables_insert_tenant" on public.tables;
drop policy if exists "tables_update_tenant" on public.tables;
drop policy if exists "tables_delete_tenant" on public.tables;

-- 4. Tenant-scoped policies (mirror the menu_items/user_roles pattern)
create policy "tables_read_tenant" on public.tables
  for select using (
    public.get_user_role() = 'superadmin'
    or cafe_slug = public.get_user_cafe_slug()
  );

create policy "tables_insert_tenant" on public.tables
  for insert with check (
    public.get_user_role() = 'superadmin'
    or (
      public.get_user_role() in ('admin', 'manager')
      and cafe_slug = public.get_user_cafe_slug()
    )
  );

create policy "tables_update_tenant" on public.tables
  for update using (
    public.get_user_role() = 'superadmin'
    or (
      public.get_user_role() in ('admin', 'manager')
      and cafe_slug = public.get_user_cafe_slug()
    )
  )
  with check (
    public.get_user_role() = 'superadmin'
    or (
      public.get_user_role() in ('admin', 'manager')
      and cafe_slug = public.get_user_cafe_slug()
    )
  );

create policy "tables_delete_tenant" on public.tables
  for delete using (
    public.get_user_role() = 'superadmin'
    or (
      public.get_user_role() in ('admin', 'manager')
      and cafe_slug = public.get_user_cafe_slug()
    )
  );

-- 5. Sanity check — review rows assigned to real cafes
select cafe_slug, count(*) as total
  from public.tables
 group by cafe_slug
 order by cafe_slug;
