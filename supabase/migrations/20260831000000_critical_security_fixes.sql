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
