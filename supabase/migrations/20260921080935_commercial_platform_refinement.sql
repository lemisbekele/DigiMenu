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
