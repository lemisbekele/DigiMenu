-- Kitchen stations: a kitchen account works one station (food or drinks; null = both).
-- Mixed orders are ready once every station in them has tapped Done.
-- Food/drink split per item is decided in src/services/kitchenQueue.js (isDrink).
begin;

alter table public.user_roles add column if not exists station text check (station in ('food','drinks'));
alter table public.orders add column if not exists done_stations text[] not null default '{}';
-- No column grant for station: only set_user_station below can change it.

create or replace function public.set_user_station(p_uid uuid,p_station text) returns void
language plpgsql security definer set search_path='' as $$
declare t public.user_roles%rowtype; begin
  if p_station is not null and p_station not in ('food','drinks') then raise exception 'Invalid station.'; end if;
  select * into t from public.user_roles where id=p_uid;
  if t.id is null or not cafe_private.can_access(t.cafe_slug,array['admin','manager']) then raise exception 'Not authorized.' using errcode='42501'; end if;
  update public.user_roles set station=p_station where id=p_uid;
  insert into public.audit_logs(action,actor,cafe_slug,details,created_at_ms)
  values('user.station.update',public.get_user_email(),t.cafe_slug,jsonb_build_object('uid',p_uid,'station',p_station),extract(epoch from now())*1000);
end $$;
revoke all on function public.set_user_station(uuid,text) from public,anon;
grant execute on function public.set_user_station(uuid,text) to authenticated;

-- Records one station's Done and returns every station done so far (atomic, so two
-- stations tapping at once both see the full list and one of them marks the order ready).
create or replace function public.mark_station_done(p_order_id uuid,p_station text) returns text[]
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; done text[]; begin
  if p_station not in ('food','drinks') then raise exception 'Invalid station.'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null or not cafe_private.can_access(o.cafe_slug,array['admin','manager','barista']) then raise exception 'Not authorized.' using errcode='42501'; end if;
  if o.order_status not in ('received','accepted','preparing') then raise exception 'Order is no longer open.'; end if;
  update public.orders set done_stations=(select array_agg(distinct s) from unnest(done_stations||p_station) s)
    where id=p_order_id returning done_stations into done;
  return done;
end $$;
revoke all on function public.mark_station_done(uuid,text) from public,anon;
grant execute on function public.mark_station_done(uuid,text) to authenticated;

-- Same as 20261024000000, plus done_stations in the kitchen (barista) view.
create or replace function public.get_staff_orders(
  p_cafe_slug text,
  p_limit integer default 1000,
  p_offset integer default 0,
  p_scope text default 'all'
) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare o record; result jsonb; is_barista boolean; since_ms bigint; begin
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
        'created_at',o.created_at,'created_at_ms',o.created_at_ms,'accepted_at_ms',o.accepted_at_ms,'prepared_at_ms',o.prepared_at_ms,'ready_at_ms',o.ready_at_ms,
        'done_stations',to_jsonb(o.done_stations));
      result:=result||jsonb_build_object('items',(select coalesce(jsonb_agg(jsonb_build_object('itemId',i->>'itemId','name',i->>'name','quantity',i->'quantity','notes',i->>'notes','category',i->>'category','subcategory',i->>'subcategory','ingredients',i->'ingredients','customizations',
        (select coalesce(jsonb_object_agg(k,(select coalesce(jsonb_agg(jsonb_build_object('name',v->>'name')),'[]') from jsonb_array_elements(vals) v)),'{}') from jsonb_each(coalesce(i->'customizations','{}')) as c(k,vals)))),'[]') from jsonb_array_elements(o.items) i));
    else result:=to_jsonb(o); end if;
    return next result;
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
