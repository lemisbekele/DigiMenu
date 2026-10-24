-- Full definitions of functions earlier migrations patched by text replace,
-- so the live source is readable here and a missed replace cannot go unnoticed.
begin;

-- Scope 'recent' (last 31 days) for dashboards; 'all' stays for reports.
-- The caller's role is looked up once instead of once per row.
create or replace function public.get_staff_orders(
  p_cafe_slug text,
  p_limit integer default 1000,
  p_offset integer default 0,
  p_scope text default 'all'
) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare o record; result jsonb; is_barista boolean; since_ms bigint; begin
  -- 'recent' is history, so it needs the same plan feature as 'all'.
  if not cafe_private.can_read_orders(p_cafe_slug,case when p_scope='recent' then 'all' else p_scope end) then raise exception 'Not authorized.' using errcode='42501'; end if;
  is_barista := public.get_user_role()='barista';
  since_ms := floor(extract(epoch from now()-interval '31 days')*1000);
  for o in select * from public.orders where cafe_slug=p_cafe_slug and (
      p_scope='all'
      or (p_scope='recent' and created_at_ms>=since_ms)
      or (p_scope='active' and order_status not in ('paid','rejected'))
      or (p_scope='cashier' and (payment_status not in ('paid','approved') or left(coalesce(paid_at,''),10)>=(current_date-2)::text)))
    order by created_at_ms desc,id limit least(greatest(p_limit,1),1000) offset greatest(p_offset,0) loop
    if is_barista then
      result:=jsonb_build_object('id',o.id,'cafe_slug',o.cafe_slug,'table_number',o.table_number,'order_status',o.order_status,
        'estimated_ready_minutes',o.estimated_ready_minutes,'auto_ready_enabled',o.auto_ready_enabled,'auto_ready_at',o.auto_ready_at,
        'created_at',o.created_at,'created_at_ms',o.created_at_ms,'accepted_at_ms',o.accepted_at_ms,'prepared_at_ms',o.prepared_at_ms,'ready_at_ms',o.ready_at_ms);
      result:=result||jsonb_build_object('items',(select coalesce(jsonb_agg(jsonb_build_object('itemId',i->>'itemId','name',i->>'name','quantity',i->'quantity','notes',i->>'notes','category',i->>'category','subcategory',i->>'subcategory','ingredients',i->'ingredients','customizations',
        (select coalesce(jsonb_object_agg(k,(select coalesce(jsonb_agg(jsonb_build_object('name',v->>'name')),'[]') from jsonb_array_elements(vals) v)),'{}') from jsonb_each(coalesce(i->'customizations','{}')) as c(k,vals)))),'[]') from jsonb_array_elements(o.items) i));
    else result:=to_jsonb(o); end if;
    return next result;
  end loop;
end $$;

-- The auto-ready watcher sends {"autoReady": true}. Only the first such update
-- may move a still-preparing order to ready; later or stale ones are refused,
-- so several open staff screens cannot double-notify or undo a rejection.
create or replace function public.update_staff_order(p_order_id uuid,p_changes jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; d numeric; r text:=public.get_user_role(); begin
  select * into o from public.orders where id=p_order_id for update;
  if not cafe_private.can_access(o.cafe_slug,array['admin','manager','cashier','barista']) then raise exception 'Not authorized.' using errcode='42501'; end if;
  if not public.cafe_feature_enabled(o.cafe_slug,case when r='barista' then 'kds' when r='cashier' then 'cashierPos' else 'ordering' end) then raise exception 'This operation is not included in this cafe package.' using errcode='42501'; end if;
  if jsonb_typeof(p_changes)<>'object' then raise exception 'Invalid changes.'; end if;
  if (p_changes->>'autoReady')::boolean and o.order_status<>'preparing' then raise exception 'Order is no longer preparing.'; end if;
  p_changes := p_changes-'autoReady';
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

-- Same as 20260916200032 plus the customer-notes patch, written out in full.
create or replace function public.create_customer_order(p_table_number text,p_items jsonb,p_estimated_ready_minutes integer default 0,
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
      'notes',left(coalesce(item->>'notes',''),1000),'category',menu.category,'subcategory',menu.subcategory,'ingredients',menu.ingredients,'customizations',custom,'imageUrl',menu.image_url,'calories',menu.calories));
  end loop;
  select b.tax_rate into tax_rate from public.billing_settings_for_cafe(p_cafe_slug) b;
  tax_rate:=coalesce(tax_rate,15);
  insert into public.orders(table_id,table_number,cafe_slug,items,subtotal_amount,taxable_amount,tax_rate,tax_amount,total_amount,discount_amount,estimated_ready_minutes,payment_method)
  values(table_key,p_table_number,p_cafe_slug,clean_items,subtotal,subtotal,tax_rate,round(subtotal*tax_rate/100,2),round(subtotal+subtotal*tax_rate/100,2),0,ready,p_payment_method) returning orders.id into id;
  insert into cafe_private.order_access values(id,encode(extensions.digest(p_token,'sha256'),'hex'));
  return id;
end $$;

notify pgrst,'reload schema';
commit;
