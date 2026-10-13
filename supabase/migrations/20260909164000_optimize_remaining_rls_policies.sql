-- Keep the remaining tenant policies explicit and let Postgres evaluate the
-- caller identity once per statement. This preserves the existing access
-- model while removing overlapping permissive UPDATE policies.

drop policy if exists "user_roles_read_tenant_scoped" on public.user_roles;
create policy "user_roles_read_tenant_scoped" on public.user_roles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or cafe_slug = (select public.get_user_cafe_slug())
    or (select public.get_user_role()) = 'superadmin'
  );

drop policy if exists "user_roles_update_own" on public.user_roles;
drop policy if exists "user_roles_update_tenant_scoped" on public.user_roles;
create policy "user_roles_update_scoped" on public.user_roles
  for update
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.get_user_role()) = 'superadmin'
    or (
      (select public.get_user_role()) = 'admin'
      and cafe_slug = (select public.get_user_cafe_slug())
      and (select public.cafe_has_feature('userManagement'))
    )
  )
  with check (
    (
      id = (select auth.uid())
      and role = (
        select ur.role
        from public.user_roles as ur
        where ur.id = (select auth.uid())
      )
      and (
        cafe_slug = (select public.get_user_cafe_slug())
        or (select public.get_user_role()) = 'superadmin'
      )
    )
    or (select public.get_user_role()) = 'superadmin'
    or (
      (select public.get_user_role()) = 'admin'
      and cafe_slug = (select public.get_user_cafe_slug())
      and role <> 'superadmin'
      and (select public.cafe_has_feature('userManagement'))
    )
  );

drop policy if exists "subscription_requests_read_tenant" on public.subscription_requests;
create policy "subscription_requests_read_tenant" on public.subscription_requests
  for select
  to authenticated
  using (
    (select public.get_user_role()) = 'superadmin'
    or cafe_slug = (select public.get_user_cafe_slug())
  );
