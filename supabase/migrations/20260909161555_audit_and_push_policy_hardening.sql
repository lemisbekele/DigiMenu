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
