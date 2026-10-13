-- Restore package entitlement helpers required by tenant-scoped RPCs such as
-- create_staff_user. These checks use the authenticated user's cafe and the
-- active subscription stored in Supabase; browser state is never trusted.
create or replace function public.cafe_feature_enabled(p_cafe_slug text, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscription_requests sr
    join public.packages p on p.id = sr.plan_key
    where lower(coalesce(sr.cafe_slug, '')) = lower(p_cafe_slug)
      and lower(coalesce(sr.status, '')) in ('active', 'approved')
      and lower(coalesce(p.status, '')) = 'active'
      and p.features ? p_feature
  )
$$;

create or replace function public.cafe_has_feature(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.get_user_role() = 'superadmin' then true
    when public.get_user_cafe_slug() is null then false
    else public.cafe_feature_enabled(public.get_user_cafe_slug(), p_feature)
  end
$$;

revoke all on function public.cafe_feature_enabled(text, text) from public;
grant execute on function public.cafe_feature_enabled(text, text) to authenticated;
revoke all on function public.cafe_has_feature(text) from public;
grant execute on function public.cafe_has_feature(text) to authenticated;
