-- Restore the tenant-scoped staff provisioning RPC for hosted projects where
-- an earlier migration was partially applied. Password hashing comes from
-- pgcrypto, installed in the extensions schema.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_staff_user(
  p_email text,
  p_password text,
  p_display_name text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_role text := public.get_user_role();
  v_cafe_slug text := public.get_user_cafe_slug();
  v_cafe_id text;
  v_uid uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if v_role <> 'admin' or v_cafe_slug is null or not public.cafe_has_feature('userManagement') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'A valid email is required.';
  end if;
  if char_length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'This email is already registered.';
  end if;

  select id into v_cafe_id
  from public.cafes
  where lower(slug) = lower(v_cafe_slug);
  if v_cafe_id is null then
    raise exception 'Your cafe assignment is invalid.' using errcode = '42501';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_sent_at, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('cafe_id', v_cafe_id, 'cafe_slug', v_cafe_slug, 'display_name', p_display_name),
    now(), now(), false, false
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at, id
  ) values (
    v_email, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now(), v_uid
  );

  insert into public.user_roles (
    id, email, role, display_name, cafe_id, cafe_slug,
    must_change_password, disabled, language
  ) values (
    v_uid, v_email, 'barista', p_display_name, v_cafe_id, v_cafe_slug,
    true, false, 'en'
  );

  return v_uid;
end;
$$;

revoke all on function public.create_staff_user(text, text, text) from public, anon;
grant execute on function public.create_staff_user(text, text, text) to authenticated;
