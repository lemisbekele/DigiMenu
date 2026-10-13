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
