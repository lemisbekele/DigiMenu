-- Kitchen queue: the oldest N open orders count as "preparing"; N is set per cafe.
-- Keep the wait formula in step with src/services/kitchenQueue.js.
begin;

alter table public.cafes add column if not exists kitchen_capacity integer not null default 2
  check (kitchen_capacity between 1 and 10);

create or replace function public.get_kitchen_capacity(p_cafe_slug text) returns integer
language sql stable security definer set search_path='' as $$
  select coalesce((select kitchen_capacity from public.cafes where slug=lower(trim(p_cafe_slug))),2)
$$;
revoke all on function public.get_kitchen_capacity(text) from public;
grant execute on function public.get_kitchen_capacity(text) to anon,authenticated;

create or replace function public.set_kitchen_capacity(p_cafe_slug text,p_capacity integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not cafe_private.can_access(p_cafe_slug,array['admin','manager','barista']) then raise exception 'Not authorized.' using errcode='42501'; end if;
  if p_capacity is null or p_capacity not between 1 and 10 then raise exception 'Choose between 1 and 10 orders.'; end if;
  update public.cafes set kitchen_capacity=p_capacity where slug=p_cafe_slug;
  insert into public.audit_logs(action,actor,cafe_slug,details,created_at_ms)
  values('settings.kitchenCapacity.update',public.get_user_email(),p_cafe_slug,jsonb_build_object('capacity',p_capacity),extract(epoch from now())*1000);
end $$;
revoke all on function public.set_kitchen_capacity(text,integer) from public,anon;
grant execute on function public.set_kitchen_capacity(text,integer) to authenticated;

-- Place in line (0 = next) and estimated wait for one open order; nulls once it is done.
create or replace function cafe_private.order_queue(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.orders%rowtype; cap integer; pos integer; ahead_minutes numeric; own integer; begin
  select * into o from public.orders where id=p_order_id;
  if o.id is null or o.order_status not in ('received','accepted','preparing') then
    return jsonb_build_object('queue_position',null,'wait_minutes',null);
  end if;
  cap := public.get_kitchen_capacity(o.cafe_slug);
  own := coalesce(nullif(o.estimated_ready_minutes,0),15);
  select count(*),coalesce(sum(coalesce(nullif(a.estimated_ready_minutes,0),15)),0) into pos,ahead_minutes
    from public.orders a where a.cafe_slug=o.cafe_slug and a.order_status in ('received','accepted','preparing')
    and (a.created_at_ms,a.id::text)<(o.created_at_ms,o.id::text);
  return jsonb_build_object('queue_position',pos,'kitchen_capacity',cap,
    'wait_minutes',case when pos<cap then own else ceil(ahead_minutes/cap)::integer+own end);
end $$;
revoke all on function cafe_private.order_queue(uuid) from public,anon,authenticated;

create or replace function public.get_order_for_tracking(p_order_id uuid,p_token text default null,p_cafe_slug text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not cafe_private.customer_access(p_order_id,p_token,p_cafe_slug) then
    raise exception 'Order access denied.' using errcode='42501';
  end if;
  return cafe_private.get_order_for_tracking(p_order_id)||cafe_private.order_queue(p_order_id);
end $$;

create or replace function public.get_orders_by_ids(p_ids uuid[],p_tokens jsonb default '{}',p_cafe_slug text default null) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare id uuid; begin
  if cardinality(p_ids)>50 then raise exception 'Too many orders.'; end if;
  foreach id in array p_ids loop
    if cafe_private.customer_access(id,p_tokens->>id::text,p_cafe_slug) then
      return next cafe_private.get_order_for_tracking(id)||cafe_private.order_queue(id);
    end if;
  end loop;
end $$;

-- Auto-ready is gone, so the watcher's marker check is dropped (full definition, no text patching).
create or replace function public.update_staff_order(p_order_id uuid,p_changes jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; d numeric; r text:=public.get_user_role(); begin
  select * into o from public.orders where id=p_order_id for update;
  if not cafe_private.can_access(o.cafe_slug,array['admin','manager','cashier','barista']) then raise exception 'Not authorized.' using errcode='42501'; end if;
  if not public.cafe_feature_enabled(o.cafe_slug,case when r='barista' then 'kds' when r='cashier' then 'cashierPos' else 'ordering' end) then raise exception 'This operation is not included in this cafe package.' using errcode='42501'; end if;
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


-- Inner order update (moved to cafe_private in 20260916200032), in full with the queue transition.
create or replace function cafe_private.update_staff_order(p_order_id uuid, p_changes jsonb)
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
        -- Kitchen queue: one "Done" tap moves any open order straight to ready.
        (v_order.order_status = 'received' and v_status in ('accepted', 'preparing', 'ready', 'rejected')) or
        (v_order.order_status = 'accepted' and v_status in ('preparing', 'ready', 'rejected')) or
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
revoke all on function cafe_private.update_staff_order(uuid,jsonb) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
