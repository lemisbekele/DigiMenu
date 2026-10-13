-- The combined self-update policy must not query user_roles directly: that
-- would evaluate this same policy recursively. get_user_role() is the
-- existing security-definer helper for this exact lookup.
drop policy if exists "user_roles_update_scoped" on public.user_roles;
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
      and role = (select public.get_user_role())
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
