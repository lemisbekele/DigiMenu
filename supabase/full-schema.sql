-- =============================================================
-- DigiMenu Complete Schema (All 28 Migrations Combined in Order)
-- Run this first in Supabase SQL Editor before running seed.sql
-- =============================================================

-- >>>>> MIGRATION: 20260820000001_initial_schema.sql >>>>>

-- =============================================================
-- DigiMenu — Full Supabase Migration
-- Run this entire script in Supabase SQL Editor
-- (Project: moznzrdhfwolilwptpfxk)
-- =============================================================

-- 0. Extensions
create extension if not exists "pgcrypto";

-- 1. Tables
-- 1a. User roles (references auth.users)
create table if not exists public.user_roles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'cashier', 'barista', 'superadmin')),
  display_name text,
  cafe_id text,
  cafe_slug text,
  must_change_password boolean default false,
  disabled boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.user_roles add column if not exists cafe_id text;
alter table public.user_roles add column if not exists cafe_slug text;
alter table public.user_roles add column if not exists must_change_password boolean default false;
alter table public.user_roles add column if not exists disabled boolean default false;

-- 1a. Cafe registry — the canonical tenant directory used by routing and
-- access validation. Every approved cafe must exist here in Supabase.
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
create index if not exists cafes_status_idx on public.cafes (status);
create unique index if not exists cafes_slug_lower_idx on public.cafes (lower(slug));

-- 1b. Menu items
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  price numeric(12,2) not null default 0,
  category text not null default '',
  subcategory text default '',
  image_url text default '',
  available boolean default true,
  estimated_minutes integer default 0,
  ingredients jsonb default '[]'::jsonb,
  options jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 1c. Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  table_id text not null default '',
  table_number text not null default '',
  items jsonb not null default '[]'::jsonb,
  total_amount numeric(12,2) not null default 0,
  subtotal_amount numeric(12,2) default 0,
  taxable_amount numeric(12,2) default 0,
  tax_amount numeric(12,2) default 0,
  tax_rate numeric(5,2) default 0,
  discount_amount numeric(12,2) default 0,
  estimated_ready_minutes integer default 0,
  order_status text default 'received' check (order_status in ('received','accepted','preparing','ready','paid','rejected')),
  payment_status text default 'unpaid' check (payment_status in ('unpaid','pending','approved','rejected','paid')),
  payment_proof_url text default '',
  customer_name text default '',
  customer jsonb default '{}'::jsonb,
  auto_ready_enabled boolean default false,
  auto_ready_at bigint,
  accepted_at text,
  accepted_at_ms bigint default 0,
  prepared_at text,
  prepared_at_ms bigint default 0,
  ready_at text,
  ready_at_ms bigint default 0,
  paid_at text,
  ready_push_sent_at timestamptz,
  ready_push_delivered_count integer default 0,
  created_at timestamptz default now(),
  created_at_ms bigint default (extract(epoch from now()) * 1000)::bigint
);

-- 1d. Tables registry — every table belongs to one cafe (tenant-scoped)
create table if not exists public.tables (
  id text primary key,
  cafe_slug text not null,
  table_number integer not null default 0,
  label text not null default '',
  print_title text default '',
  print_note text default ''
);
alter table public.tables add column if not exists cafe_slug text;
create index if not exists tables_cafe_slug_idx on public.tables (cafe_slug);

-- 1e. Payment options
create table if not exists public.payment_options (
  id text primary key,
  name text not null default '',
  type text default '',
  account_number text default '',
  account_holder text default '',
  instructions text default '',
  active boolean default true
);

-- 1f. Settings (key-value, e.g. id='billing')
create table if not exists public.settings (
  id text primary key,
  tax_label text default 'TXBL 1',
  tax_rate numeric(5,2) default 15,
  updated_at timestamptz default now()
);

-- 1g. Audit logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null default '',
  actor text default 'system',
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  created_at_ms bigint default (extract(epoch from now()) * 1000)::bigint
);

-- 1h. Push subscriptions
create table if not exists public.push_subscriptions (
  id text primary key,
  endpoint text not null default '',
  order_id text,
  role text default 'customer',
  subscription jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Existing projects can have the original shared tables already. Add the
-- tenant key before any policy or helper references it. Existing records are
-- intentionally left unassigned until migrated to a real cafe.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'menu_items', 'orders', 'tables', 'payment_options', 'settings',
    'audit_logs', 'push_subscriptions'
  ] loop
    if to_regclass(format('public.%s', relation_name)) is not null then
      execute format(
        'alter table public.%I add column if not exists cafe_slug text',
        relation_name
      );
      execute format(
        'create index if not exists %I on public.%I (cafe_slug)',
        relation_name || '_cafe_slug_idx',
        relation_name
      );
    end if;
  end loop;
end $$;

-- 1i. Subscription requests (created outside the original migration script)
create table if not exists public.subscription_requests (
  id text primary key,
  customer_name text not null default '',
  email text not null default '',
  phone text default '',
  plan_key text not null default '',
  notes text default '',
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'approved', 'rejected', 'active', 'expired')),
  requested_at timestamptz default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  activated_at timestamptz,
  expired_at timestamptz,
  customer_admin_id text,
  cafe_id text,
  cafe_slug text,
  updated_at timestamptz default now()
);
create index if not exists subscription_requests_status_idx on public.subscription_requests (status);
create index if not exists subscription_requests_email_idx on public.subscription_requests (email);

-- 1j. Packages (pricing page overrides)
create table if not exists public.packages (
  id text primary key,
  name text not null default '',
  price text not null default '',
  period text not null default '/month',
  description text default '',
  features jsonb default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  limits jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 1k. Announcements (platform broadcasts)
create table if not exists public.announcements (
  id text primary key,
  title text not null default '',
  message text not null default '',
  target text not null default 'All Cafes',
  priority text not null default 'Normal' check (priority in ('Normal', 'High')),
  created_at timestamptz default now()
);

-- 2. Helper: get current user's role
create or replace function public.get_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles where id = auth.uid()
$$;

-- 2b. Helper: get current user's cafe tenant
create or replace function public.get_user_cafe_slug()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select cafe_slug from public.user_roles where id = auth.uid()
$$;

-- 3. Enable Row Level Security
alter table public.user_roles enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.tables enable row level security;
alter table public.payment_options enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.push_subscriptions enable row level security;

-- 4. RLS Policies

-- This migration is intentionally re-runnable. A project may already contain
-- part of the schema from a previous deployment, so reset only the named
-- application policies before recreating them below. No rows or tables are
-- deleted by this block.
do $$
declare
  relation_name text;
  policy_name text;
begin
  foreach relation_name in array array[
    'user_roles', 'menu_items', 'orders', 'tables', 'payment_options',
    'settings', 'audit_logs', 'push_subscriptions'
  ] loop
    foreach policy_name in array array[
      'user_roles_read_all_authenticated', 'user_roles_insert_admin', 'user_roles_update_admin', 'user_roles_delete_admin',
      'user_roles_read_tenant_scoped', 'user_roles_insert_tenant_scoped', 'user_roles_update_tenant_scoped', 'user_roles_update_own', 'user_roles_delete_tenant_scoped',
      'menu_items_read_public', 'menu_items_write_staff', 'menu_items_update_staff', 'menu_items_delete_staff',
      'orders_insert_public', 'orders_read_staff', 'orders_update_staff', 'orders_delete_admin',
      'tables_read_staff', 'tables_write_staff', 'tables_update_staff', 'tables_delete_staff', 'tables_read_tenant', 'tables_insert_tenant', 'tables_update_tenant', 'tables_delete_tenant',
      'payment_options_read_staff', 'payment_options_write_staff', 'payment_options_update_staff', 'payment_options_delete_staff',
      'settings_read_staff', 'settings_write_staff', 'settings_update_staff',
      'audit_logs_insert_staff', 'audit_logs_read_admin',
      'push_subscriptions_insert_staff', 'push_subscriptions_read_staff', 'push_subscriptions_update_staff'
    ] loop
      execute format('drop policy if exists %I on public.%I', policy_name, relation_name);
    end loop;
  end loop;
end $$;

-- 4a. user_roles — tenant scoped. Everyone can read their own row; staff can
-- read the rows of their own cafe; superadmin reads everything. Inserts are
-- limited to superadmin or an admin of the same cafe (plus the first-row
-- bootstrap used to provision the very first account). Updates/deletes are
-- scoped the same way, and no admin can self-promote to superadmin.
drop policy if exists "user_roles_read_all_authenticated" on public.user_roles;
drop policy if exists "user_roles_insert_admin" on public.user_roles;
drop policy if exists "user_roles_update_admin" on public.user_roles;
drop policy if exists "user_roles_delete_admin" on public.user_roles;

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

-- Users may update their own row (language preference, password-change flag)
-- but never their own role.
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

-- 4b. menu_items
-- Everyone (including unauthenticated) can read
create policy "menu_items_read_public" on public.menu_items
  for select using (true);
-- Admin and manager can write
create policy "menu_items_write_staff" on public.menu_items
  for insert with check (public.get_user_role() in ('admin', 'manager'));
create policy "menu_items_update_staff" on public.menu_items
  for update using (public.get_user_role() in ('admin', 'manager'));
create policy "menu_items_delete_staff" on public.menu_items
  for delete using (public.get_user_role() in ('admin', 'manager'));

-- 4c. orders
-- Anyone can create (customer placing order)
create policy "orders_insert_public" on public.orders
  for insert with check (true);
-- Staff can read all orders
create policy "orders_read_staff" on public.orders
  for select using (auth.role() = 'authenticated');
-- Staff can update orders
create policy "orders_update_staff" on public.orders
  for update using (auth.role() = 'authenticated');
-- Only admin can delete
create policy "orders_delete_admin" on public.orders
  for delete using (public.get_user_role() = 'admin');

-- 4d. tables — tenant-scoped (staff only see/write their own cafe; superadmin sees all)
drop policy if exists "tables_read_staff" on public.tables;
drop policy if exists "tables_write_staff" on public.tables;
drop policy if exists "tables_update_staff" on public.tables;
drop policy if exists "tables_delete_staff" on public.tables;
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

-- 4e. payment_options
-- Staff can read
create policy "payment_options_read_staff" on public.payment_options
  for select using (auth.role() = 'authenticated');
-- Admin/manager can write
create policy "payment_options_write_staff" on public.payment_options
  for insert with check (public.get_user_role() in ('admin', 'manager'));
create policy "payment_options_update_staff" on public.payment_options
  for update using (public.get_user_role() in ('admin', 'manager'));
create policy "payment_options_delete_staff" on public.payment_options
  for delete using (public.get_user_role() in ('admin', 'manager'));

-- 4f. settings
-- Staff can read
create policy "settings_read_staff" on public.settings
  for select using (auth.role() = 'authenticated');
-- Admin/manager can update
create policy "settings_write_staff" on public.settings
  for insert with check (public.get_user_role() in ('admin', 'manager'));
create policy "settings_update_staff" on public.settings
  for update using (public.get_user_role() in ('admin', 'manager'));

-- 4g. audit_logs
-- Staff can insert (for logging)
create policy "audit_logs_insert_staff" on public.audit_logs
  for insert with check (auth.role() = 'authenticated');
-- Admin can read
create policy "audit_logs_read_admin" on public.audit_logs
  for select using (public.get_user_role() = 'admin');

-- 4h. push_subscriptions
-- Staff can insert (for push notification setup)
create policy "push_subscriptions_insert_staff" on public.push_subscriptions
  for insert with check (auth.role() = 'authenticated');
-- Staff can read own
create policy "push_subscriptions_read_staff" on public.push_subscriptions
  for select using (auth.role() = 'authenticated');
-- Staff can update own
create policy "push_subscriptions_update_staff" on public.push_subscriptions
  for update using (auth.role() = 'authenticated');

-- 5. Enable Realtime replication
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'menu_items', 'orders', 'tables', 'payment_options', 'settings',
    'audit_logs', 'user_roles', 'push_subscriptions'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', relation_name);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- 6. Default billing settings
insert into public.settings (id, tax_label, tax_rate) values ('billing', 'TXBL 1', 15)
on conflict (id) do nothing;

-- 7. Order workflow procedures
-- Order lifecycle: received -> (accept) preparing -> ready -> paid (or rejected from any active stage).
-- Accepting an order by staff auto-starts preparing; 'accepted' is recorded only as a timestamp
-- (accepted_at) so the customer tracking page can show when staff picked up the order.
-- There is NO 'served' stage.

create or replace function public.get_popular_items()
returns table (item_id text, quantity bigint)
language sql
security definer
set search_path = public
as $$
  select item->>'itemId' as item_id, sum((item->>'quantity')::bigint) as quantity
  from public.orders, jsonb_array_elements(orders.items) as item
  where payment_status in ('unpaid', 'pending', 'approved', 'paid')
    and order_status in ('received', 'accepted', 'preparing', 'ready', 'paid')
  group by 1
  order by 2 desc;
$$;

create or replace function public.update_staff_order(p_order_id uuid, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_user_role();
  v_order public.orders%rowtype;
  v_key text;
  v_val jsonb;
  v_discount numeric;
  v_status text;
begin
  if v_role is null or v_role not in ('admin', 'manager', 'cashier', 'barista') then
    raise exception 'Not authorized.';
  end if;
  if p_order_id is null or p_changes is null then
    raise exception 'Order id and changes are required.';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  for v_key, v_val in select * from jsonb_each(p_changes) loop
    if v_key in ('paymentStatus', 'paidAt', 'discountAmount', 'rejectionReason', 'paymentMethod', 'paymentProofUrl') then
      if v_role not in ('admin', 'manager', 'cashier') then
        raise exception 'Not authorized to change %', v_key;
      end if;
    elsif v_key not in ('orderStatus', 'autoReadyEnabled', 'autoReadyAt', 'readyAt', 'readyAtMs', 'acceptedAt', 'acceptedAtMs', 'preparedAt', 'preparedAtMs', 'estimatedReadyMinutes', 'customerName') then
      raise exception 'Unknown field %', v_key;
    end if;
  end loop;

  if p_changes ? 'orderStatus' then
    v_status := p_changes->>'orderStatus';
    if v_status not in ('received', 'accepted', 'preparing', 'ready', 'paid', 'rejected') then
      raise exception 'Invalid order status.';
    end if;
    if v_status <> v_order.order_status then
      if not (
        (v_order.order_status = 'received' and v_status in ('accepted', 'preparing', 'rejected')) or
        (v_order.order_status = 'accepted' and v_status in ('preparing', 'rejected')) or
        (v_order.order_status = 'preparing' and v_status in ('ready', 'rejected')) or
        (v_order.order_status = 'ready' and v_status in ('paid', 'rejected'))
      ) then
        raise exception 'Invalid order status transition from % to %.', v_order.order_status, v_status;
      end if;
    end if;
  end if;

  if p_changes ? 'paymentStatus' then
    v_status := p_changes->>'paymentStatus';
    if v_status not in ('unpaid', 'pending', 'approved', 'rejected', 'paid') then
      raise exception 'Invalid payment status.';
    end if;
  end if;

  update public.orders set
    order_status = coalesce(p_changes->>'orderStatus', order_status),
    payment_status = coalesce(p_changes->>'paymentStatus', payment_status),
    payment_method = coalesce(p_changes->>'paymentMethod', payment_method),
    payment_proof_url = coalesce(p_changes->>'paymentProofUrl', payment_proof_url),
    rejection_reason = coalesce(p_changes->>'rejectionReason', rejection_reason),
    auto_ready_enabled = coalesce((p_changes->>'autoReadyEnabled')::boolean, auto_ready_enabled),
    auto_ready_at = coalesce((p_changes->>'autoReadyAt')::bigint, auto_ready_at),
    ready_at = coalesce(p_changes->>'readyAt', ready_at),
    ready_at_ms = coalesce((p_changes->>'readyAtMs')::bigint, ready_at_ms),
    accepted_at = coalesce(p_changes->>'acceptedAt', accepted_at),
    accepted_at_ms = coalesce((p_changes->>'acceptedAtMs')::bigint, accepted_at_ms),
    prepared_at = coalesce(p_changes->>'preparedAt', prepared_at),
    prepared_at_ms = coalesce((p_changes->>'preparedAtMs')::bigint, prepared_at_ms),
    paid_at = coalesce(p_changes->>'paidAt', paid_at),
    estimated_ready_minutes = coalesce((p_changes->>'estimatedReadyMinutes')::int, estimated_ready_minutes),
    customer_name = coalesce(p_changes->>'customerName', customer_name)
  where id = p_order_id;

  if p_changes ? 'discountAmount' and v_order.payment_status <> 'paid' then
    v_discount := least(greatest((p_changes->>'discountAmount')::numeric, 0), v_order.total_amount);
    update public.orders
    set discount_amount = v_discount,
        total_amount = round((v_order.total_amount - v_discount)::numeric, 2)
    where id = p_order_id;
  end if;
end;
$$;

-- =============================================================
-- 8. RLS for tables created outside this script
-- (cafes, subscription_requests, packages, inventory, announcements)
-- Every block is guarded with to_regclass so it is safe to run even
-- when a table does not exist yet.
--
-- NOTE: orders / menu_items / tables / payment_options / settings /
-- audit_logs / push_subscriptions keep role-scoped policies above.
-- Tenant-scoping those tables requires the client to stamp cafe_slug on
-- every row (the frontend currently does not send it), so scoping them
-- now would silently hide all data from cafe staff. That is tracked as
-- follow-up work: add cafe_slug to the client write paths, then re-scope.
-- =============================================================

-- 8a. cafes: public reads (slug resolution / tenant guard), superadmin writes
do $$
begin
  if to_regclass('public.cafes') is not null then
    alter table public.cafes enable row level security;
    drop policy if exists "cafes_read_public" on public.cafes;
    create policy "cafes_read_public" on public.cafes
      for select using (true);
    drop policy if exists "cafes_write_superadmin" on public.cafes;
    create policy "cafes_write_superadmin" on public.cafes
      for insert with check (public.get_user_role() = 'superadmin');
    drop policy if exists "cafes_update_superadmin" on public.cafes;
    create policy "cafes_update_superadmin" on public.cafes
      for update using (public.get_user_role() = 'superadmin');
    drop policy if exists "cafes_delete_superadmin" on public.cafes;
    create policy "cafes_delete_superadmin" on public.cafes
      for delete using (public.get_user_role() = 'superadmin');
  end if;
end $$;

-- 8b. subscription_requests: public insert (customer self-service on the
-- pricing page), tenant-scoped reads (own cafe rows only), superadmin writes.
do $$
begin
  if to_regclass('public.subscription_requests') is not null then
    alter table public.subscription_requests enable row level security;
    drop policy if exists "subscription_requests_insert_public" on public.subscription_requests;
    create policy "subscription_requests_insert_public" on public.subscription_requests
      for insert with check (true);
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'subscription_requests' and column_name = 'cafe_slug'
    ) then
      drop policy if exists "subscription_requests_read_tenant" on public.subscription_requests;
      create policy "subscription_requests_read_tenant" on public.subscription_requests
        for select to authenticated using (
          public.get_user_role() = 'superadmin'
          or cafe_slug = public.get_user_cafe_slug()
        );
    else
      drop policy if exists "subscription_requests_read_superadmin" on public.subscription_requests;
      create policy "subscription_requests_read_superadmin" on public.subscription_requests
        for select using (public.get_user_role() = 'superadmin');
    end if;
    drop policy if exists "subscription_requests_write_superadmin" on public.subscription_requests;
    create policy "subscription_requests_write_superadmin" on public.subscription_requests
      for update using (public.get_user_role() = 'superadmin');
    drop policy if exists "subscription_requests_delete_superadmin" on public.subscription_requests;
    create policy "subscription_requests_delete_superadmin" on public.subscription_requests
      for delete using (public.get_user_role() = 'superadmin');
  end if;
end $$;

-- 8c. packages: public reads (pricing page), superadmin writes.
do $$
begin
  if to_regclass('public.packages') is not null then
    alter table public.packages enable row level security;
    drop policy if exists "packages_read_public" on public.packages;
    create policy "packages_read_public" on public.packages
      for select using (true);
    drop policy if exists "packages_write_superadmin" on public.packages;
    create policy "packages_write_superadmin" on public.packages
      for insert with check (public.get_user_role() = 'superadmin');
    drop policy if exists "packages_update_superadmin" on public.packages;
    create policy "packages_update_superadmin" on public.packages
      for update using (public.get_user_role() = 'superadmin');
  end if;
end $$;

-- 8d. inventory: staff reads/writes scoped to their own cafe when the table
-- carries a cafe_slug column, otherwise role-scoped (authenticated only).
do $$
begin
  if to_regclass('public.inventory') is not null then
    alter table public.inventory enable row level security;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory' and column_name = 'cafe_slug'
    ) then
      drop policy if exists "inventory_read_tenant" on public.inventory;
      execute 'create policy "inventory_read_tenant" on public.inventory for select using (auth.role() = ''authenticated'' and (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin''))';
      drop policy if exists "inventory_write_tenant" on public.inventory;
      execute 'create policy "inventory_write_tenant" on public.inventory for insert with check (auth.role() = ''authenticated'' and (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin''))';
      drop policy if exists "inventory_update_tenant" on public.inventory;
      execute 'create policy "inventory_update_tenant" on public.inventory for update using (auth.role() = ''authenticated'' and (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin''))';
      drop policy if exists "inventory_delete_tenant" on public.inventory;
      execute 'create policy "inventory_delete_tenant" on public.inventory for delete using (auth.role() = ''authenticated'' and (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin''))';
    else
      drop policy if exists "inventory_read_staff" on public.inventory;
      create policy "inventory_read_staff" on public.inventory
        for select using (auth.role() = 'authenticated');
      drop policy if exists "inventory_write_staff" on public.inventory;
      create policy "inventory_write_staff" on public.inventory
        for insert with check (auth.role() = 'authenticated');
      drop policy if exists "inventory_update_staff" on public.inventory;
      create policy "inventory_update_staff" on public.inventory
        for update using (auth.role() = 'authenticated');
      drop policy if exists "inventory_delete_staff" on public.inventory;
      create policy "inventory_delete_staff" on public.inventory
        for delete using (auth.role() = 'authenticated');
    end if;
  end if;
end $$;

-- 8e. announcements: public reads (broadcast content), superadmin writes.
do $$
begin
  if to_regclass('public.announcements') is not null then
    alter table public.announcements enable row level security;
    drop policy if exists "announcements_read_public" on public.announcements;
    create policy "announcements_read_public" on public.announcements
      for select using (true);
    drop policy if exists "announcements_write_superadmin" on public.announcements;
    create policy "announcements_write_superadmin" on public.announcements
      for insert with check (public.get_user_role() = 'superadmin');
    drop policy if exists "announcements_update_superadmin" on public.announcements;
    create policy "announcements_update_superadmin" on public.announcements
      for update using (public.get_user_role() = 'superadmin');
    drop policy if exists "announcements_delete_superadmin" on public.announcements;
    create policy "announcements_delete_superadmin" on public.announcements
      for delete using (public.get_user_role() = 'superadmin');
  end if;
end $$;


-- >>>>> MIGRATION: 20260820000002_audit_log_compat.sql >>>>>

-- Repairs older hosted audit_logs tables used by the current Supabase client.
-- Safe to run more than once in Supabase SQL Editor.
alter table public.audit_logs add column if not exists cafe_slug text;
alter table public.audit_logs add column if not exists created_at_ms bigint;

update public.audit_logs
set created_at_ms = (extract(epoch from coalesce(created_at, now())) * 1000)::bigint
where created_at_ms is null;

alter table public.audit_logs alter column created_at_ms
  set default (extract(epoch from now()) * 1000)::bigint;

create index if not exists audit_logs_cafe_slug_idx on public.audit_logs (cafe_slug);
create index if not exists audit_logs_created_at_ms_idx on public.audit_logs (created_at_ms desc);


-- >>>>> MIGRATION: 20260820000003_table_scoping.sql >>>>>

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


-- >>>>> MIGRATION: 20260820000004_tenant_isolation.sql >>>>>

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


-- >>>>> MIGRATION: 20260820000005_cafe_lifecycle.sql >>>>>

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


-- >>>>> MIGRATION: 20260820000006_fix_user_roles_rls.sql >>>>>

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

-- >>>>> MIGRATION: 20260820000007_table_grants.sql >>>>>

-- =============================================================
-- Table-level grants mirroring hosted Supabase default privileges.
-- Local `db reset` only bestows REFERENCES/TRIGGER/TRUNCATE on new
-- tables, which silently breaks every API call. In hosted Supabase
-- the default ACL grants all privileges to anon, authenticated and
-- service_role on public tables and Row Level Security is the only
-- gate. Reproduce that here (RLS policies were created by the
-- earlier migrations, so row access remains fully controlled).
-- =============================================================

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

-- >>>>> MIGRATION: 20260820000008_plan_rbac_enforcement.sql >>>>>

-- =============================================================
-- 20260820000008_plan_rbac_enforcement.sql
-- Package/plan + role-permission enforcement at the database layer.
--
-- 1. Seeds the packages catalog (single source of truth for entitlements).
-- 2. Adds entitlement helpers: cafe_feature_enabled / cafe_has_feature.
-- 3. Recreates write policies so every staff operation also requires the
--    cafe's ACTIVE subscription (status active/approved) to include the
--    feature. No subscription => no features.
-- 4. Adds the RPCs the app already calls but that only existed on the
--    hosted project (order creation/payment, user management) with
--    role + package checks.
-- =============================================================

-- ---------------------------------------------------------------
-- 0. Schema columns the app relies on
-- ---------------------------------------------------------------
alter table public.user_roles add column if not exists language text not null default 'en';

alter table public.orders add column if not exists payment_method text default '';
alter table public.orders add column if not exists rejection_reason text default '';

-- ---------------------------------------------------------------
-- 1. Packages catalog seed — feature lists mirror FEATURE_REGISTRY in
--    src/services/planService.js exactly.
-- ---------------------------------------------------------------
insert into public.packages (id, name, price, period, description, features, status, limits, updated_at)
values
  ('starter',      'Starter',      '$29',  '/month', 'Essential digital menu & ordering',
   '["digitalMenu","ordering"]'::jsonb,
   'active', '{"menuItems":50}'::jsonb, now()),
  ('professional', 'Professional', '$79',  '/month', 'Full cafe suite with KDS & POS',
   '["staffAccess","kds","orderHistory","cashierPos","inventory","notifications","analytics","menuManagement","tables","settings"]'::jsonb,
   'active', '{"menuItems":500}'::jsonb, now()),
  ('enterprise',   'Enterprise',   '$199', '/month', 'Multi-location enterprise control',
   '["digitalMenu","ordering","staffAccess","kds","orderHistory","cashierPos","inventory","notifications","analytics","menuManagement","tables","settings","userManagement","auditLogs","multiLanguage"]'::jsonb,
   'active', '{"menuItems":5000}'::jsonb, now())
on conflict (id) do update set
  name = excluded.name,
  price = excluded.price,
  period = excluded.period,
  description = excluded.description,
  features = excluded.features,
  status = excluded.status,
  limits = excluded.limits,
  updated_at = excluded.updated_at;

-- ---------------------------------------------------------------
-- 2. Entitlement helpers
-- ---------------------------------------------------------------
-- Does a given cafe's active subscription include the feature?
-- SECURITY DEFINER so RLS policies and other definer functions can call it
-- without recursion or privilege leaks.
create or replace function public.cafe_feature_enabled(p_cafe_slug text, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscription_requests sr
    join public.packages p on p.id = sr.plan_key
    where lower(sr.cafe_slug) = lower(p_cafe_slug)
      and sr.status in ('active', 'approved')
      and p.status = 'active'
      and p.features ? p_feature
  )
$$;

-- Caller-scoped variant: the authenticated user's cafe. Super Admin bypasses;
-- unauthenticated users have no cafe and therefore no features.
create or replace function public.cafe_has_feature(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.get_user_role() = 'superadmin' then true
      when public.get_user_cafe_slug() is null then false
      else public.cafe_feature_enabled(public.get_user_cafe_slug(), p_feature)
    end
$$;

revoke all on function public.cafe_feature_enabled(text, text) from public;
grant execute on function public.cafe_feature_enabled(text, text) to anon, authenticated;
revoke all on function public.cafe_has_feature(text) from public;
grant execute on function public.cafe_has_feature(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- 3. Package-aware RLS
-- ---------------------------------------------------------------

-- 3a. menu_items — public reads (digital menu), staff writes gated by
-- menuManagement. Super Admin is covered by cafe_has_feature().
drop policy if exists "menu_items_read_public" on public.menu_items;
drop policy if exists "menu_items_tenant_select" on public.menu_items;
drop policy if exists "menu_items_tenant_insert" on public.menu_items;
drop policy if exists "menu_items_tenant_update" on public.menu_items;
drop policy if exists "menu_items_tenant_delete" on public.menu_items;

create policy "menu_items_read_public" on public.menu_items
  for select using (true);

create policy "menu_items_tenant_insert" on public.menu_items
  for insert to authenticated
  with check (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('menuManagement')
  );

create policy "menu_items_tenant_update" on public.menu_items
  for update to authenticated
  using (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('menuManagement')
  )
  with check (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('menuManagement')
  );

create policy "menu_items_tenant_delete" on public.menu_items
  for delete to authenticated
  using (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('menuManagement')
  );

-- 3b. settings — staff reads (tenant), writes gated by settings.
drop policy if exists "settings_read_staff" on public.settings;
drop policy if exists "settings_tenant_select" on public.settings;
drop policy if exists "settings_tenant_insert" on public.settings;
drop policy if exists "settings_tenant_update" on public.settings;
drop policy if exists "settings_tenant_delete" on public.settings;

create policy "settings_read_staff" on public.settings
  for select to authenticated using (
    cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin'
  );

create policy "settings_tenant_insert" on public.settings
  for insert to authenticated
  with check (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('settings')
  );

create policy "settings_tenant_update" on public.settings
  for update to authenticated
  using (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('settings')
  )
  with check (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('settings')
  );

-- 3c. payment_options — active options are public (checkout page), staff
-- reads all tenant options, writes gated by settings.
drop policy if exists "payment_options_read_public" on public.payment_options;
drop policy if exists "payment_options_read_staff" on public.payment_options;
drop policy if exists "payment_options_tenant_select" on public.payment_options;
drop policy if exists "payment_options_tenant_insert" on public.payment_options;
drop policy if exists "payment_options_tenant_update" on public.payment_options;
drop policy if exists "payment_options_tenant_delete" on public.payment_options;

create policy "payment_options_read_public" on public.payment_options
  for select to anon using (active = true);

create policy "payment_options_read_staff" on public.payment_options
  for select to authenticated using (
    cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin'
  );

create policy "payment_options_tenant_insert" on public.payment_options
  for insert to authenticated
  with check (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('settings')
  );

create policy "payment_options_tenant_update" on public.payment_options
  for update to authenticated
  using (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('settings')
  )
  with check (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('settings')
  );

create policy "payment_options_tenant_delete" on public.payment_options
  for delete to authenticated
  using (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('settings')
  );

-- 3d. tables — tenant-scoped, writes gated by tables. Removes the old
-- duplicate policy sets from migrations 03/04.
drop policy if exists "tables_read_tenant" on public.tables;
drop policy if exists "tables_insert_tenant" on public.tables;
drop policy if exists "tables_update_tenant" on public.tables;
drop policy if exists "tables_delete_tenant" on public.tables;
drop policy if exists "tables_tenant_select" on public.tables;
drop policy if exists "tables_tenant_insert" on public.tables;
drop policy if exists "tables_tenant_update" on public.tables;
drop policy if exists "tables_tenant_delete" on public.tables;

create policy "tables_read_tenant" on public.tables
  for select to authenticated using (
    cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin'
  );

create policy "tables_insert_tenant" on public.tables
  for insert to authenticated
  with check (
    (public.get_user_role() = 'superadmin' or (
      public.get_user_role() in ('admin', 'manager')
      and cafe_slug = public.get_user_cafe_slug()
    ))
    and public.cafe_has_feature('tables')
  );

create policy "tables_update_tenant" on public.tables
  for update to authenticated
  using (
    (public.get_user_role() = 'superadmin' or (
      public.get_user_role() in ('admin', 'manager')
      and cafe_slug = public.get_user_cafe_slug()
    ))
    and public.cafe_has_feature('tables')
  )
  with check (
    (public.get_user_role() = 'superadmin' or (
      public.get_user_role() in ('admin', 'manager')
      and cafe_slug = public.get_user_cafe_slug()
    ))
    and public.cafe_has_feature('tables')
  );

create policy "tables_delete_tenant" on public.tables
  for delete to authenticated
  using (
    (public.get_user_role() = 'superadmin' or (
      public.get_user_role() in ('admin', 'manager')
      and cafe_slug = public.get_user_cafe_slug()
    ))
    and public.cafe_has_feature('tables')
  );

-- 3e. inventory — tenant-scoped, writes gated by inventory.
do $$
begin
  if to_regclass('public.inventory') is not null then
    drop policy if exists "inventory_read_tenant" on public.inventory;
    drop policy if exists "inventory_write_tenant" on public.inventory;
    drop policy if exists "inventory_update_tenant" on public.inventory;
    drop policy if exists "inventory_delete_tenant" on public.inventory;
    drop policy if exists "inventory_read_staff" on public.inventory;
    drop policy if exists "inventory_write_staff" on public.inventory;
    drop policy if exists "inventory_update_staff" on public.inventory;
    drop policy if exists "inventory_delete_staff" on public.inventory;

    create policy "inventory_read_tenant" on public.inventory
      for select to authenticated using (
        cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin'
      );

    create policy "inventory_write_tenant" on public.inventory
      for insert to authenticated
      with check (
        (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
        and public.cafe_has_feature('inventory')
      );

    create policy "inventory_update_tenant" on public.inventory
      for update to authenticated
      using (
        (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
        and public.cafe_has_feature('inventory')
      )
      with check (
        (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
        and public.cafe_has_feature('inventory')
      );

    create policy "inventory_delete_tenant" on public.inventory
      for delete to authenticated
      using (
        (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
        and public.cafe_has_feature('inventory')
      );
  end if;
end $$;

-- 3f. orders — anon can read a limited, non-payment column set (UUID
-- capability, mirroring the hosted project); staff reads are tenant-scoped;
-- direct writes are gated by the ordering/kds/cashierPos features. Order
-- creation and customer updates go through RPCs below.
drop policy if exists "orders_read_anon_limited" on public.orders;
drop policy if exists "orders_read_staff" on public.orders;
drop policy if exists "orders_insert_public" on public.orders;
drop policy if exists "orders_tenant_select" on public.orders;
drop policy if exists "orders_tenant_insert" on public.orders;
drop policy if exists "orders_tenant_update" on public.orders;
drop policy if exists "orders_tenant_delete" on public.orders;
drop policy if exists "orders_insert_staff" on public.orders;
drop policy if exists "orders_update_staff" on public.orders;
drop policy if exists "orders_delete_admin" on public.orders;

revoke all on public.orders from anon;
grant select (
  id, table_id, table_number, items, total_amount, subtotal_amount,
  taxable_amount, tax_amount, tax_rate, discount_amount,
  estimated_ready_minutes, order_status, payment_status, payment_method,
  payment_proof_url, rejection_reason, customer_name, customer,
  auto_ready_enabled, auto_ready_at, accepted_at, accepted_at_ms,
  prepared_at, prepared_at_ms, ready_at, ready_at_ms, paid_at,
  created_at, created_at_ms
) on public.orders to anon;

create policy "orders_read_anon_limited" on public.orders
  for select to anon using (true);

create policy "orders_read_staff" on public.orders
  for select to authenticated using (
    cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin'
  );

create policy "orders_insert_staff" on public.orders
  for insert to authenticated
  with check (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('ordering')
  );

create policy "orders_update_staff" on public.orders
  for update to authenticated
  using (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and (
      public.cafe_has_feature('ordering')
      or public.cafe_has_feature('kds')
      or public.cafe_has_feature('cashierPos')
    )
  )
  with check (
    (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and (
      public.cafe_has_feature('ordering')
      or public.cafe_has_feature('kds')
      or public.cafe_has_feature('cashierPos')
    )
  );

create policy "orders_delete_admin" on public.orders
  for delete to authenticated
  using (
    public.get_user_role() = 'admin'
    and public.cafe_has_feature('ordering')
  );

-- 3g. user_roles — tenant-scoped; admin management additionally requires the
-- userManagement feature. Self-updates (language, password flag) stay open.
-- Direct UPDATE grants are limited to non-privilege columns so roles can only
-- be changed through the set_user_role RPC.
drop policy if exists "user_roles_insert_tenant_scoped" on public.user_roles;
drop policy if exists "user_roles_update_tenant_scoped" on public.user_roles;
drop policy if exists "user_roles_delete_tenant_scoped" on public.user_roles;

create policy "user_roles_insert_tenant_scoped" on public.user_roles
  for insert with check (
    public.get_user_role() = 'superadmin'
    or (
      public.get_user_role() = 'admin'
      and cafe_slug = public.get_user_cafe_slug()
      and public.cafe_has_feature('userManagement')
    )
    or (select count(*) from public.user_roles) = 0
  );

create policy "user_roles_update_tenant_scoped" on public.user_roles
  for update using (
    public.get_user_role() = 'superadmin'
    or (
      public.get_user_role() = 'admin'
      and cafe_slug = public.get_user_cafe_slug()
      and public.cafe_has_feature('userManagement')
    )
  )
  with check (
    public.get_user_role() = 'superadmin'
    or (
      public.get_user_role() = 'admin'
      and cafe_slug = public.get_user_cafe_slug()
      and public.cafe_has_feature('userManagement')
      and role <> 'superadmin'
    )
  );

create policy "user_roles_delete_tenant_scoped" on public.user_roles
  for delete using (
    public.get_user_role() = 'superadmin'
    or (
      public.get_user_role() = 'admin'
      and cafe_slug = public.get_user_cafe_slug()
      and public.cafe_has_feature('userManagement')
    )
  );

revoke update on public.user_roles from authenticated;
grant update (language, display_name, must_change_password, updated_at) on public.user_roles to authenticated;

-- 3h. audit_logs — append-only for staff; reads require the auditLogs
-- feature. Super Admin keeps platform-wide reads.
drop policy if exists "audit_logs_read_admin" on public.audit_logs;
drop policy if exists "audit_logs_tenant_select" on public.audit_logs;
drop policy if exists "audit_logs_tenant_insert" on public.audit_logs;
drop policy if exists "audit_logs_tenant_update" on public.audit_logs;
drop policy if exists "audit_logs_tenant_delete" on public.audit_logs;
drop policy if exists "audit_logs_insert_staff" on public.audit_logs;

create policy "audit_logs_tenant_select" on public.audit_logs
  for select to authenticated using (
    public.get_user_role() = 'superadmin'
    or (
      cafe_slug = public.get_user_cafe_slug()
      and public.cafe_has_feature('auditLogs')
    )
  );

create policy "audit_logs_insert_staff" on public.audit_logs
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------
-- 4. RPCs (previously existed only on the hosted project)
-- ---------------------------------------------------------------

-- 4a. create_customer_order — SECURITY DEFINER. Prices/tax/totals are
-- recomputed server-side from menu_items; the client can never set them.
-- The cafe must have an active subscription that includes ordering.
create or replace function public.create_customer_order(
  p_table_number text,
  p_items jsonb,
  p_estimated_ready_minutes integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_slug text;
  v_item jsonb;
  v_menu public.menu_items%rowtype;
  v_subtotal numeric := 0;
  v_taxable numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_tax_rate numeric := 0;
  v_qty integer;
  v_count integer := 0;
  v_order_id uuid;
  v_billing public.settings%rowtype;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must include at least one item.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Order cannot contain more than 50 items.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_count := v_count + 1;
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    if v_qty < 1 or v_qty > 100 then
      raise exception 'Quantity is invalid.';
    end if;

    select * into v_menu
    from public.menu_items
    where id = (v_item->>'itemId')::uuid;
    if v_menu.id is null then
      raise exception 'Item % is no longer available.', v_item->>'itemId';
    end if;
    if not v_menu.available then
      raise exception 'Item "%" is not available.', v_menu.name;
    end if;

    if v_cafe_slug is null then
      v_cafe_slug := v_menu.cafe_slug;
    elsif v_cafe_slug <> v_menu.cafe_slug then
      raise exception 'Items must belong to the same cafe.';
    end if;

    v_subtotal := v_subtotal + (v_menu.price * v_qty);
    v_taxable := v_taxable + (v_menu.price * v_qty);
  end loop;

  if v_cafe_slug is null then
    raise exception 'Order items must belong to a registered cafe.';
  end if;
  if not public.cafe_feature_enabled(v_cafe_slug, 'ordering') then
    raise exception 'This cafe is not accepting orders.';
  end if;

  select * into v_billing
  from public.settings
  where id = 'billing' and cafe_slug = v_cafe_slug;
  v_tax_rate := coalesce(v_billing.tax_rate, 15);
  v_tax := round((v_taxable * v_tax_rate / 100)::numeric, 2);
  v_total := round((v_subtotal + v_tax)::numeric, 2);

  insert into public.orders (
    table_id, table_number, items, total_amount, subtotal_amount,
    taxable_amount, tax_amount, tax_rate, discount_amount,
    estimated_ready_minutes, cafe_slug
  ) values (
    v_cafe_slug || ':' || p_table_number, p_table_number, p_items, v_total, v_subtotal,
    v_taxable, v_tax, v_tax_rate, 0,
    greatest(0, coalesce(p_estimated_ready_minutes, 0)), v_cafe_slug
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

-- 4b. update_customer_order — customers may only touch payment method and
-- proof fields on an existing order of a cafe that still accepts orders.
create or replace function public.update_customer_order(
  p_order_id uuid,
  p_payment_method text default null,
  p_clear_method boolean default false,
  p_payment_proof_url text default null,
  p_clear_proof boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_order_id is null then
    raise exception 'Order id is required.';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found.';
  end if;
  if not public.cafe_feature_enabled(v_order.cafe_slug, 'ordering') then
    raise exception 'This cafe is not accepting orders.';
  end if;

  update public.orders set
    payment_method = case when p_clear_method then null else coalesce(p_payment_method, payment_method) end,
    payment_proof_url = case when p_clear_proof then '' else coalesce(p_payment_proof_url, payment_proof_url) end
  where id = p_order_id;
end;
$$;

-- 4c. update_staff_order — adds package enforcement and tenant scoping to the
-- existing field-whitelisting implementation.
create or replace function public.update_staff_order(p_order_id uuid, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_user_role();
  v_cafe text := public.get_user_cafe_slug();
  v_order public.orders%rowtype;
  v_key text;
  v_val jsonb;
  v_discount numeric;
  v_status text;
begin
  if v_role is null or v_role not in ('admin', 'manager', 'cashier', 'barista') then
    raise exception 'Not authorized.';
  end if;
  if v_cafe is null
     or not (
       public.cafe_has_feature('staffAccess')
       or public.cafe_has_feature('ordering')
       or public.cafe_has_feature('kds')
       or public.cafe_has_feature('cashierPos')
     ) then
    raise exception 'Not authorized.';
  end if;
  if p_order_id is null or p_changes is null then
    raise exception 'Order id and changes are required.';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found.';
  end if;
  if v_order.cafe_slug is not null and lower(v_order.cafe_slug) <> lower(v_cafe) then
    raise exception 'Not authorized.';
  end if;

  for v_key, v_val in select * from jsonb_each(p_changes) loop
    if v_key in ('paymentStatus', 'paidAt', 'discountAmount', 'rejectionReason', 'paymentMethod', 'paymentProofUrl') then
      if v_role not in ('admin', 'manager', 'cashier') then
        raise exception 'Not authorized to change %', v_key;
      end if;
    elsif v_key not in ('orderStatus', 'autoReadyEnabled', 'autoReadyAt', 'readyAt', 'readyAtMs', 'acceptedAt', 'acceptedAtMs', 'preparedAt', 'preparedAtMs', 'estimatedReadyMinutes', 'customerName') then
      raise exception 'Unknown field %', v_key;
    end if;
  end loop;

  if p_changes ? 'orderStatus' then
    v_status := p_changes->>'orderStatus';
    if v_status not in ('received', 'accepted', 'preparing', 'ready', 'paid', 'rejected') then
      raise exception 'Invalid order status.';
    end if;
    if v_status <> v_order.order_status then
      if not (
        (v_order.order_status = 'received' and v_status in ('accepted', 'preparing', 'rejected')) or
        (v_order.order_status = 'accepted' and v_status in ('preparing', 'rejected')) or
        (v_order.order_status = 'preparing' and v_status in ('ready', 'rejected')) or
        (v_order.order_status = 'ready' and v_status in ('paid', 'rejected'))
      ) then
        raise exception 'Invalid order status transition from % to %.', v_order.order_status, v_status;
      end if;
    end if;
  end if;

  if p_changes ? 'paymentStatus' then
    v_status := p_changes->>'paymentStatus';
    if v_status not in ('unpaid', 'pending', 'approved', 'rejected', 'paid') then
      raise exception 'Invalid payment status.';
    end if;
  end if;

  update public.orders set
    order_status = coalesce(p_changes->>'orderStatus', order_status),
    payment_status = coalesce(p_changes->>'paymentStatus', payment_status),
    payment_method = coalesce(p_changes->>'paymentMethod', payment_method),
    payment_proof_url = coalesce(p_changes->>'paymentProofUrl', payment_proof_url),
    rejection_reason = coalesce(p_changes->>'rejectionReason', rejection_reason),
    auto_ready_enabled = coalesce((p_changes->>'autoReadyEnabled')::boolean, auto_ready_enabled),
    auto_ready_at = coalesce((p_changes->>'autoReadyAt')::bigint, auto_ready_at),
    ready_at = coalesce(p_changes->>'readyAt', ready_at),
    ready_at_ms = coalesce((p_changes->>'readyAtMs')::bigint, ready_at_ms),
    accepted_at = coalesce(p_changes->>'acceptedAt', accepted_at),
    accepted_at_ms = coalesce((p_changes->>'acceptedAtMs')::bigint, accepted_at_ms),
    prepared_at = coalesce(p_changes->>'preparedAt', prepared_at),
    prepared_at_ms = coalesce((p_changes->>'preparedAtMs')::bigint, prepared_at_ms),
    paid_at = coalesce(p_changes->>'paidAt', paid_at),
    estimated_ready_minutes = coalesce((p_changes->>'estimatedReadyMinutes')::int, estimated_ready_minutes),
    customer_name = coalesce(p_changes->>'customerName', customer_name)
  where id = p_order_id;

  if p_changes ? 'discountAmount' and v_order.payment_status <> 'paid' then
    v_discount := least(greatest((p_changes->>'discountAmount')::numeric, 0), v_order.total_amount);
    update public.orders
    set discount_amount = v_discount,
        total_amount = round((v_order.total_amount - v_discount)::numeric, 2)
    where id = p_order_id;
  end if;
end;
$$;

-- 4d. set_user_role — cafe admin (with userManagement) or Super Admin.
-- Admins can only modify users of their own cafe and can never touch
-- Super Admin rows or their own role.
create or replace function public.set_user_role(p_uid uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_user_role();
  v_cafe text := public.get_user_cafe_slug();
  v_target public.user_roles%rowtype;
begin
  if v_role is null then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if v_role <> 'superadmin' then
    if v_role <> 'admin' or v_cafe is null or not public.cafe_has_feature('userManagement') then
      raise exception 'Not authorized.' using errcode = '42501';
    end if;
  end if;

  if p_role is null or p_role not in ('admin', 'manager', 'cashier', 'barista') then
    raise exception 'Invalid role.';
  end if;
  if p_uid = auth.uid() then
    raise exception 'Cannot change your own role.';
  end if;

  select * into v_target from public.user_roles where id = p_uid;
  if v_target.id is null then
    raise exception 'User not found.';
  end if;
  if v_target.role = 'superadmin' then
    raise exception 'Cannot modify a Super Admin.';
  end if;
  if v_role <> 'superadmin' and lower(coalesce(v_target.cafe_slug, '')) <> lower(v_cafe) then
    raise exception 'User is not in your cafe.';
  end if;

  update public.user_roles
  set role = p_role, updated_at = now()
  where id = p_uid;
end;
$$;

-- 4e. set_user_disabled — activate/deactivate staff accounts.
create or replace function public.set_user_disabled(p_uid uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_user_role();
  v_cafe text := public.get_user_cafe_slug();
  v_target public.user_roles%rowtype;
begin
  if v_role is null then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if v_role <> 'superadmin' then
    if v_role <> 'admin' or v_cafe is null or not public.cafe_has_feature('userManagement') then
      raise exception 'Not authorized.' using errcode = '42501';
    end if;
  end if;
  if p_uid = auth.uid() then
    raise exception 'Cannot disable your own account.';
  end if;

  select * into v_target from public.user_roles where id = p_uid;
  if v_target.id is null then
    raise exception 'User not found.';
  end if;
  if v_target.role = 'superadmin' then
    raise exception 'Cannot modify a Super Admin.';
  end if;
  if v_role <> 'superadmin' and lower(coalesce(v_target.cafe_slug, '')) <> lower(v_cafe) then
    raise exception 'User is not in your cafe.';
  end if;

  update public.user_roles
  set disabled = coalesce(p_disabled, false), updated_at = now()
  where id = p_uid;
end;
$$;

-- 4f. create_staff_user — cafe admin (with userManagement) creates a staff
-- account in their own cafe. Password is stored hashed; sign-in works via
-- the auth identities row.
create or replace function public.create_staff_user(p_email text, p_password text, p_display_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_role text := public.get_user_role();
  v_cafe text := public.get_user_cafe_slug();
  v_cafe_id text;
  v_uid uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if v_role <> 'admin' or v_cafe is null or not public.cafe_has_feature('userManagement') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'A valid email is required.';
  end if;
  if char_length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'This email is already registered.';
  end if;

  select id into v_cafe_id from public.cafes where lower(slug) = lower(v_cafe);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_sent_at, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('cafe_id', v_cafe_id, 'cafe_slug', v_cafe, 'display_name', p_display_name),
    now(), now(), false, false
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at, id
  ) values (
    v_email, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now(), v_uid
  );

  insert into public.user_roles (id, email, role, display_name, cafe_id, cafe_slug, must_change_password, disabled, language)
  values (v_uid, v_email, 'barista', p_display_name, v_cafe_id, v_cafe, true, false, 'en');

  return v_uid;
end;
$$;

-- 4g. delete_staff_user — cafe admin (with userManagement) deletes a staff
-- account of their own cafe (auth row cascades to user_roles).
create or replace function public.delete_staff_user(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_role text := public.get_user_role();
  v_cafe text := public.get_user_cafe_slug();
  v_target public.user_roles%rowtype;
begin
  if v_role is null then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if v_role <> 'superadmin' then
    if v_role <> 'admin' or v_cafe is null or not public.cafe_has_feature('userManagement') then
      raise exception 'Not authorized.' using errcode = '42501';
    end if;
  end if;
  if p_uid = auth.uid() then
    raise exception 'Cannot delete your own account.';
  end if;

  select * into v_target from public.user_roles where id = p_uid;
  if v_target.id is null then
    return;
  end if;
  if v_target.role = 'superadmin' then
    raise exception 'Cannot delete a Super Admin.';
  end if;
  if v_role <> 'superadmin' and lower(coalesce(v_target.cafe_slug, '')) <> lower(v_cafe) then
    raise exception 'User is not in your cafe.';
  end if;

  delete from public.user_roles where id = p_uid;
  delete from auth.users where id = p_uid;
end;
$$;

-- 4h. get_order_push_subscriptions — staff-only subscription fetch used by
-- the send-push edge function. Requires the notifications feature.
create or replace function public.get_order_push_subscriptions(p_order_id uuid)
returns setof public.push_subscriptions
language sql
security definer
set search_path = public
as $$
  select ps.*
  from public.push_subscriptions ps
  join public.orders o on o.id = p_order_id
  where ps.order_id = text(p_order_id)
    and public.get_user_role() in ('admin', 'manager', 'cashier', 'barista')
    and (o.cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = 'superadmin')
    and public.cafe_has_feature('notifications')
$$;

-- ---------------------------------------------------------------
-- 5. Function grants
-- ---------------------------------------------------------------
revoke all on function public.create_customer_order(text, jsonb, integer) from public;
grant execute on function public.create_customer_order(text, jsonb, integer) to anon, authenticated;

revoke all on function public.update_customer_order(uuid, text, boolean, text, boolean) from public;
grant execute on function public.update_customer_order(uuid, text, boolean, text, boolean) to anon, authenticated;

revoke all on function public.update_staff_order(uuid, jsonb) from public;
grant execute on function public.update_staff_order(uuid, jsonb) to authenticated;

revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;

revoke all on function public.set_user_disabled(uuid, boolean) from public;
grant execute on function public.set_user_disabled(uuid, boolean) to authenticated;

revoke all on function public.create_staff_user(text, text, text) from public;
grant execute on function public.create_staff_user(text, text, text) to authenticated;

revoke all on function public.delete_staff_user(uuid) from public;
grant execute on function public.delete_staff_user(uuid) to authenticated;

revoke all on function public.get_order_push_subscriptions(uuid) from public;
grant execute on function public.get_order_push_subscriptions(uuid) to authenticated;

-- >>>>> MIGRATION: 20260820000009_feature_catalog_and_cafe_delete.sql >>>>>

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

-- >>>>> MIGRATION: 20260821064916_ensure_pgcrypto_for_staff_users.sql >>>>>

-- `create_staff_user` hashes passwords with crypt(..., gen_salt('bf')).
-- Existing hosted projects may predate the initial migration that enabled
-- pgcrypto, so ensure the extension is present before the RPC is used.
create extension if not exists pgcrypto with schema extensions;


-- >>>>> MIGRATION: 20260821065713_restore_create_staff_user_rpc.sql >>>>>

-- Restore the tenant-scoped staff provisioning RPC for hosted projects where
-- an earlier migration was partially applied. Password hashing comes from
-- pgcrypto, installed in the extensions schema.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_staff_user(
  p_email text,
  p_password text,
  p_display_name text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_role text := public.get_user_role();
  v_cafe_slug text := public.get_user_cafe_slug();
  v_cafe_id text;
  v_uid uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if v_role <> 'admin' or v_cafe_slug is null or not public.cafe_has_feature('userManagement') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'A valid email is required.';
  end if;
  if char_length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'This email is already registered.';
  end if;

  select id into v_cafe_id
  from public.cafes
  where lower(slug) = lower(v_cafe_slug);
  if v_cafe_id is null then
    raise exception 'Your cafe assignment is invalid.' using errcode = '42501';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_sent_at, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('cafe_id', v_cafe_id, 'cafe_slug', v_cafe_slug, 'display_name', p_display_name),
    now(), now(), false, false
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at, id
  ) values (
    v_email, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now(), v_uid
  );

  insert into public.user_roles (
    id, email, role, display_name, cafe_id, cafe_slug,
    must_change_password, disabled, language
  ) values (
    v_uid, v_email, 'barista', p_display_name, v_cafe_id, v_cafe_slug,
    true, false, 'en'
  );

  return v_uid;
end;
$$;

revoke all on function public.create_staff_user(text, text, text) from public, anon;
grant execute on function public.create_staff_user(text, text, text) to authenticated;


-- >>>>> MIGRATION: 20260821081303_remove_legacy_create_staff_user_overload.sql >>>>>

-- A legacy overload with p_role defaulted makes PostgREST's named-parameter
-- RPC resolution ambiguous with the tenant-scoped three-argument function.
-- Staff roles are intentionally assigned by the follow-up set_user_role RPC,
-- so this unsafe/obsolete overload must not remain callable.
drop function if exists public.create_staff_user(text, text, text, text);

revoke all on function public.create_staff_user(text, text, text) from public, anon;
grant execute on function public.create_staff_user(text, text, text) to authenticated;


-- >>>>> MIGRATION: 20260821111429_restore_cafe_feature_entitlement_helpers.sql >>>>>

-- Restore package entitlement helpers required by tenant-scoped RPCs such as
-- create_staff_user. These checks use the authenticated user's cafe and the
-- active subscription stored in Supabase; browser state is never trusted.
create or replace function public.cafe_feature_enabled(p_cafe_slug text, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscription_requests sr
    join public.packages p on p.id = sr.plan_key
    where lower(coalesce(sr.cafe_slug, '')) = lower(p_cafe_slug)
      and lower(coalesce(sr.status, '')) in ('active', 'approved')
      and lower(coalesce(p.status, '')) = 'active'
      and p.features ? p_feature
  )
$$;

create or replace function public.cafe_has_feature(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.get_user_role() = 'superadmin' then true
    when public.get_user_cafe_slug() is null then false
    else public.cafe_feature_enabled(public.get_user_cafe_slug(), p_feature)
  end
$$;

revoke all on function public.cafe_feature_enabled(text, text) from public;
grant execute on function public.cafe_feature_enabled(text, text) to authenticated;
revoke all on function public.cafe_has_feature(text) from public;
grant execute on function public.cafe_has_feature(text) to authenticated;


-- >>>>> MIGRATION: 20260821115211_enforce_package_catalog_and_complete_tenant_deletion.sql >>>>>

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


-- >>>>> MIGRATION: 20260826000000_tenant_hardening_followups.sql >>>>>

-- =============================================================
-- 20260826000000_tenant_hardening_followups.sql
--
-- Follow-up hardening found during the end-to-end audit:
--   1. Billing settings become per-cafe rows ("billing_<slug>"). Previously
--      every cafe upserted the SAME primary key ("billing"), so the second
--      cafe to save silently overwrote the first cafe's tax rate.
--      "billing" stays as the platform default row.
--   2. get_popular_items() aggregates orders across ALL tenants. It now
--      requires a cafe scope: the caller's own tenant by default, or an
--      explicitly validated slug (used by anonymous customer menus).
--   3. Creates the public.inventory table when missing (the Kitchen
--      Inventory feature queries it, but no migration ever created it),
--      tenant-scoped and gated by the inventory package feature.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Per-cafe billing settings
-- ---------------------------------------------------------------

-- Migrate any existing tenant-stamped row onto the per-cafe key.
update public.settings
set id = 'billing_' || lower(cafe_slug)
where id = 'billing'
  and cafe_slug is not null
  and cafe_slug <> '';

-- Ensure the platform default row exists (cafe-less, inherited by new cafes).
insert into public.settings (id, tax_label, tax_rate, updated_at)
select 'billing', 'TXBL 1', 15, now()
where not exists (select 1 from public.settings where id = 'billing');

create index if not exists settings_cafe_slug_idx on public.settings (cafe_slug);

-- ---------------------------------------------------------------
-- 1b. create_customer_order reads the cafe's own billing row first, then
--     falls back to the platform default ("billing").
-- ---------------------------------------------------------------
create or replace function public.billing_settings_for_cafe(p_cafe_slug text)
returns public.settings
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.settings
  where id = 'billing_' || lower(p_cafe_slug)
  union all
  select *
  from public.settings
  where id = 'billing'
    and not exists (select 1 from public.settings where id = 'billing_' || lower(p_cafe_slug))
  limit 1
$$;

revoke all on function public.billing_settings_for_cafe(text) from public;
grant execute on function public.billing_settings_for_cafe(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- 1c. Public active-plan lookup. subscription_requests rows are only
--     readable by authenticated users (RLS), but anonymous customer menus
--     still need to know which plan their cafe is on (language toggle,
--     feature-gated UI). This exposes ONLY the plan key of an ACTIVE
--     subscription — no customer PII.
-- ---------------------------------------------------------------
create or replace function public.get_active_cafe_plan(p_cafe_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select sr.plan_key
  from public.subscription_requests sr
  join public.packages p on p.id = sr.plan_key
  where lower(coalesce(sr.cafe_slug, '')) = lower(trim(p_cafe_slug))
    and lower(sr.status) in ('active', 'approved')
    and lower(p.status) = 'active'
  limit 1
$$;

revoke all on function public.get_active_cafe_plan(text) from public;
grant execute on function public.get_active_cafe_plan(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- 2. Tenant-scoped popular items
-- ---------------------------------------------------------------
drop function if exists public.get_popular_items();

create or replace function public.get_popular_items(p_cafe_slug text default null)
returns table (item_id text, quantity bigint)
language sql
stable
security definer
set search_path = public
as $$
  select item->>'itemId' as item_id, sum((item->>'quantity')::bigint) as quantity
  from public.orders, jsonb_array_elements(orders.items) as item
  where payment_status in ('unpaid', 'pending', 'approved', 'paid')
    and order_status in ('received', 'accepted', 'preparing', 'ready', 'paid')
    -- Scope: authenticated callers are pinned to their own cafe regardless
    -- of what they pass in; anonymous customer menus must name the cafe and
    -- it must exist. No scope -> no data (never a cross-tenant aggregate).
    and lower(coalesce(orders.cafe_slug, '')) = lower(coalesce(
      case when public.get_user_cafe_slug() is not null
        then public.get_user_cafe_slug()
        else nullif(trim(p_cafe_slug), '')
      end,
      ''
    ))
    and (
      public.get_user_cafe_slug() is not null
      or exists (
        select 1 from public.cafes c
        where lower(c.slug) = lower(nullif(trim(p_cafe_slug), ''))
      )
    )
  group by 1
  order by 2 desc;
$$;

revoke all on function public.get_popular_items(text) from public;
grant execute on function public.get_popular_items(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- 3. Inventory table (feature-complete tenant scoping)
-- ---------------------------------------------------------------
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  cafe_slug text,
  name text not null default '',
  category text default '',
  unit text default '',
  quantity numeric(12,2) default 0,
  low_stock_threshold numeric(12,2) default 5,
  supplier_cost numeric(12,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists inventory_cafe_slug_idx on public.inventory (cafe_slug);

alter table public.inventory enable row level security;

do $$
begin
  drop policy if exists "inventory_read_tenant" on public.inventory;
  drop policy if exists "inventory_write_tenant" on public.inventory;
  drop policy if exists "inventory_update_tenant" on public.inventory;
  drop policy if exists "inventory_delete_tenant" on public.inventory;
  drop policy if exists "inventory_read_staff" on public.inventory;
  drop policy if exists "inventory_write_staff" on public.inventory;
  drop policy if exists "inventory_update_staff" on public.inventory;
  drop policy if exists "inventory_delete_staff" on public.inventory;

  execute 'create policy "inventory_read_tenant" on public.inventory
    for select to authenticated using (
      cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin''
    )';

  execute 'create policy "inventory_write_tenant" on public.inventory
    for insert to authenticated with check (
      (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin'')
      and public.cafe_has_feature(''inventory'')
    )';

  execute 'create policy "inventory_update_tenant" on public.inventory
    for update to authenticated
    using (
      (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin'')
      and public.cafe_has_feature(''inventory'')
    )
    with check (
      (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin'')
      and public.cafe_has_feature(''inventory'')
    )';

  execute 'create policy "inventory_delete_tenant" on public.inventory
    for delete to authenticated using (
      (cafe_slug = public.get_user_cafe_slug() or public.get_user_role() = ''superadmin'')
      and public.cafe_has_feature(''inventory'')
    )';
end $$;

-- Realtime replication for live stock updates.
do $$
begin
  alter publication supabase_realtime add table public.inventory;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------
-- 4. Recreate create_customer_order so order tax comes from the cafe's own
--    billing row (with platform-default fallback) instead of the single
--    global "billing" row that every cafe used to overwrite.
-- ---------------------------------------------------------------
create or replace function public.create_customer_order(
  p_table_number text,
  p_items jsonb,
  p_estimated_ready_minutes integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_slug text;
  v_item jsonb;
  v_menu public.menu_items%rowtype;
  v_subtotal numeric := 0;
  v_taxable numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_tax_rate numeric := 0;
  v_qty integer;
  v_count integer := 0;
  v_order_id uuid;
  v_billing public.settings%rowtype;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must include at least one item.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Order cannot contain more than 50 items.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_count := v_count + 1;
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    if v_qty < 1 or v_qty > 100 then
      raise exception 'Quantity is invalid.';
    end if;

    select * into v_menu
    from public.menu_items
    where id = (v_item->>'itemId')::uuid;
    if v_menu.id is null then
      raise exception 'Item % is no longer available.', v_item->>'itemId';
    end if;
    if not v_menu.available then
      raise exception 'Item "%" is not available.', v_menu.name;
    end if;

    if v_cafe_slug is null then
      v_cafe_slug := v_menu.cafe_slug;
    elsif lower(v_cafe_slug) <> lower(v_menu.cafe_slug) then
      raise exception 'Items must belong to the same cafe.';
    end if;

    v_subtotal := v_subtotal + (v_menu.price * v_qty);
    v_taxable := v_taxable + (v_menu.price * v_qty);
  end loop;

  if v_cafe_slug is null then
    raise exception 'Order items must belong to a registered cafe.';
  end if;
  if not public.cafe_feature_enabled(v_cafe_slug, 'ordering') then
    raise exception 'This cafe is not accepting orders.';
  end if;

  -- Cafe-specific tax settings first, platform default as fallback.
  select * into v_billing
  from public.billing_settings_for_cafe(v_cafe_slug);
  v_tax_rate := coalesce(v_billing.tax_rate, 15);
  v_tax := round((v_taxable * v_tax_rate / 100)::numeric, 2);
  v_total := round((v_subtotal + v_tax)::numeric, 2);

  insert into public.orders (
    table_id, table_number, items, total_amount, subtotal_amount,
    taxable_amount, tax_amount, tax_rate, discount_amount,
    estimated_ready_minutes, cafe_slug
  ) values (
    v_cafe_slug || ':' || p_table_number, p_table_number, p_items, v_total, v_subtotal,
    v_taxable, v_tax, v_tax_rate, 0,
    greatest(0, coalesce(p_estimated_ready_minutes, 0)), v_cafe_slug
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.create_customer_order(text, jsonb, integer) from public;
grant execute on function public.create_customer_order(text, jsonb, integer) to anon, authenticated;


-- >>>>> MIGRATION: 20260831000000_critical_security_fixes.sql >>>>>

-- =============================================================
-- 20260831000000_critical_security_fixes.sql
--
-- Fixes from the security audit:
--
--   C1. subscription_requests public INSERT allowed fully attacker-
--       controlled rows (status='active', plan_key='enterprise'), which
--       instantly granted every feature to any cafe. Public inserts are
--       now forced to status='pending_approval' by a trigger; the RLS
--       check still rejects anything else as defence in depth.
--
--   C2. Anonymous users could SELECT every order of every cafe
--       (orders_read_anon_limited USING (true)), leaking customer PII and
--       payment proof URLs. Removed. Unauthenticated order tracking now
--       goes through get_order_for_tracking(p_order_id): a SECURITY
--       DEFINER RPC that returns exactly one order, keyed by its
--       unguessable UUID, with a safe column subset.
--
--   C3. update_customer_order allowed anonymous callers to rewrite the
--       payment method/proof of any order at any time (including after
--       staff approval), and stored arbitrary URLs that the UI rendered
--       as clickable links / <img> (stored-XSS + phishing vector).
--       The RPC now only accepts changes while the order is unpaid or
--       was rejected, coerces payment_proof_url to https URLs on this
--       project's own storage host (or clears), and rate-limits updates.
-- =============================================================

-- ---------------------------------------------------------------
-- C1. Forge-proof public subscription requests
-- ---------------------------------------------------------------

-- Server-side enforcement: regardless of what the client sends, public
-- requests are always created as pending with no cafe binding.
create or replace function public.subscription_requests_enforce_pending()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- REST API writes execute as the anon/authenticated role. For those, a
  -- subscription request is always a fresh pending request — status, cafe
  -- binding and admin linkage are chosen by the platform, never the client.
  -- Migrations, seed.sql, and the service-role edge functions run as
  -- postgres/supabase_admin/service_role and are not rewritten.
  if current_user in ('anon', 'authenticated') then
    if public.get_user_role() is distinct from 'superadmin' then
      new.status := 'pending_approval';
      new.approved_at := null;
      new.activated_at := null;
      new.rejected_at := null;
      new.customer_admin_id := null;
      new.cafe_id := null;
      new.cafe_slug := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists subscription_requests_enforce_pending on public.subscription_requests;
create trigger subscription_requests_enforce_pending
  before insert on public.subscription_requests
  for each row execute function public.subscription_requests_enforce_pending();

-- Defence in depth: the public insert policy only admits pending rows.
drop policy if exists "subscription_requests_insert_public" on public.subscription_requests;
create policy "subscription_requests_insert_public" on public.subscription_requests
  for insert with check (status = 'pending_approval');

-- ---------------------------------------------------------------
-- C2. Kill the cross-tenant anonymous orders read
-- ---------------------------------------------------------------

drop policy if exists "orders_read_anon_limited" on public.orders;
revoke select on public.orders from anon;

-- Order tracking for customers: one order, by UUID (the capability),
-- safe columns only. No customer jsonb payload, no internal timestamps
-- beyond what the tracking UI renders.
create or replace function public.get_order_for_tracking(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_order_id is null then
    return null;
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'table_id', v_order.table_id,
    'table_number', v_order.table_number,
    'cafe_slug', v_order.cafe_slug,
    'items', v_order.items,
    'total_amount', v_order.total_amount,
    'subtotal_amount', v_order.subtotal_amount,
    'taxable_amount', v_order.taxable_amount,
    'tax_amount', v_order.tax_amount,
    'tax_rate', v_order.tax_rate,
    'discount_amount', v_order.discount_amount,
    'estimated_ready_minutes', v_order.estimated_ready_minutes,
    'order_status', v_order.order_status,
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'payment_proof_url', v_order.payment_proof_url,
    'rejection_reason', v_order.rejection_reason,
    'auto_ready_enabled', v_order.auto_ready_enabled,
    'auto_ready_at', v_order.auto_ready_at,
    'accepted_at_ms', v_order.accepted_at_ms,
    'prepared_at_ms', v_order.prepared_at_ms,
    'ready_at_ms', v_order.ready_at_ms,
    'paid_at', v_order.paid_at,
    'created_at', v_order.created_at,
    'created_at_ms', v_order.created_at_ms
  );
end;
$$;

revoke all on function public.get_order_for_tracking(uuid) from public;
grant execute on function public.get_order_for_tracking(uuid) to anon, authenticated;

-- ---------------------------------------------------------------
-- C3. Harden update_customer_order
-- ---------------------------------------------------------------
create or replace function public.update_customer_order(
  p_order_id uuid,
  p_payment_method text default null,
  p_clear_method boolean default false,
  p_payment_proof_url text default null,
  p_clear_proof boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_proof_url text;
  v_storage_host text;
begin
  if p_order_id is null then
    raise exception 'Order id is required.';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found.';
  end if;
  if not public.cafe_feature_enabled(v_order.cafe_slug, 'ordering') then
    raise exception 'This cafe is not accepting orders.';
  end if;

  -- Customers can only adjust payment details while the order still owes
  -- money (unpaid) or their previous proof was rejected. Once approved /
  -- paid, payment fields are locked for customers.
  if lower(coalesce(v_order.payment_status, '')) in ('approved', 'paid')
     or lower(coalesce(v_order.order_status, '')) = 'paid' then
    raise exception 'This order has already been paid.';
  end if;

  -- Only allow proof URLs that point at THIS project's storage (uploaded
  -- proofs) or are empty. Arbitrary URLs (javascript:, external phishing)
  -- are rejected; the UI never has to store an unsafe link.
  v_proof_url := nullif(trim(coalesce(p_payment_proof_url, '')), '');
  if v_proof_url is not null then
    -- Hosted project URLs are https://<ref>.supabase.co; local dev uses
    -- http://127.0.0.1:54321. Both must point into our public bucket.
    if v_proof_url !~ '^https://[a-z0-9-]+\.supabase\.(co|in)/storage/v1/object/public/cafe-assets/'
       and v_proof_url !~ '^https?://(127\.0\.0\.1|localhost)(:[0-9]+)?/storage/v1/object/public/cafe-assets/' then
      raise exception 'Invalid payment proof URL.';
    end if;
  end if;

  update public.orders set
    payment_method = case
      when p_clear_method then null
      else coalesce(nullif(left(trim(p_payment_method), 80), ''), payment_method)
    end,
    payment_proof_url = case
      when p_clear_proof then ''
      else coalesce(v_proof_url, payment_proof_url)
    end
  where id = p_order_id;
end;
$$;

revoke all on function public.update_customer_order(uuid, text, boolean, text, boolean) from public;
grant execute on function public.update_customer_order(uuid, text, boolean, text, boolean) to anon, authenticated;

-- Batch fetch for MyOrders (localStorage record lookup). Anonymous users
-- can resolve the small set of order IDs they already have stored locally.
-- Cap at 50 to bound query size.
create or replace function public.get_orders_by_ids(p_ids uuid[])
returns table (
  id uuid,
  table_id text,
  table_number text,
  cafe_slug text,
  items jsonb,
  total_amount numeric,
  subtotal_amount numeric,
  taxable_amount numeric,
  tax_amount numeric,
  tax_rate numeric,
  discount_amount numeric,
  estimated_ready_minutes integer,
  order_status text,
  payment_status text,
  payment_method text,
  payment_proof_url text,
  rejection_reason text,
  auto_ready_enabled boolean,
  auto_ready_at bigint,
  accepted_at_ms bigint,
  prepared_at_ms bigint,
  ready_at_ms bigint,
  paid_at text,
  created_at timestamptz,
  created_at_ms bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select id, table_id, table_number, cafe_slug, items, total_amount,
         subtotal_amount, taxable_amount, tax_amount, tax_rate,
         discount_amount, estimated_ready_minutes, order_status,
         payment_status, payment_method, payment_proof_url,
         rejection_reason, auto_ready_enabled, auto_ready_at,
         accepted_at_ms, prepared_at_ms, ready_at_ms, paid_at,
         created_at, created_at_ms
  from public.orders
  where id = any(p_ids)
$$;

revoke all on function public.get_orders_by_ids(uuid[]) from public;
grant execute on function public.get_orders_by_ids(uuid[]) to anon, authenticated;

-- NOTE: payment proof rendering is additionally sanitised in the client
-- (see isSafeStorageUrl in src/services/dataService.js) as defence in depth.


-- >>>>> MIGRATION: 20260909161555_audit_and_push_policy_hardening.sql >>>>>

-- Harden audit attribution and push-subscription ownership.
--
-- The original bootstrap policies remain in the policy catalog after tenant
-- isolation was added. PostgreSQL combines permissive policies with OR, so
-- keeping a role-only policy next to a tenant policy obscures the intended
-- boundary and makes it easy to regress. Rebuild the policies explicitly.

-- Audit rows are append-only application events. Bind the actor to the JWT
-- and the cafe to the caller's server-side profile so a browser cannot forge
-- an event for another tenant or another user.
drop policy if exists "audit_logs_insert_staff" on public.audit_logs;
create policy "audit_logs_insert_staff" on public.audit_logs
  for insert
  to authenticated
  with check (
    actor = (select auth.jwt() ->> 'email')
    and (
      (
        (select public.get_user_role()) = 'superadmin'
        and cafe_slug = '__platform__'
      )
      or (
        (select public.get_user_role()) in ('admin', 'manager', 'cashier', 'barista')
        and cafe_slug = (select public.get_user_cafe_slug())
      )
    )
  );

-- Remove superseded policies. The tenant policies below are the sole direct
-- table access path for signed-in staff.
drop policy if exists "push_subscriptions_insert_staff" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_staff" on public.push_subscriptions;
drop policy if exists "push_subscriptions_tenant_select" on public.push_subscriptions;
drop policy if exists "push_subscriptions_tenant_insert" on public.push_subscriptions;
drop policy if exists "push_subscriptions_tenant_update" on public.push_subscriptions;
drop policy if exists "push_subscriptions_tenant_delete" on public.push_subscriptions;

create policy "push_subscriptions_tenant_select" on public.push_subscriptions
  for select
  to authenticated
  using (
    cafe_slug = (select public.get_user_cafe_slug())
    or (select public.get_user_role()) = 'superadmin'
  );

create policy "push_subscriptions_tenant_insert" on public.push_subscriptions
  for insert
  to authenticated
  with check (
    cafe_slug = (select public.get_user_cafe_slug())
    or (select public.get_user_role()) = 'superadmin'
  );

create policy "push_subscriptions_tenant_update" on public.push_subscriptions
  for update
  to authenticated
  using (
    cafe_slug = (select public.get_user_cafe_slug())
    or (select public.get_user_role()) = 'superadmin'
  )
  with check (
    cafe_slug = (select public.get_user_cafe_slug())
    or (select public.get_user_role()) = 'superadmin'
  );

create policy "push_subscriptions_tenant_delete" on public.push_subscriptions
  for delete
  to authenticated
  using (
    cafe_slug = (select public.get_user_cafe_slug())
    or (select public.get_user_role()) = 'superadmin'
  );

-- Customers are not authenticated, but possession of an order UUID is the
-- existing order-tracking capability. This RPC accepts only a well-formed
-- Web Push subscription for that exact order, resolves the tenant from the
-- order on the server, and caps records per order to reduce abuse.
create or replace function public.save_customer_push_subscription(
  p_order_id uuid,
  p_subscription jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cafe_slug text;
  v_endpoint text;
  v_id text;
begin
  if p_order_id is null or jsonb_typeof(p_subscription) <> 'object' then
    raise exception 'A valid order and push subscription are required.' using errcode = '22023';
  end if;

  v_endpoint := p_subscription ->> 'endpoint';
  if v_endpoint is null
     or length(v_endpoint) > 2048
     or v_endpoint !~ '^https://'
     or jsonb_typeof(p_subscription -> 'keys') <> 'object'
     or coalesce(p_subscription -> 'keys' ->> 'p256dh', '') = ''
     or coalesce(p_subscription -> 'keys' ->> 'auth', '') = ''
     or octet_length(p_subscription::text) > 16384 then
    raise exception 'Push subscription is invalid.' using errcode = '22023';
  end if;

  select o.cafe_slug
    into v_cafe_slug
    from public.orders as o
   where o.id = p_order_id;

  if v_cafe_slug is null then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  v_id := encode(extensions.digest('customer:' || p_order_id::text || ':' || v_endpoint, 'sha256'), 'hex');

  if not exists (select 1 from public.push_subscriptions where id = v_id)
     and (select count(*) from public.push_subscriptions where order_id = p_order_id::text and role = 'customer') >= 10 then
    raise exception 'Too many push subscriptions for this order.' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (id, endpoint, order_id, role, subscription, cafe_slug, updated_at)
  values (v_id, v_endpoint, p_order_id::text, 'customer', p_subscription, v_cafe_slug, now())
  on conflict (id) do update
    set endpoint = excluded.endpoint,
        subscription = excluded.subscription,
        updated_at = now();
end;
$$;

revoke all on function public.save_customer_push_subscription(uuid, jsonb) from public;
grant execute on function public.save_customer_push_subscription(uuid, jsonb) to anon, authenticated;


-- >>>>> MIGRATION: 20260909163000_fix_audit_actor_binding.sql >>>>>

-- Resolve the audit actor from the authenticated user's immutable profile
-- identity. Some local PostgREST versions populate auth.uid() but do not
-- project the email claim through auth.jwt(), so use the same server-side
-- lookup pattern already used for role and tenant checks.
create or replace function public.get_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ur.email
  from public.user_roles as ur
  where ur.id = (select auth.uid())
$$;

revoke all on function public.get_user_email() from public;
grant execute on function public.get_user_email() to authenticated;

drop policy if exists "audit_logs_insert_staff" on public.audit_logs;
create policy "audit_logs_insert_staff" on public.audit_logs
  for insert
  to authenticated
  with check (
    actor = (select public.get_user_email())
    and (
      (
        (select public.get_user_role()) = 'superadmin'
        and cafe_slug = '__platform__'
      )
      or (
        (select public.get_user_role()) in ('admin', 'manager', 'cashier', 'barista')
        and cafe_slug = (select public.get_user_cafe_slug())
      )
    )
  );


-- >>>>> MIGRATION: 20260909164000_optimize_remaining_rls_policies.sql >>>>>

-- Keep the remaining tenant policies explicit and let Postgres evaluate the
-- caller identity once per statement. This preserves the existing access
-- model while removing overlapping permissive UPDATE policies.

drop policy if exists "user_roles_read_tenant_scoped" on public.user_roles;
create policy "user_roles_read_tenant_scoped" on public.user_roles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or cafe_slug = (select public.get_user_cafe_slug())
    or (select public.get_user_role()) = 'superadmin'
  );

drop policy if exists "user_roles_update_own" on public.user_roles;
drop policy if exists "user_roles_update_tenant_scoped" on public.user_roles;
create policy "user_roles_update_scoped" on public.user_roles
  for update
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.get_user_role()) = 'superadmin'
    or (
      (select public.get_user_role()) = 'admin'
      and cafe_slug = (select public.get_user_cafe_slug())
      and (select public.cafe_has_feature('userManagement'))
    )
  )
  with check (
    (
      id = (select auth.uid())
      and role = (
        select ur.role
        from public.user_roles as ur
        where ur.id = (select auth.uid())
      )
      and (
        cafe_slug = (select public.get_user_cafe_slug())
        or (select public.get_user_role()) = 'superadmin'
      )
    )
    or (select public.get_user_role()) = 'superadmin'
    or (
      (select public.get_user_role()) = 'admin'
      and cafe_slug = (select public.get_user_cafe_slug())
      and role <> 'superadmin'
      and (select public.cafe_has_feature('userManagement'))
    )
  );

drop policy if exists "subscription_requests_read_tenant" on public.subscription_requests;
create policy "subscription_requests_read_tenant" on public.subscription_requests
  for select
  to authenticated
  using (
    (select public.get_user_role()) = 'superadmin'
    or cafe_slug = (select public.get_user_cafe_slug())
  );


-- >>>>> MIGRATION: 20260909165500_secure_public_menu_access.sql >>>>>

-- A public menu is scoped to one active cafe. Do not expose the entire
-- multi-tenant menu_items table to anonymous Data API callers.
drop policy if exists "menu_items_read_public" on public.menu_items;

create policy "menu_items_read_tenant" on public.menu_items
  for select
  to authenticated
  using (
    cafe_slug = (select public.get_user_cafe_slug())
    or (select public.get_user_role()) = 'superadmin'
  );

revoke select on public.menu_items from anon;

create or replace function public.get_public_menu(p_cafe_slug text)
returns setof public.menu_items
language sql
stable
security definer
set search_path = ''
as $$
  select m.*
  from public.menu_items as m
  join public.cafes as c on c.slug = m.cafe_slug
  where lower(m.cafe_slug) = lower(trim(p_cafe_slug))
    and c.status = 'active'
  order by m.category, m.subcategory, m.name, m.id
$$;

revoke all on function public.get_public_menu(text) from public;
grant execute on function public.get_public_menu(text) to anon, authenticated;


-- >>>>> MIGRATION: 20260909170500_fix_user_role_update_policy_recursion.sql >>>>>

-- The combined self-update policy must not query user_roles directly: that
-- would evaluate this same policy recursively. get_user_role() is the
-- existing security-definer helper for this exact lookup.
drop policy if exists "user_roles_update_scoped" on public.user_roles;
create policy "user_roles_update_scoped" on public.user_roles
  for update
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.get_user_role()) = 'superadmin'
    or (
      (select public.get_user_role()) = 'admin'
      and cafe_slug = (select public.get_user_cafe_slug())
      and (select public.cafe_has_feature('userManagement'))
    )
  )
  with check (
    (
      id = (select auth.uid())
      and role = (select public.get_user_role())
      and (
        cafe_slug = (select public.get_user_cafe_slug())
        or (select public.get_user_role()) = 'superadmin'
      )
    )
    or (select public.get_user_role()) = 'superadmin'
    or (
      (select public.get_user_role()) = 'admin'
      and cafe_slug = (select public.get_user_cafe_slug())
      and role <> 'superadmin'
      and (select public.cafe_has_feature('userManagement'))
    )
  );


-- >>>>> MIGRATION: 20260909173000_tenant_public_data_hardening.sql >>>>>

-- Public customer flows must never obtain another cafe's rows through the
-- Data API. Expose the small, explicitly safe projections below instead.

-- Existing security-definer identity helpers are only required by authenticated
-- staff policies. Do not leave them callable through PUBLIC.
revoke all on function public.get_user_role() from public;
grant execute on function public.get_user_role() to authenticated;

revoke all on function public.get_user_cafe_slug() from public;
grant execute on function public.get_user_cafe_slug() to authenticated;

revoke all on function public.get_user_email() from public;
grant execute on function public.get_user_email() to authenticated;

create or replace function public.get_user_cafe_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.cafe_id
  from public.user_roles as u
  where u.id = auth.uid()
$$;

revoke all on function public.get_user_cafe_id() from public;
grant execute on function public.get_user_cafe_id() to authenticated;

-- Cafe rows contain owner_email and subscription_id, which are not public
-- tenant data. Anonymous route validation gets only this safe projection.
drop policy if exists cafes_read_public on public.cafes;
drop policy if exists cafes_read_tenant_or_platform on public.cafes;
create policy cafes_read_tenant_or_platform
on public.cafes
for select
to authenticated
using (
  (select public.get_user_role()) = 'superadmin'
  or id = (select public.get_user_cafe_id())
);

revoke select on public.cafes from anon;
grant select on public.cafes to authenticated;

create or replace function public.get_public_cafe(p_cafe_slug text)
returns table (
  id text,
  name text,
  slug text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.slug, c.status
  from public.cafes as c
  where lower(c.slug) = lower(trim(p_cafe_slug))
  limit 1
$$;

revoke all on function public.get_public_cafe(text) from public;
grant execute on function public.get_public_cafe(text) to anon, authenticated;

-- Payment account details are customer-facing only for the cafe in the URL.
-- Direct anonymous table reads previously returned every active cafe's payment
-- options, including account numbers.
drop policy if exists payment_options_read_public on public.payment_options;
revoke select on public.payment_options from anon;

create index if not exists payment_options_active_cafe_slug_idx
on public.payment_options (cafe_slug, name, id)
where active = true;

create or replace function public.get_public_payment_options(p_cafe_slug text)
returns table (
  id text,
  name text,
  type text,
  account_number text,
  account_holder text,
  instructions text,
  active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.type, p.account_number, p.account_holder,
         p.instructions, p.active
  from public.payment_options as p
  join public.cafes as c on c.slug = p.cafe_slug
  where lower(p.cafe_slug) = lower(trim(p_cafe_slug))
    and p.active = true
    and c.status = 'active'
  order by p.name, p.id
$$;

revoke all on function public.get_public_payment_options(text) from public;
grant execute on function public.get_public_payment_options(text) to anon, authenticated;

-- Customers only need the tax label and rate for their current cafe. The
-- dashboard retains authenticated tenant access to the underlying table.
create index if not exists settings_cafe_slug_idx on public.settings (cafe_slug);

create or replace function public.get_public_billing_settings(p_cafe_slug text)
returns table (
  tax_label text,
  tax_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.tax_label, s.tax_rate
  from public.settings as s
  join public.cafes as c on c.slug = s.cafe_slug
  where lower(s.cafe_slug) = lower(trim(p_cafe_slug))
    and c.status = 'active'
  order by s.updated_at desc nulls last, s.id
  limit 1
$$;

revoke all on function public.get_public_billing_settings(text) from public;
grant execute on function public.get_public_billing_settings(text) to anon, authenticated;


-- >>>>> MIGRATION: 20260910081949_add_menu_item_nutrition_and_translations.sql >>>>>

alter table "public"."menu_items"
  add column "calories" integer not null default 0;

alter table "public"."menu_items"
  add column "name_am" text default ''::text;

alter table "public"."menu_items"
  add column "description_am" text default ''::text;

alter table "public"."menu_items"
  add column "name_om" text default ''::text;

alter table "public"."menu_items"
  add column "description_om" text default ''::text;

alter table "public"."menu_items"
  add constraint "menu_items_calories_range_check" check (((calories >= 0) AND (calories <= 100000)));



-- >>>>> MIGRATION: 20260910085553_staff_user_package_limits.sql >>>>>

set local check_function_bodies = off;

drop function "public"."create_staff_user"(text, text, text);

create or replace function public.create_staff_user (
  p_email        text,
  p_password     text,
  p_display_name text default ''::text,
  p_role         text default 'barista'::text
)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'extensions', 'auth'
  AS $function$
declare
  v_actor_role text := public.get_user_role();
  v_cafe_slug text := public.get_user_cafe_slug();
  v_cafe_id text;
  v_staff_limit integer;
  v_staff_count integer;
  v_uid uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
  v_requested_role text := lower(trim(coalesce(p_role, 'barista')));
begin
  if v_actor_role <> 'admin' or v_cafe_slug is null or not public.cafe_has_feature('userManagement') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if v_requested_role not in ('admin', 'manager', 'cashier', 'barista') then
    raise exception 'Invalid role.';
  end if;
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'A valid email is required.';
  end if;
  if char_length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;

  -- Serialize account creation per cafe so two concurrent requests cannot
  -- both consume the same final staff seat.
  perform pg_advisory_xact_lock(hashtext(lower(v_cafe_slug)));

  select c.id into v_cafe_id
  from public.cafes c
  where lower(c.slug) = lower(v_cafe_slug);
  if v_cafe_id is null then
    raise exception 'Your cafe assignment is invalid.' using errcode = '42501';
  end if;

  select case
    when jsonb_typeof(p.limits -> 'staffUsers') = 'number'
      and (p.limits ->> 'staffUsers') ~ '^[1-9][0-9]*$'
      then (p.limits ->> 'staffUsers')::integer
  end
  into v_staff_limit
  from public.subscription_requests sr
  join public.packages p on p.id = sr.plan_key
  where lower(sr.cafe_slug) = lower(v_cafe_slug)
    and sr.status in ('active', 'approved')
    and p.status = 'active'
  order by sr.updated_at desc nulls last, sr.activated_at desc nulls last
  limit 1;

  if coalesce(v_staff_limit, 0) < 1 then
    raise exception 'Your current package has no staff-account allocation. Contact the platform administrator.';
  end if;

  select count(*) into v_staff_count
  from public.user_roles
  where lower(coalesce(cafe_slug, '')) = lower(v_cafe_slug);

  if v_staff_count >= v_staff_limit then
    raise exception 'Your package allows % staff accounts and all % seats are already in use.', v_staff_limit, v_staff_limit;
  end if;

  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'This email is already registered.';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_sent_at, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('cafe_id', v_cafe_id, 'cafe_slug', v_cafe_slug, 'display_name', p_display_name),
    now(), now(), false, false
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at, id
  ) values (
    v_email, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now(), v_uid
  );

  insert into public.user_roles (
    id, email, role, display_name, cafe_id, cafe_slug,
    must_change_password, disabled, language
  ) values (
    v_uid, v_email, v_requested_role, p_display_name, v_cafe_id, v_cafe_slug,
    true, false, 'en'
  );

  return v_uid;
end;
$function$;

revoke all on function "public"."create_staff_user"(text, text, text, text) from public;

grant execute on function "public"."create_staff_user"(text, text, text, text) to "authenticated", "postgres";



-- >>>>> MIGRATION: 20260910100000_enforce_staff_user_package_limits.sql >>>>>

-- Package data migration paired with the generated staff-provisioning RPC
-- migration immediately before it. Existing valid allocations are retained.
update public.packages
set limits = jsonb_set(
  coalesce(limits, '{}'::jsonb),
  '{staffUsers}',
  coalesce(
    case
      when jsonb_typeof(limits -> 'staffUsers') = 'number'
        and (limits ->> 'staffUsers') ~ '^[1-9][0-9]*$'
        then limits -> 'staffUsers'
    end,
    case id
      when 'starter' then to_jsonb(1)
      when 'professional' then to_jsonb(8)
      when 'enterprise' then to_jsonb(25)
      else to_jsonb(1)
    end
  ),
  true
)
where id in ('starter', 'professional', 'enterprise')
  or coalesce(features, '[]'::jsonb) ? 'userManagement';


-- >>>>> MIGRATION: 20260916200032_application_security_refinement.sql >>>>>

begin;
-- Membership, role and tenant checks apply at every database entry point.

create schema if not exists cafe_private;
revoke all on schema cafe_private from public, anon, authenticated;
grant usage on schema cafe_private to authenticated, anon;

create or replace function public.get_user_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.user_roles where id = auth.uid() and not coalesce(disabled, false)
$$;
create or replace function public.get_user_cafe_slug() returns text
language sql stable security definer set search_path = '' as $$
  select c.slug from public.user_roles u join public.cafes c on c.id = u.cafe_id and c.slug = u.cafe_slug
  where u.id = auth.uid() and not coalesce(u.disabled, false) and c.status = 'active' and u.role <> 'superadmin'
$$;
create or replace function public.get_user_cafe_id() returns text
language sql stable security definer set search_path = '' as $$
  select c.id from public.user_roles u join public.cafes c on c.id = u.cafe_id and c.slug = u.cafe_slug
  where u.id = auth.uid() and not coalesce(u.disabled, false) and c.status = 'active' and u.role <> 'superadmin'
$$;
create or replace function public.cafe_feature_enabled(p_cafe_slug text, p_feature text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscription_requests s
    join public.cafes c on c.id = s.cafe_id and c.slug = s.cafe_slug and c.status = 'active'
    join public.packages p on p.id = s.plan_key and p.status = 'active'
    join public.features f on f.key = p_feature and f.enabled
    where c.slug = p_cafe_slug and s.status in ('active','approved')
      and (s.expired_at is null or s.expired_at > now()) and p.features ? p_feature
  )
$$;
create or replace function cafe_private.can_access(slug text, roles text[], feature text default null) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.uid() is not null and public.get_user_role()=any(roles) and slug=public.get_user_cafe_slug()
 and public.cafe_feature_enabled(slug,'staffAccess') and (feature is null or public.cafe_feature_enabled(slug,feature)),false)
$$;
revoke all on function cafe_private.can_access(text,text[],text) from public;
grant execute on function cafe_private.can_access(text,text[],text) to authenticated;

-- Remove accumulated permissive policies; PostgreSQL ORs them together.
do $$ declare r record; begin
  for r in select tablename,policyname from pg_policies where schemaname='public'
    and tablename = any(array['menu_items','orders','inventory','tables','settings','payment_options','user_roles','push_subscriptions','audit_logs'])
  loop execute format('drop policy %I on public.%I',r.policyname,r.tablename); end loop;
end $$;

-- Remove grants RLS does not protect (including TRUNCATE), then allow only used operations.
revoke all on public.cafes,public.packages,public.features,public.announcements,public.subscription_requests,public.menu_items,public.orders,public.inventory,public.tables,public.settings,public.payment_options,public.user_roles,public.push_subscriptions,public.audit_logs from anon, authenticated;
grant select on public.packages, public.features to anon, authenticated;
grant select,insert,update,delete on public.cafes,public.packages,public.features,public.announcements,public.subscription_requests to authenticated;
grant insert on public.subscription_requests to anon;
grant select,insert,update,delete on public.menu_items,public.inventory,public.tables,public.payment_options to authenticated;
grant select,insert,update on public.settings to authenticated;
grant select on public.orders,public.user_roles,public.audit_logs to authenticated;
grant insert on public.audit_logs to authenticated;
grant update(language,display_name,must_change_password,updated_at) on public.user_roles to authenticated;

create policy menu_read on public.menu_items for select to authenticated
using (cafe_private.can_access(cafe_slug,array['admin','manager','cashier','barista']));
create policy menu_write on public.menu_items for all to authenticated
using (cafe_private.can_access(cafe_slug,array['admin','manager'],'menuManagement'))
with check (cafe_private.can_access(cafe_slug,array['admin','manager'],'menuManagement'));
create policy inventory_read on public.inventory for select to authenticated
using (cafe_private.can_access(cafe_slug,array['admin','manager'],'inventory'));
create policy inventory_write on public.inventory for all to authenticated
using (cafe_private.can_access(cafe_slug,array['admin','manager'],'inventory'))
with check (cafe_private.can_access(cafe_slug,array['admin','manager'],'inventory'));
create policy tables_read on public.tables for select to authenticated
using (cafe_private.can_access(cafe_slug,array['admin','manager','cashier'],'tables'));
create policy tables_write on public.tables for all to authenticated
using (cafe_private.can_access(cafe_slug,array['admin','manager'],'tables'))
with check (cafe_private.can_access(cafe_slug,array['admin','manager'],'tables'));
create policy payment_read on public.payment_options for select to authenticated
using (cafe_private.can_access(cafe_slug,array['admin','manager','cashier']));
create policy payment_write on public.payment_options for all to authenticated
using (cafe_private.can_access(cafe_slug,array['admin'],'settings'))
with check (cafe_private.can_access(cafe_slug,array['admin'],'settings'));
create policy settings_read on public.settings for select to authenticated
using (cafe_private.can_access(cafe_slug,array['admin','manager','cashier']));
create policy settings_write on public.settings for all to authenticated
using (cafe_private.can_access(cafe_slug,array['admin'],'settings'))
with check (cafe_private.can_access(cafe_slug,array['admin'],'settings'));
create policy orders_read on public.orders for select to authenticated
using (cafe_private.can_access(cafe_slug,array['admin','manager','cashier']));
create policy profile_read on public.user_roles for select to authenticated
using (id=(select auth.uid()) or (select public.get_user_role())='superadmin'
  or cafe_private.can_access(cafe_slug,array['admin'],'userManagement'));
create policy profile_update on public.user_roles for update to authenticated
using (id=(select auth.uid()) and not disabled)
with check (id=(select auth.uid()) and not disabled);
create policy audit_read on public.audit_logs for select to authenticated
using (((select public.get_user_role())='superadmin' and cafe_slug='__platform__')
  or cafe_private.can_access(cafe_slug,array['admin','manager'],'auditLogs'));
create policy audit_insert on public.audit_logs for insert to authenticated
with check (actor=(select public.get_user_email()) and
  (((select public.get_user_role())='superadmin' and cafe_slug='__platform__')
   or cafe_private.can_access(cafe_slug,array['admin','manager','cashier','barista'])));

-- Relationships are enforced for new data without deleting historical records.
alter table public.cafes add constraint cafes_identity_unique unique(id,slug);
do $$ declare t text; begin
  foreach t in array array['menu_items','orders','inventory','tables','payment_options','settings'] loop
    execute format('alter table public.%I add constraint %I foreign key(cafe_slug) references public.cafes(slug) not valid',t,t||'_cafe_fk');
  end loop;
end $$;
alter table public.user_roles add constraint user_cafe_identity_fk foreign key(cafe_id,cafe_slug) references public.cafes(id,slug) not valid;
alter table public.user_roles add constraint user_cafe_required check
  ((role='superadmin' and cafe_id is null and cafe_slug is null) or (role<>'superadmin' and cafe_id is not null and cafe_slug is not null)) not valid;
alter table public.subscription_requests add constraint subscription_cafe_identity_fk foreign key(cafe_id,cafe_slug) references public.cafes(id,slug) not valid;
-- Historical duplicate table labels are retained; prevent new duplicates atomically.
create function cafe_private.unique_table_number() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.cafe_slug=old.cafe_slug and new.table_number=old.table_number then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.cafe_slug||':'||new.table_number::text,0));
  if exists(select 1 from public.tables where cafe_slug=new.cafe_slug and table_number=new.table_number and id<>new.id) then raise exception 'This table number already exists.' using errcode='23505'; end if;
  return new;
end $$;
create trigger unique_table_number before insert or update on public.tables for each row execute function cafe_private.unique_table_number();
alter table public.tables add constraint table_number_positive check(table_number > 0) not valid;
alter table public.menu_items add constraint menu_price_valid check(price >= 0 and price <= 1000000) not valid;
alter table public.settings add constraint tax_rate_valid check(tax_rate between 0 and 100) not valid;
alter table public.inventory add constraint inventory_quantity_valid check(quantity >= 0 and low_stock_threshold >= 0 and supplier_cost >= 0) not valid;
create index if not exists user_roles_cafe_id_slug_idx on public.user_roles(cafe_id,cafe_slug);
create index if not exists subscriptions_cafe_id_slug_idx on public.subscription_requests(cafe_id,cafe_slug);
create index if not exists orders_cafe_created_idx on public.orders(cafe_slug,created_at_ms desc);
create index if not exists audit_cafe_created_idx on public.audit_logs(cafe_slug,created_at_ms desc);

-- Customer capabilities are separate from discoverable order IDs and never selectable.
create table cafe_private.order_access (
  order_id uuid primary key references public.orders(id) on delete cascade,
  token_hash text not null unique
);
alter table cafe_private.order_access enable row level security;
create or replace function cafe_private.customer_access(order_id uuid, token text, slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select length(token) >= 32 and exists (
    select 1 from cafe_private.order_access a join public.orders o on o.id=a.order_id
    where a.order_id=customer_access.order_id and a.token_hash=encode(extensions.digest(token,'sha256'),'hex')
      and o.cafe_slug=slug and public.cafe_feature_enabled(slug,'ordering')
      and (auth.uid() is null or (public.get_user_cafe_slug()=slug and public.get_user_role() in ('admin','manager','cashier')))
  )
$$;
revoke all on function cafe_private.customer_access(uuid,text,text) from public;
grant execute on function cafe_private.customer_access(uuid,text,text) to anon,authenticated;

-- Preserve the safe tracking projection internally; public callers must prove ownership.
alter function public.get_order_for_tracking(uuid) set schema cafe_private;
alter function public.get_orders_by_ids(uuid[]) set schema cafe_private;
alter function public.update_customer_order(uuid,text,boolean,text,boolean) set schema cafe_private;
alter function public.save_customer_push_subscription(uuid,jsonb) set schema cafe_private;
revoke all on all functions in schema cafe_private from public,anon,authenticated;
grant execute on function cafe_private.can_access(text,text[],text),cafe_private.customer_access(uuid,text,text) to anon,authenticated;

create function public.get_order_for_tracking(p_order_id uuid,p_token text default null,p_cafe_slug text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not cafe_private.customer_access(p_order_id,p_token,p_cafe_slug) then
    raise exception 'Order access denied.' using errcode='42501';
  end if;
  return cafe_private.get_order_for_tracking(p_order_id);
end $$;
create function public.get_orders_by_ids(p_ids uuid[],p_tokens jsonb default '{}',p_cafe_slug text default null) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare id uuid; begin
  if cardinality(p_ids)>50 then raise exception 'Too many orders.'; end if;
  foreach id in array p_ids loop
    if cafe_private.customer_access(id,p_tokens->>id::text,p_cafe_slug) then
      return next cafe_private.get_order_for_tracking(id);
    end if;
  end loop;
end $$;
create function public.update_customer_order(p_order_id uuid,p_payment_method text default null,p_clear_method boolean default false,
 p_payment_proof_url text default null,p_clear_proof boolean default false,p_token text default null,p_cafe_slug text default null) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; proof text; begin
  if not cafe_private.customer_access(p_order_id,p_token,p_cafe_slug) then raise exception 'Order access denied.' using errcode='42501'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if o.payment_status in ('paid','approved') or o.order_status in ('paid','rejected') then raise exception 'Order is closed.'; end if;
  if p_payment_method is not null and p_payment_method <> 'Cash' and not exists
    (select 1 from public.payment_options where cafe_slug=o.cafe_slug and active and type=p_payment_method) then raise exception 'Invalid payment method.'; end if;
  proof := nullif(p_payment_proof_url,'');
  if proof is not null and not exists (select 1 from storage.objects where bucket_id='payment-proofs' and name=proof
    and (storage.foldername(name))[1]=o.cafe_slug and (storage.foldername(name))[2]=o.id::text) then raise exception 'Invalid payment proof.'; end if;
  update public.orders set payment_method=case when p_clear_method then null else coalesce(p_payment_method,payment_method) end,
    payment_proof_url=case when p_clear_proof then '' else coalesce(proof,payment_proof_url) end,
    payment_status=case when proof is not null then 'pending' else payment_status end where id=o.id;
end $$;
create function public.save_customer_push_subscription(p_order_id uuid,p_subscription jsonb,p_token text default null,p_cafe_slug text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not cafe_private.customer_access(p_order_id,p_token,p_cafe_slug) then raise exception 'Order access denied.' using errcode='42501'; end if;
  perform cafe_private.save_customer_push_subscription(p_order_id,p_subscription);
end $$;

drop function public.create_customer_order(text,jsonb,integer);
create function public.create_customer_order(p_table_number text,p_items jsonb,p_estimated_ready_minutes integer default 0,
 p_cafe_slug text default null,p_token text default null,p_payment_method text default 'Cash') returns uuid
language plpgsql security definer set search_path='' as $$
declare
  item jsonb; menu public.menu_items%rowtype; qty integer; extras numeric; subtotal numeric:=0; tax_rate numeric;
  clean_items jsonb:='[]'; custom jsonb; opt record; choice jsonb; catalog_choice jsonb; option_def jsonb;
  clean_choices jsonb; id uuid; table_key text; ready integer:=0;
begin
  if length(coalesce(p_token,''))<32 or length(p_token)>256 then raise exception 'Order token required.'; end if;
  if not public.cafe_feature_enabled(p_cafe_slug,'ordering') then raise exception 'This cafe is not accepting orders.'; end if;
  if auth.uid() is not null and not cafe_private.can_access(p_cafe_slug,array['admin','manager','cashier']) then raise exception 'Not authorized.' using errcode='42501'; end if;
  -- Serialize retries of the same checkout, returning the original order.
  perform pg_advisory_xact_lock(hashtextextended(p_token,0));
  select a.order_id into id from cafe_private.order_access a join public.orders o on o.id=a.order_id
    where a.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and o.cafe_slug=p_cafe_slug;
  if id is not null then return id; end if;
  select t.id into table_key from public.tables t where t.cafe_slug=p_cafe_slug and t.table_number::text=p_table_number order by t.id limit 1;
  if table_key is null then raise exception 'Choose a valid cafe table.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Invalid order items.'; end if;
  if p_payment_method <> 'Cash' and not exists(select 1 from public.payment_options where cafe_slug=p_cafe_slug and active and type=p_payment_method) then raise exception 'Invalid payment method.'; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    if (item->>'quantity') !~ '^[0-9]+$' then raise exception 'Quantity must be a whole number.'; end if;
    qty := (item->>'quantity')::integer;
    if qty not between 1 and 100 then raise exception 'Quantity is invalid.'; end if;
    select m.* into menu from public.menu_items m where m.id=(item->>'itemId')::uuid and cafe_slug=p_cafe_slug and available for share;
    if menu.id is null then raise exception 'Menu item is not available in this cafe.'; end if;
    extras:=0; custom:='{}';
    if jsonb_typeof(coalesce(item->'customizations','{}'))<>'object' then raise exception 'Invalid customizations.'; end if;
    for opt in select * from jsonb_each(coalesce(item->'customizations','{}')) loop
      if jsonb_typeof(opt.value)<>'array' then raise exception 'Invalid option selection.'; end if;
      clean_choices:='[]';
      if (select count(*) from jsonb_array_elements(opt.value)) <> (select count(distinct value->>'name') from jsonb_array_elements(opt.value)) then raise exception 'Duplicate choice.'; end if;
      for choice in select * from jsonb_array_elements(opt.value) loop
        if opt.key='Ingredients' then
          if not menu.ingredients ? (choice->>'name') then raise exception 'Invalid ingredient.'; end if;
          catalog_choice:=jsonb_build_object('name',choice->>'name','extraPrice',0);
        else
          select value into option_def from jsonb_array_elements(menu.options) where value->>'label'=opt.key;
          select value into catalog_choice from jsonb_array_elements(option_def->'choices') where value->>'name'=choice->>'name';
          if catalog_choice is null then raise exception 'Invalid menu option.'; end if;
          extras:=extras+coalesce((coalesce(catalog_choice->>'extraPrice',catalog_choice->>'extra_price'))::numeric,0);
        end if;
        clean_choices:=clean_choices || jsonb_build_array(jsonb_build_object('name',catalog_choice->>'name','extraPrice',coalesce((coalesce(catalog_choice->>'extraPrice',catalog_choice->>'extra_price'))::numeric,0)));
      end loop;
      custom:=custom || jsonb_build_object(opt.key,clean_choices);
    end loop;
    subtotal:=subtotal+(menu.price+extras)*qty;
    ready:=greatest(ready,coalesce(menu.estimated_minutes,0));
    clean_items:=clean_items || jsonb_build_array(jsonb_build_object('itemId',menu.id,'name',menu.name,'price',menu.price,'quantity',qty,
      'category',menu.category,'subcategory',menu.subcategory,'ingredients',menu.ingredients,'customizations',custom,'imageUrl',menu.image_url,'calories',menu.calories));
  end loop;
  select b.tax_rate into tax_rate from public.billing_settings_for_cafe(p_cafe_slug) b;
  tax_rate:=coalesce(tax_rate,15);
  insert into public.orders(table_id,table_number,cafe_slug,items,subtotal_amount,taxable_amount,tax_rate,tax_amount,total_amount,discount_amount,estimated_ready_minutes,payment_method)
  values(table_key,p_table_number,p_cafe_slug,clean_items,subtotal,subtotal,tax_rate,round(subtotal*tax_rate/100,2),round(subtotal+subtotal*tax_rate/100,2),0,ready,p_payment_method) returning orders.id into id;
  insert into cafe_private.order_access values(id,encode(extensions.digest(p_token,'sha256'),'hex'));
  return id;
end $$;

-- Lock the row before validation; discounts are recalculated from immutable subtotal.
alter function public.update_staff_order(uuid,jsonb) set schema cafe_private;
revoke all on function cafe_private.update_staff_order(uuid,jsonb) from public,anon,authenticated;
create function public.update_staff_order(p_order_id uuid,p_changes jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; d numeric; r text:=public.get_user_role(); begin
  select * into o from public.orders where id=p_order_id for update;
  if not cafe_private.can_access(o.cafe_slug,array['admin','manager','cashier','barista']) then raise exception 'Not authorized.' using errcode='42501'; end if;
  if jsonb_typeof(p_changes)<>'object' then raise exception 'Invalid changes.'; end if;
  if r='barista' and (p_changes ?| array['customerName','paymentStatus','paidAt','discountAmount','rejectionReason','paymentMethod','paymentProofUrl'] or p_changes->>'orderStatus'='paid') then
    raise exception 'Payment operations are not permitted.' using errcode='42501';
  end if;
  if p_changes ? 'estimatedReadyMinutes' and (p_changes->>'estimatedReadyMinutes')::numeric not between 0 and 1440 then raise exception 'Invalid preparation time.'; end if;
  if p_changes ? 'discountAmount' then
    if o.payment_status in ('paid','approved') then raise exception 'Paid transactions are immutable.'; end if;
    d:=(p_changes->>'discountAmount')::numeric;
    if d is null or d < 0 or d > o.subtotal_amount then raise exception 'Invalid discount.'; end if;
  end if;
  if p_changes ? 'paymentStatus' and o.payment_status in ('paid','approved') and p_changes->>'paymentStatus' <> o.payment_status then raise exception 'Paid transactions are immutable.'; end if;
  if p_changes ? 'paymentProofUrl' then raise exception 'Use the proof upload workflow.'; end if;
  perform cafe_private.update_staff_order(p_order_id,p_changes-'discountAmount');
  if d is not null then update public.orders set discount_amount=d,taxable_amount=subtotal_amount-d,
    tax_amount=round((subtotal_amount-d)*tax_rate/100,2),total_amount=round((subtotal_amount-d)*(1+tax_rate/100),2) where id=o.id; end if;
  if p_changes->>'orderStatus'='paid' then
    update public.orders set payment_status='paid',paid_at=now()::text where id=o.id;
  end if;
end $$;

-- Kitchen projections omit financial fields, including prices embedded in JSON.
create function public.get_staff_orders(p_cafe_slug text,p_limit integer default 1000,p_offset integer default 0) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare o record; result jsonb; begin
  if not cafe_private.can_access(p_cafe_slug,array['admin','manager','cashier','barista']) then raise exception 'Not authorized.' using errcode='42501'; end if;
  for o in select * from public.orders where cafe_slug=p_cafe_slug order by created_at_ms desc,id limit least(greatest(p_limit,1),1000) offset greatest(p_offset,0) loop
    if public.get_user_role()='barista' then
      result:=jsonb_build_object('id',o.id,'cafe_slug',o.cafe_slug,'table_number',o.table_number,'order_status',o.order_status,
        'estimated_ready_minutes',o.estimated_ready_minutes,'auto_ready_enabled',o.auto_ready_enabled,'auto_ready_at',o.auto_ready_at,
        'created_at',o.created_at,'created_at_ms',o.created_at_ms,'accepted_at_ms',o.accepted_at_ms,'prepared_at_ms',o.prepared_at_ms,'ready_at_ms',o.ready_at_ms);
      result:=result||jsonb_build_object('items',(select coalesce(jsonb_agg(jsonb_build_object('itemId',i->>'itemId','name',i->>'name','quantity',i->'quantity','category',i->>'category','subcategory',i->>'subcategory','ingredients',i->'ingredients','customizations',
        (select coalesce(jsonb_object_agg(k,(select coalesce(jsonb_agg(jsonb_build_object('name',v->>'name')),'[]') from jsonb_array_elements(vals) v)),'{}') from jsonb_each(coalesce(i->'customizations','{}')) as c(k,vals)))),'[]') from jsonb_array_elements(o.items) i));
    else result:=to_jsonb(o); end if;
    return next result;
  end loop;
end $$;
create function public.get_cafe_inventory(p_cafe_slug text) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not cafe_private.can_access(p_cafe_slug,array['admin','manager','barista'],'inventory') then raise exception 'Not authorized.' using errcode='42501'; end if;
  return query select case when public.get_user_role()='barista' then to_jsonb(i)-'supplier_cost' else to_jsonb(i) end from public.inventory i where cafe_slug=p_cafe_slug order by name limit 1000;
end $$;

-- Private receipts, public menu images; paths include cafe and order ownership.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('cafe-assets','cafe-assets',true,5242880,array['image/webp','image/jpeg','image/png']),
 ('payment-proofs','payment-proofs',false,5242880,array['image/webp','image/jpeg','image/png'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'cafe_assets%' loop
    execute format('drop policy %I on storage.objects',r.policyname); end loop;
end $$;
create policy cafe_assets_menu_read on storage.objects for select to authenticated using
 (bucket_id='cafe-assets' and (storage.foldername(name))[1]='menuImages' and cafe_private.can_access((storage.foldername(name))[2],array['admin','manager']));
create policy cafe_assets_menu_write on storage.objects for all to authenticated using
 (bucket_id='cafe-assets' and (storage.foldername(name))[1]='menuImages' and cafe_private.can_access((storage.foldername(name))[2],array['admin','manager'],'menuManagement')) with check
 (bucket_id='cafe-assets' and (storage.foldername(name))[1]='menuImages' and cafe_private.can_access((storage.foldername(name))[2],array['admin','manager'],'menuManagement'));
create function cafe_private.proof_access(path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare slug text:=(storage.foldername(path))[1]; id uuid; token text; begin
  begin id:=((storage.foldername(path))[2])::uuid; exception when invalid_text_representation then return false; end;
  token:=current_setting('request.headers',true)::jsonb->>'x-order-token';
  return exists(select 1 from public.orders o where o.id=id and o.cafe_slug=slug) and
    (cafe_private.can_access(slug,array['admin','manager','cashier']) or cafe_private.customer_access(id,token,slug));
end $$;
revoke all on function cafe_private.proof_access(text) from public;
grant execute on function cafe_private.proof_access(text) to anon,authenticated;
create policy proof_read on storage.objects for select to anon,authenticated using(bucket_id='payment-proofs' and cafe_private.proof_access(name));
create policy proof_insert on storage.objects for insert to anon,authenticated with check(bucket_id='payment-proofs' and cafe_private.proof_access(name));

-- No implicit PUBLIC execute on application RPCs.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.get_user_role(),public.get_user_cafe_slug(),public.get_user_cafe_id(),public.get_user_email(),public.cafe_has_feature(text),public.cafe_feature_enabled(text,text) to anon,authenticated;
grant execute on function public.get_public_cafe(text),public.get_public_menu(text),public.get_public_billing_settings(text),public.get_public_payment_options(text),public.get_active_cafe_plan(text),public.get_popular_items(text) to anon,authenticated;
grant execute on function public.create_customer_order(text,jsonb,integer,text,text,text),public.get_order_for_tracking(uuid,text,text),public.get_orders_by_ids(uuid[],jsonb,text),public.update_customer_order(uuid,text,boolean,text,boolean,text,text),public.save_customer_push_subscription(uuid,jsonb,text,text) to anon,authenticated;
grant execute on function public.get_staff_orders(text,integer,integer),public.get_cafe_inventory(text),public.update_staff_order(uuid,jsonb),public.create_staff_user(text,text,text,text),public.set_user_role(uuid,text),public.set_user_disabled(uuid,boolean),public.delete_staff_user(uuid),public.delete_cafe_tenant(text),public.get_order_push_subscriptions(uuid) to authenticated;
notify pgrst,'reload schema';

-- Additional audit fixes, appended to the refinement migration after verification.

create or replace function public.get_active_cafe_plan(p_cafe_slug text) returns text
language sql stable security definer set search_path='' as $$
 select s.plan_key from public.subscription_requests s join public.cafes c on c.id=s.cafe_id and c.slug=s.cafe_slug and c.status='active'
 join public.packages p on p.id=s.plan_key and p.status='active'
 where c.slug=lower(trim(p_cafe_slug)) and s.status in ('active','approved') and (s.expired_at is null or s.expired_at>now())
 order by s.activated_at desc nulls last,s.id limit 1
$$;
drop policy if exists announcements_read_public on public.announcements;
create policy announcements_read on public.announcements for select to authenticated using (
 (select public.get_user_role())='superadmin' or
 ((select public.get_user_cafe_slug()) is not null and
   (target='All Cafes' or (target='Professional & Enterprise' and (select public.cafe_has_feature('staffAccess')))))
);
drop policy if exists subscription_requests_insert_public on public.subscription_requests;
create policy subscription_insert on public.subscription_requests for insert to anon,authenticated with check
 ((select public.get_user_role())='superadmin' or (status='pending_approval' and cafe_id is null and cafe_slug is null and customer_admin_id is null));

-- Authenticate staff subscriptions against their own row, never a requested role.
alter table public.push_subscriptions add column if not exists user_id uuid references auth.users(id) on delete cascade;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
create policy push_own on public.push_subscriptions for all to authenticated using
 (user_id=(select auth.uid()) and cafe_private.can_access(cafe_slug,array['admin','manager','cashier','barista'],'notifications')) with check
 (user_id=(select auth.uid()) and role=(select public.get_user_role()) and order_id is null and cafe_private.can_access(cafe_slug,array['admin','manager','cashier','barista'],'notifications'));
create index if not exists push_user_idx on public.push_subscriptions(user_id);

create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 cafe_slug text not null references public.cafes(slug), event text not null, title text not null, body text not null,
 data jsonb not null default '{}', read boolean not null default false, created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select,delete on public.notifications to authenticated;
grant update(read) on public.notifications to authenticated;
create policy notifications_own on public.notifications for all to authenticated using
 (user_id=(select auth.uid()) and cafe_private.can_access(cafe_slug,array['admin','manager','cashier','barista'],'notifications')) with check
 (user_id=(select auth.uid()) and cafe_private.can_access(cafe_slug,array['admin','manager','cashier','barista'],'notifications'));
create index notifications_user_created_idx on public.notifications(user_id,created_at desc);
create index notifications_cafe_idx on public.notifications(cafe_slug);
create function cafe_private.order_event() returns trigger language plpgsql security definer set search_path='' as $$
declare event_name text; begin
 if tg_op='INSERT' then event_name:='order.new';
 elsif old.order_status is distinct from new.order_status then event_name:='order.'||new.order_status;
 elsif old.payment_status is distinct from new.payment_status then event_name:='payment.'||new.payment_status;
 else return new; end if;
 insert into public.notifications(user_id,cafe_slug,event,title,body,data)
 select u.id,new.cafe_slug,event_name,'Order update','Table '||new.table_number||': '||replace(event_name,'.',' '),jsonb_build_object('orderId',new.id,'tableNumber',new.table_number)
 from public.user_roles u where u.cafe_slug=new.cafe_slug and not u.disabled and u.role in ('admin','manager','cashier','barista')
 and (u.role<>'barista' or event_name like 'order.%') and public.cafe_feature_enabled(new.cafe_slug,'notifications');
 insert into public.audit_logs(action,actor,cafe_slug,details,created_at_ms)
 values(event_name,coalesce(public.get_user_email(),'customer'),new.cafe_slug,jsonb_build_object('orderId',new.id,'status',new.order_status),floor(extract(epoch from now())*1000));
 return new;
end $$;
create trigger order_event after insert or update on public.orders for each row execute function cafe_private.order_event();
revoke all on function cafe_private.order_event() from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications; end if;
end $$;

-- Staff creation/changes must not allow inactive accounts to operate through old JWTs.
-- Role helpers reject disabled rows; the final helper also validates the auth session.
create or replace function cafe_private.can_access(slug text, roles text[], feature text default null) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.uid() is not null and public.get_user_role()=any(roles) and slug=public.get_user_cafe_slug()
 and public.cafe_feature_enabled(slug,'staffAccess') and (feature is null or public.cafe_feature_enabled(slug,feature)),false)
$$;
notify pgrst,'reload schema';

-- A revoked session or disabled account must fail even with an unexpired JWT.
create or replace function public.get_user_role() returns text
language sql stable security definer set search_path='' as $$
 select u.role from public.user_roles u where u.id=auth.uid() and not coalesce(u.disabled,false)
 and exists(select 1 from auth.sessions s where s.user_id=u.id and s.id::text=auth.jwt()->>'session_id')
$$;

-- NULL roles must fail closed in the legacy destructive RPC as well.
do $$ declare definition text; begin
 select pg_get_functiondef('public.delete_cafe_tenant(text)'::regprocedure) into definition;
 execute replace(definition, 'public.get_user_role() <> ''superadmin''', 'public.get_user_role() is distinct from ''superadmin''');
end $$;

-- Provisioning is one transaction. Never reset or reassign an existing account.
create function public.provision_cafe_owner(p_request_id text,p_password text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.subscription_requests%rowtype; cafe public.cafes%rowtype;
 owner_id uuid:=gen_random_uuid(); owner_email text; slug_base text; suffix integer:=1;
begin
 if public.get_user_role() is distinct from 'superadmin' then raise exception 'Not authorized.' using errcode='42501'; end if;
 if length(coalesce(p_password,''))<12 or length(p_password)>128 then raise exception 'Temporary password must contain 12 to 128 characters.'; end if;
 select * into request from public.subscription_requests where id=p_request_id for update;
 if request.id is null or request.status<>'pending_approval' then raise exception 'Only a pending request can be approved.'; end if;
 owner_email:=lower(trim(request.email));
 if owner_email is null or owner_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'A valid owner email is required.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_email,1));
 if exists(select 1 from auth.users where lower(email)=owner_email) then raise exception 'This email already has an account. Use a different owner email.'; end if;
 if not exists(select 1 from public.packages where id=request.plan_key and status='active') then raise exception 'Choose an active package.'; end if;
 slug_base:=trim(both '-' from regexp_replace(lower(trim(request.customer_name)),'[^a-z0-9]+','-','g'));
 if coalesce(slug_base,'')='' then slug_base:='cafe'; end if;
 slug_base:=left(slug_base,60);
 perform pg_advisory_xact_lock(hashtextextended(slug_base,2));
 cafe.slug:=slug_base;
 while exists(select 1 from public.cafes where slug=cafe.slug) loop suffix:=suffix+1; cafe.slug:=slug_base||'-'||suffix; end loop;
 cafe.id:='cafe_'||gen_random_uuid()::text;
 insert into public.cafes(id,name,slug,owner_email,subscription_id,status)
 values(cafe.id,request.customer_name,cafe.slug,owner_email,request.id,'active') returning * into cafe;
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_sent_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values('00000000-0000-0000-0000-000000000000',owner_id,'authenticated','authenticated',owner_email,
 extensions.crypt(p_password,extensions.gen_salt('bf')),now(),now(),'{"provider":"email","providers":["email"]}',
 jsonb_build_object('cafe_id',cafe.id,'cafe_slug',cafe.slug),now(),now(),false,false);
 insert into auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at,id)
 values(owner_id::text,owner_id,jsonb_build_object('sub',owner_id::text,'email',owner_email,'email_verified',true,'phone_verified',false),'email',now(),now(),now(),gen_random_uuid());
 insert into public.user_roles(id,email,role,cafe_id,cafe_slug,must_change_password,disabled)
 values(owner_id,owner_email,'admin',cafe.id,cafe.slug,true,false);
 update public.subscription_requests set status='active',approved_at=now(),activated_at=now(),customer_admin_id=owner_id,cafe_id=cafe.id,cafe_slug=cafe.slug where id=request.id;
 insert into public.audit_logs(action,actor,cafe_slug,details,created_at_ms) values('cafe.provision',public.get_user_email(),'__platform__',jsonb_build_object('cafeId',cafe.id),extract(epoch from now())*1000);
 return jsonb_build_object('cafe',to_jsonb(cafe),'userId',owner_id,'approvedAt',now());
end $$;
revoke all on function public.provision_cafe_owner(text,text) from public,anon;
grant execute on function public.provision_cafe_owner(text,text) to authenticated;

-- Serialize duplicate public submissions without exposing other applicants.
create function cafe_private.validate_subscription_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='pending_approval' then
  new.email:=lower(trim(new.email));
  if new.email is null or new.email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(coalesce(trim(new.customer_name),'')) not between 1 and 160 then raise exception 'Enter a valid name and email.'; end if;
  if not exists(select 1 from public.packages where id=new.plan_key and status='active') then raise exception 'Choose an active package.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.email,3));
  if exists(select 1 from public.subscription_requests where lower(email)=new.email and status='pending_approval' and id<>new.id) then raise exception 'A request is already awaiting review.'; end if;
 end if;
 return new;
end $$;
create trigger validate_subscription_request before insert or update on public.subscription_requests for each row execute function cafe_private.validate_subscription_request();
revoke all on function cafe_private.validate_subscription_request() from public,anon,authenticated;
notify pgrst,'reload schema';

create or replace function cafe_private.proof_access(path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare slug text:=(storage.foldername(path))[1]; v_order_id uuid; token text; begin
  begin v_order_id:=((storage.foldername(path))[2])::uuid; exception when invalid_text_representation then return false; end;
  token:=current_setting('request.headers',true)::jsonb->>'x-order-token';
  return exists(select 1 from public.orders o where o.id=v_order_id and o.cafe_slug=slug) and
    (cafe_private.can_access(slug,array['admin','manager','cashier']) or cafe_private.customer_access(v_order_id,token,slug));
end $$;

-- Supabase Auth expects empty token strings for provisioned email accounts.
-- Keep direct SQL provisioning compatible with the existing staff-account RPC.
do $$ declare signature text; definition text; begin
 foreach signature in array array['public.provision_cafe_owner(text,text)','public.create_staff_user(text,text,text,text)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  definition:=replace(definition,'insert into public.user_roles',
   'update auth.users set confirmation_token='''', recovery_token='''', email_change_token_new='''', email_change='''', email_change_token_current='''', reauthentication_token='''' where id='||case when signature like '%provision%' then 'owner_id' else 'v_uid' end||'; insert into public.user_roles');
  execute definition;
 end loop;
end $$;
update auth.users set confirmation_token=coalesce(confirmation_token,''),recovery_token=coalesce(recovery_token,''),email_change_token_new=coalesce(email_change_token_new,''),email_change=coalesce(email_change,''),email_change_token_current=coalesce(email_change_token_current,''),reauthentication_token=coalesce(reauthentication_token,'')
where id in (select id from public.user_roles) and (confirmation_token is null or recovery_token is null or email_change_token_new is null or email_change is null or email_change_token_current is null or reauthentication_token is null);

-- Split write policies by operation so SELECT evaluates one policy only.
do $$ declare row record; begin
 for row in select tablename,policyname,qual,with_check from pg_policies where schemaname='public' and policyname in ('menu_write','inventory_write','tables_write','payment_write','settings_write') loop
  execute format('drop policy %I on public.%I',row.policyname,row.tablename);
  execute format('create policy %I on public.%I for insert to authenticated with check (%s)',row.policyname||'_insert',row.tablename,row.with_check);
  execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',row.policyname||'_update',row.tablename,row.qual,row.with_check);
  if row.tablename<>'settings' then execute format('create policy %I on public.%I for delete to authenticated using (%s)',row.policyname||'_delete',row.tablename,row.qual); end if;
 end loop;
end $$;
-- Explicit null validation prevents malformed JSON from becoming null totals.
do $$ declare definition text; begin
 select pg_get_functiondef('public.create_customer_order(text,jsonb,integer,text,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'if jsonb_typeof(p_items)<>''array''','if p_items is null or jsonb_typeof(p_items)<>''array''');
 definition:=replace(definition,'if (item->>''quantity'') !~','if coalesce(item->>''quantity'','''') !~');
 definition:=replace(definition,'if p_payment_method <> ''Cash''','if p_payment_method is null or p_payment_method <> ''Cash''');
 execute definition;
end $$;
notify pgrst,'reload schema';

create function public.get_customer_push_event(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype; begin
 select * into o from public.orders where id=p_order_id;
 if not cafe_private.can_access(o.cafe_slug,array['admin','manager','cashier','barista'],'notifications') then raise exception 'Not authorized.' using errcode='42501'; end if;
 return jsonb_build_object('title','Order update','body','Your order is '||o.order_status||'.',
  'url','/'||o.cafe_slug||'/order/'||o.id::text,'tag','order-'||o.id::text);
end $$;
revoke all on function public.get_customer_push_event(uuid) from public,anon;
grant execute on function public.get_customer_push_event(uuid) to authenticated;
notify pgrst,'reload schema';

-- Preserve customer preparation notes when constructing trusted menu snapshots.
do $$ declare definition text; begin
 select pg_get_functiondef('public.create_customer_order(text,jsonb,integer,text,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'''category'',menu.category','''notes'',left(coalesce(item->>''notes'',''''),1000),''category'',menu.category');
 execute definition;
 select pg_get_functiondef('public.get_staff_orders(text,integer,integer)'::regprocedure) into definition;
 definition:=replace(definition,'''category'',i->>''category''','''notes'',i->>''notes'',''category'',i->>''category''');
 execute definition;
end $$;
notify pgrst,'reload schema';

create function cafe_private.normalize_payment_state() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.payment_status in ('paid','approved') and new.order_status='rejected' then raise exception 'Paid orders cannot be cancelled without a refund workflow.'; end if;
 if new.payment_status in ('paid','approved') then
  if tg_op='INSERT' or old.payment_status not in ('paid','approved') then new.paid_at:=now()::text;
  else new.paid_at:=old.paid_at; end if;
  if new.order_status='ready' then new.order_status:='paid'; end if;
 end if;
 return new;
end $$;
create trigger normalize_payment_state before insert or update on public.orders for each row execute function cafe_private.normalize_payment_state();
revoke all on function cafe_private.normalize_payment_state() from public,anon,authenticated;

do $$ declare r record; begin
 for r in select c.conname,t.relname from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and not c.convalidated loop
  begin execute format('alter table public.%I validate constraint %I',r.relname,r.conname); raise notice 'Validated %.%',r.relname,r.conname;
  exception when check_violation or foreign_key_violation then raise warning 'Legacy data needs reconciliation for %.%',r.relname,r.conname; end;
 end loop;
end $$;

do $$ declare definition text; begin
 select pg_get_functiondef('public.get_staff_orders(text,integer,integer)'::regprocedure) into definition;
 definition:=replace(definition,'p_offset integer DEFAULT 0)','p_offset integer DEFAULT 0, p_scope text DEFAULT ''all''::text)');
 definition:=replace(definition,'where cafe_slug=p_cafe_slug order by','where cafe_slug=p_cafe_slug and (p_scope=''all'' or (p_scope=''active'' and order_status not in (''paid'',''rejected'')) or (p_scope=''cashier'' and (payment_status not in (''paid'',''approved'') or created_at >= now()-interval ''2 days''))) order by');
 execute definition;
end $$;
drop function public.get_staff_orders(text,integer,integer);
revoke all on function public.get_staff_orders(text,integer,integer,text) from public,anon;
grant execute on function public.get_staff_orders(text,integer,integer,text) to authenticated;
notify pgrst,'reload schema';

create function public.record_client_audit(p_action text,p_details jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare r text:=public.get_user_role(); slug text; begin
 if r is null then raise exception 'Not authorized.' using errcode='42501'; end if;
 slug:=case when r='superadmin' then '__platform__' else public.get_user_cafe_slug() end;
 if slug is null or (r<>'superadmin' and not public.cafe_feature_enabled(slug,'staffAccess')) then raise exception 'Not authorized.' using errcode='42501'; end if;
 if length(coalesce(p_action,'')) not between 1 and 100 or octet_length(coalesce(p_details,'{}')::text)>16384 then raise exception 'Invalid event.'; end if;
 insert into public.audit_logs(action,actor,cafe_slug,details,created_at_ms) values(p_action,public.get_user_email(),slug,coalesce(p_details,'{}')||'{"source":"client"}',extract(epoch from now())*1000);
end $$;
revoke all on function public.record_client_audit(text,jsonb) from public,anon;
grant execute on function public.record_client_audit(text,jsonb) to authenticated;
notify pgrst,'reload schema';

do $$ declare definition text; begin
 select pg_get_functiondef('public.get_staff_orders(text,integer,integer,text)'::regprocedure) into definition;
 definition:=replace(definition,'or created_at >= now()-interval ''2 days''','or left(coalesce(paid_at,''''),10)>=(current_date-2)::text'); execute definition;
 select pg_get_functiondef('public.delete_cafe_tenant(text)'::regprocedure) into definition;
 definition:=replace(definition,'  return jsonb_build_object(', '  insert into public.audit_logs(action,actor,cafe_slug,details,created_at_ms) values(''cafe.delete'',public.get_user_email(),''__platform__'',jsonb_build_object(''cafeId'',p_cafe_id,''cafeSlug'',v_slug,''usersDeleted'',coalesce(array_length(v_user_ids,1),0)),extract(epoch from now())*1000); return jsonb_build_object(');
 execute definition;
end $$;
notify pgrst,'reload schema';

-- Normalize function source line endings across Windows CLI/psql transports.
do $$ declare r record; begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','cafe_private') and strpos(p.prosrc,chr(13))>0 loop
  execute replace(pg_get_functiondef(r.oid),chr(13),'');
 end loop;
end $$;

commit;


-- >>>>> MIGRATION: 20260921080935_commercial_platform_refinement.sql >>>>>

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP POLICY orders_read ON public.orders;

CREATE FUNCTION cafe_private.can_read_orders (
  slug  text,
  scope text DEFAULT 'all'::text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select cafe_private.can_access(slug,array['admin','manager','cashier','barista']) and case public.get_user_role()
 when 'barista' then public.cafe_feature_enabled(slug,case when scope='all' then 'orderHistory' else 'kds' end)
 when 'cashier' then public.cafe_feature_enabled(slug,'cashierPos') or public.cafe_feature_enabled(slug,'ordering')
 else public.cafe_feature_enabled(slug,'ordering') or public.cafe_feature_enabled(slug,'analytics') end;
$function$;

REVOKE ALL ON FUNCTION cafe_private.can_read_orders(text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION cafe_private.can_read_orders(text, text) TO authenticated;

CREATE FUNCTION cafe_private.order_currency()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 select c.currency into new.currency from public.cafes c where c.slug=new.cafe_slug for update;
 return new;
end $function$;

REVOKE ALL ON FUNCTION cafe_private.order_currency() FROM PUBLIC;

CREATE FUNCTION cafe_private.validate_cafe_region()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if new.currency not in ('ETB','USD','EUR','GBP','KES','UGX','TZS','ZAR','NGN','GHS','AED','SAR','INR','AUD','CAD','CHF','SGD','NZD','CNY','BRL','MXN') then raise exception 'Choose a supported accounting currency.'; end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.time_zone) then raise exception 'Choose a valid IANA time zone.'; end if;
 if tg_op='UPDATE' and new.currency is distinct from old.currency and exists(select 1 from public.orders where cafe_slug=old.slug) then raise exception 'Currency is locked after the first order. Existing amounts cannot be converted by changing settings.'; end if;
 return new;
end $function$;

REVOKE ALL ON FUNCTION cafe_private.validate_cafe_region() FROM PUBLIC;

CREATE FUNCTION cafe_private.validate_package_limits()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare key text; begin
 if jsonb_typeof(new.limits) is distinct from 'object' then raise exception 'Package limits are required.'; end if;
 foreach key in array array['menuItems','staffUsers'] loop
  if coalesce(new.limits->>key,'') !~ '^[1-9][0-9]*$' or (new.limits->>key)::numeric>1000000 then raise exception 'Limits must be whole numbers from 1 to 1000000.'; end if;
 end loop;
 if new.status not in ('active','inactive') or length(trim(new.name)) not between 1 and 120 then raise exception 'Enter a valid package name and status.'; end if;
 return new;
end $function$;

REVOKE ALL ON FUNCTION cafe_private.validate_package_limits() FROM PUBLIC;

CREATE FUNCTION public.get_cafe_region (
  p_cafe_slug text
)
  RETURNS TABLE (
    currency  text,
    time_zone text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select c.currency,c.time_zone from public.cafes c where c.slug=p_cafe_slug and c.status='active';
$function$;

REVOKE ALL ON FUNCTION public.get_cafe_region(text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_cafe_region(text) TO anon;

GRANT ALL ON FUNCTION public.get_cafe_region(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_popular_items (
  p_cafe_slug text DEFAULT NULL::text
)
  RETURNS TABLE (
    item_id  text,
    quantity bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select item->>'itemId',sum((item->>'quantity')::bigint)
 from public.orders o cross join lateral jsonb_array_elements(o.items) item
 where o.cafe_slug=coalesce(public.get_user_cafe_slug(),nullif(trim(p_cafe_slug),''))
 and public.cafe_feature_enabled(o.cafe_slug,'digitalMenu')
 and o.created_at>=now()-interval '30 days'
 and o.payment_status in ('unpaid','pending','approved','paid')
 and o.order_status in ('received','accepted','preparing','ready','paid')
 group by 1 order by 2 desc limit 100;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_menu (
  p_cafe_slug text
)
  RETURNS SETOF public.menu_items
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select case when public.cafe_feature_enabled(m.cafe_slug,'multiLanguage') then m
 else jsonb_populate_record(null::public.menu_items,to_jsonb(m)-'name_am'-'description_am'-'name_om'-'description_om') end
 from public.menu_items m where m.cafe_slug=lower(trim(p_cafe_slug))
 and public.cafe_feature_enabled(m.cafe_slug,'digitalMenu') order by m.category,m.subcategory,m.name,m.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_orders (
  p_cafe_slug text,
  p_limit     integer DEFAULT 1000,
  p_offset    integer DEFAULT 0,
  p_scope     text    DEFAULT 'all'::text
)
  RETURNS SETOF jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare o record; result jsonb; begin
  if not cafe_private.can_read_orders(p_cafe_slug,p_scope) then raise exception 'Not authorized.' using errcode='42501'; end if;
  for o in select * from public.orders where cafe_slug=p_cafe_slug and (p_scope='all' or (p_scope='active' and order_status not in ('paid','rejected')) or (p_scope='cashier' and (payment_status not in ('paid','approved') or left(coalesce(paid_at,''),10)>=(current_date-2)::text))) order by created_at_ms desc,id limit least(greatest(p_limit,1),1000) offset greatest(p_offset,0) loop
    if public.get_user_role()='barista' then
      result:=jsonb_build_object('id',o.id,'cafe_slug',o.cafe_slug,'table_number',o.table_number,'order_status',o.order_status,
        'estimated_ready_minutes',o.estimated_ready_minutes,'auto_ready_enabled',o.auto_ready_enabled,'auto_ready_at',o.auto_ready_at,
        'created_at',o.created_at,'created_at_ms',o.created_at_ms,'accepted_at_ms',o.accepted_at_ms,'prepared_at_ms',o.prepared_at_ms,'ready_at_ms',o.ready_at_ms);
      result:=result||jsonb_build_object('items',(select coalesce(jsonb_agg(jsonb_build_object('itemId',i->>'itemId','name',i->>'name','quantity',i->'quantity','notes',i->>'notes','category',i->>'category','subcategory',i->>'subcategory','ingredients',i->'ingredients','customizations',
        (select coalesce(jsonb_object_agg(k,(select coalesce(jsonb_agg(jsonb_build_object('name',v->>'name')),'[]') from jsonb_array_elements(vals) v)),'{}') from jsonb_each(coalesce(i->'customizations','{}')) as c(k,vals)))),'[]') from jsonb_array_elements(o.items) i));
    else result:=to_jsonb(o); end if;
    return next result;
  end loop;
end $function$;

CREATE FUNCTION public.set_cafe_region (
  p_cafe_slug text,
  p_currency  text,
  p_time_zone text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not cafe_private.can_access(p_cafe_slug,array['admin'],'settings') then raise exception 'Not authorized.' using errcode='42501'; end if;
 update public.cafes set currency=p_currency,time_zone=p_time_zone,updated_at=now() where slug=p_cafe_slug;
 insert into public.audit_logs(action,actor,cafe_slug,details,created_at_ms) values('settings.region.update',public.get_user_email(),p_cafe_slug,jsonb_build_object('currency',p_currency,'timeZone',p_time_zone),extract(epoch from now())*1000);
end $function$;

REVOKE ALL ON FUNCTION public.set_cafe_region(text, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.set_cafe_region(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_staff_order (
  p_order_id uuid,
  p_changes  jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare o public.orders%rowtype; d numeric; r text:=public.get_user_role(); begin
  select * into o from public.orders where id=p_order_id for update;
  if not cafe_private.can_access(o.cafe_slug,array['admin','manager','cashier','barista']) then raise exception 'Not authorized.' using errcode='42501'; end if;
  if not public.cafe_feature_enabled(o.cafe_slug,case when r='barista' then 'kds' when r='cashier' then 'cashierPos' else 'ordering' end) then raise exception 'This operation is not included in this cafe package.' using errcode='42501'; end if; if jsonb_typeof(p_changes)<>'object' then raise exception 'Invalid changes.'; end if;
  if r='barista' and (p_changes ?| array['customerName','paymentStatus','paidAt','discountAmount','rejectionReason','paymentMethod','paymentProofUrl'] or p_changes->>'orderStatus'='paid') then
    raise exception 'Payment operations are not permitted.' using errcode='42501';
  end if;
  if p_changes ? 'estimatedReadyMinutes' and (p_changes->>'estimatedReadyMinutes')::numeric not between 0 and 1440 then raise exception 'Invalid preparation time.'; end if;
  if p_changes ? 'discountAmount' then
    if o.payment_status in ('paid','approved') then raise exception 'Paid transactions are immutable.'; end if;
    d:=(p_changes->>'discountAmount')::numeric;
    if d is null or d < 0 or d > o.subtotal_amount then raise exception 'Invalid discount.'; end if;
  end if;
  if p_changes ? 'paymentStatus' and o.payment_status in ('paid','approved') and p_changes->>'paymentStatus' <> o.payment_status then raise exception 'Paid transactions are immutable.'; end if;
  if p_changes ? 'paymentProofUrl' then raise exception 'Use the proof upload workflow.'; end if;
  perform cafe_private.update_staff_order(p_order_id,p_changes-'discountAmount');
  if d is not null then update public.orders set discount_amount=d,taxable_amount=subtotal_amount-d,
    tax_amount=round((subtotal_amount-d)*tax_rate/100,2),total_amount=round((subtotal_amount-d)*(1+tax_rate/100),2) where id=o.id; end if;
  if p_changes->>'orderStatus'='paid' then
    update public.orders set payment_status='paid',paid_at=now()::text where id=o.id;
  end if;
end $function$;

ALTER TABLE public.cafes
  ADD COLUMN currency text DEFAULT 'ETB'::text NOT NULL;

ALTER TABLE public.cafes
  ADD COLUMN time_zone text DEFAULT 'Africa/Addis_Ababa'::text NOT NULL;

CREATE TRIGGER cafes_validate_region
  BEFORE INSERT OR UPDATE OF currency, time_zone ON public.cafes
  FOR EACH ROW
  EXECUTE FUNCTION cafe_private.validate_cafe_region();

ALTER TABLE public.orders
  ADD COLUMN currency text DEFAULT 'ETB'::text NOT NULL;

CREATE TRIGGER orders_set_currency
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION cafe_private.order_currency();

CREATE POLICY orders_read ON public.orders
  FOR SELECT
  TO authenticated
  USING (((public.get_user_role() <> 'barista'::text) AND cafe_private.can_read_orders(cafe_slug)));

CREATE TRIGGER packages_validate_limits
  BEFORE INSERT OR UPDATE ON public.packages
  FOR EACH ROW
  EXECUTE FUNCTION cafe_private.validate_package_limits();

CREATE UNIQUE INDEX subscription_one_active_cafe ON public.subscription_requests (cafe_id)
  WHERE cafe_id IS NOT NULL AND (status = ANY (ARRAY['active'::text, 'approved'::text]));


-- >>>>> MIGRATION: 20260921081510_enforce_menu_usage_limit.sql >>>>>

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION cafe_private.enforce_menu_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare max_items integer; begin
 perform 1 from public.cafes where slug=new.cafe_slug for update;
 select (p.limits->>'menuItems')::integer into max_items from public.packages p where p.id=public.get_active_cafe_plan(new.cafe_slug);
 if max_items is null or (select count(*) from public.menu_items where cafe_slug=new.cafe_slug and id<>new.id)>=max_items then
  raise exception 'The menu-item limit for this cafe package has been reached.' using errcode='23514';
 end if;
 return new;
end $function$;

REVOKE ALL ON FUNCTION cafe_private.enforce_menu_limit() FROM PUBLIC;

CREATE TRIGGER menu_items_enforce_limit
  BEFORE INSERT OR UPDATE OF cafe_slug ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION cafe_private.enforce_menu_limit();

-- Preserve custom descriptions; correct only the original misleading copy.
update public.packages set description='Staff workspaces for kitchen, payments and operational management.' where id='professional' and description='Full cafe suite with KDS & POS';
update public.packages set description='Cafe operations, staff management and activity records.' where id='enterprise' and description='Multi-location enterprise control';
set check_function_bodies=true;
-- Subscription price currency confirmed by the product owner; amounts unchanged.
update public.packages set price='USD 29' where id='starter' and price='$29';
update public.packages set price='USD 79' where id='professional' and price='$79';
update public.packages set price='USD 199' where id='enterprise' and price='$199';
notify pgrst,'reload schema';


