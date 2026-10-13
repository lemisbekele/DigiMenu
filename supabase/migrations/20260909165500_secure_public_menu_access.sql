-- A public menu is scoped to one active cafe. Do not expose the entire
-- multi-tenant menu_items table to anonymous Data API callers.
drop policy if exists "menu_items_read_public" on public.menu_items;

create policy "menu_items_read_tenant" on public.menu_items
  for select
  to authenticated
  using (
    cafe_slug = (select public.get_user_cafe_slug())
    or (select public.get_user_role()) = 'superadmin'
  );

revoke select on public.menu_items from anon;

create or replace function public.get_public_menu(p_cafe_slug text)
returns setof public.menu_items
language sql
stable
security definer
set search_path = ''
as $$
  select m.*
  from public.menu_items as m
  join public.cafes as c on c.slug = m.cafe_slug
  where lower(m.cafe_slug) = lower(trim(p_cafe_slug))
    and c.status = 'active'
  order by m.category, m.subcategory, m.name, m.id
$$;

revoke all on function public.get_public_menu(text) from public;
grant execute on function public.get_public_menu(text) to anon, authenticated;
