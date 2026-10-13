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