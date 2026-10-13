-- Public customer flows must never obtain another cafe's rows through the
-- Data API. Expose the small, explicitly safe projections below instead.

-- Existing security-definer identity helpers are only required by authenticated
-- staff policies. Do not leave them callable through PUBLIC.
revoke all on function public.get_user_role() from public;
grant execute on function public.get_user_role() to authenticated;

revoke all on function public.get_user_cafe_slug() from public;
grant execute on function public.get_user_cafe_slug() to authenticated;

revoke all on function public.get_user_email() from public;
grant execute on function public.get_user_email() to authenticated;

create or replace function public.get_user_cafe_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.cafe_id
  from public.user_roles as u
  where u.id = auth.uid()
$$;

revoke all on function public.get_user_cafe_id() from public;
grant execute on function public.get_user_cafe_id() to authenticated;

-- Cafe rows contain owner_email and subscription_id, which are not public
-- tenant data. Anonymous route validation gets only this safe projection.
drop policy if exists cafes_read_public on public.cafes;
drop policy if exists cafes_read_tenant_or_platform on public.cafes;
create policy cafes_read_tenant_or_platform
on public.cafes
for select
to authenticated
using (
  (select public.get_user_role()) = 'superadmin'
  or id = (select public.get_user_cafe_id())
);

revoke select on public.cafes from anon;
grant select on public.cafes to authenticated;

create or replace function public.get_public_cafe(p_cafe_slug text)
returns table (
  id text,
  name text,
  slug text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.slug, c.status
  from public.cafes as c
  where lower(c.slug) = lower(trim(p_cafe_slug))
  limit 1
$$;

revoke all on function public.get_public_cafe(text) from public;
grant execute on function public.get_public_cafe(text) to anon, authenticated;

-- Payment account details are customer-facing only for the cafe in the URL.
-- Direct anonymous table reads previously returned every active cafe's payment
-- options, including account numbers.
drop policy if exists payment_options_read_public on public.payment_options;
revoke select on public.payment_options from anon;

create index if not exists payment_options_active_cafe_slug_idx
on public.payment_options (cafe_slug, name, id)
where active = true;

create or replace function public.get_public_payment_options(p_cafe_slug text)
returns table (
  id text,
  name text,
  type text,
  account_number text,
  account_holder text,
  instructions text,
  active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.type, p.account_number, p.account_holder,
         p.instructions, p.active
  from public.payment_options as p
  join public.cafes as c on c.slug = p.cafe_slug
  where lower(p.cafe_slug) = lower(trim(p_cafe_slug))
    and p.active = true
    and c.status = 'active'
  order by p.name, p.id
$$;

revoke all on function public.get_public_payment_options(text) from public;
grant execute on function public.get_public_payment_options(text) to anon, authenticated;

-- Customers only need the tax label and rate for their current cafe. The
-- dashboard retains authenticated tenant access to the underlying table.
create index if not exists settings_cafe_slug_idx on public.settings (cafe_slug);

create or replace function public.get_public_billing_settings(p_cafe_slug text)
returns table (
  tax_label text,
  tax_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.tax_label, s.tax_rate
  from public.settings as s
  join public.cafes as c on c.slug = s.cafe_slug
  where lower(s.cafe_slug) = lower(trim(p_cafe_slug))
    and c.status = 'active'
  order by s.updated_at desc nulls last, s.id
  limit 1
$$;

revoke all on function public.get_public_billing_settings(text) from public;
grant execute on function public.get_public_billing_settings(text) to anon, authenticated;
