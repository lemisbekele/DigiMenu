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
