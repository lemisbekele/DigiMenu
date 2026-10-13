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
