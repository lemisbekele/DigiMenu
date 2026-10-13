-- Resolve the audit actor from the authenticated user's immutable profile
-- identity. Some local PostgREST versions populate auth.uid() but do not
-- project the email claim through auth.jwt(), so use the same server-side
-- lookup pattern already used for role and tenant checks.
create or replace function public.get_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ur.email
  from public.user_roles as ur
  where ur.id = (select auth.uid())
$$;

revoke all on function public.get_user_email() from public;
grant execute on function public.get_user_email() to authenticated;

drop policy if exists "audit_logs_insert_staff" on public.audit_logs;
create policy "audit_logs_insert_staff" on public.audit_logs
  for insert
  to authenticated
  with check (
    actor = (select public.get_user_email())
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
