-- Cash is on by default. A cafe turns it off with a hidden (inactive) "Cash" payment option,
-- set by the "Accept cash" switch in Settings.
begin;

-- Same as 20260909173000, plus a hidden Cash row so customer screens know cash is off.
create or replace function public.get_public_payment_options(p_cafe_slug text)
returns table (id text, name text, type text, account_number text, account_holder text, instructions text, active boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.type, p.account_number, p.account_holder, p.instructions, p.active
  from public.payment_options as p
  join public.cafes as c on c.slug = p.cafe_slug
  where lower(p.cafe_slug) = lower(trim(p_cafe_slug))
    and (p.active = true or p.type = 'Cash')
    and c.status = 'active'
  order by p.name, p.id
$$;

create or replace function cafe_private.cash_turned_off(p_cafe_slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payment_options where cafe_slug = p_cafe_slug and type = 'Cash')
     and not exists (select 1 from public.payment_options where cafe_slug = p_cafe_slug and type = 'Cash' and active)
$$;

-- Customers (no staff role) cannot pick cash once the cafe turned it off; staff can still record cash.
create or replace function cafe_private.block_customer_cash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_method = 'Cash'
     and new.payment_method is distinct from (case when tg_op = 'UPDATE' then old.payment_method end)
     and public.get_user_role() is null
     and cafe_private.cash_turned_off(new.cafe_slug) then
    raise exception 'This cafe does not accept cash.';
  end if;
  return new;
end $$;

drop trigger if exists orders_block_customer_cash on public.orders;
create trigger orders_block_customer_cash before insert or update of payment_method on public.orders
  for each row execute function cafe_private.block_customer_cash();

notify pgrst, 'reload schema';
commit;
