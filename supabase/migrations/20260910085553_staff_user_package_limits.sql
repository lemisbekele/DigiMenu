set local check_function_bodies = off;

drop function "public"."create_staff_user"(text, text, text);

create or replace function public.create_staff_user (
  p_email        text,
  p_password     text,
  p_display_name text default ''::text,
  p_role         text default 'barista'::text
)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'extensions', 'auth'
  AS $function$
declare
  v_actor_role text := public.get_user_role();
  v_cafe_slug text := public.get_user_cafe_slug();
  v_cafe_id text;
  v_staff_limit integer;
  v_staff_count integer;
  v_uid uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
  v_requested_role text := lower(trim(coalesce(p_role, 'barista')));
begin
  if v_actor_role <> 'admin' or v_cafe_slug is null or not public.cafe_has_feature('userManagement') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if v_requested_role not in ('admin', 'manager', 'cashier', 'barista') then
    raise exception 'Invalid role.';
  end if;
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'A valid email is required.';
  end if;
  if char_length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;

  -- Serialize account creation per cafe so two concurrent requests cannot
  -- both consume the same final staff seat.
  perform pg_advisory_xact_lock(hashtext(lower(v_cafe_slug)));

  select c.id into v_cafe_id
  from public.cafes c
  where lower(c.slug) = lower(v_cafe_slug);
  if v_cafe_id is null then
    raise exception 'Your cafe assignment is invalid.' using errcode = '42501';
  end if;

  select case
    when jsonb_typeof(p.limits -> 'staffUsers') = 'number'
      and (p.limits ->> 'staffUsers') ~ '^[1-9][0-9]*$'
      then (p.limits ->> 'staffUsers')::integer
  end
  into v_staff_limit
  from public.subscription_requests sr
  join public.packages p on p.id = sr.plan_key
  where lower(sr.cafe_slug) = lower(v_cafe_slug)
    and sr.status in ('active', 'approved')
    and p.status = 'active'
  order by sr.updated_at desc nulls last, sr.activated_at desc nulls last
  limit 1;

  if coalesce(v_staff_limit, 0) < 1 then
    raise exception 'Your current package has no staff-account allocation. Contact the platform administrator.';
  end if;

  select count(*) into v_staff_count
  from public.user_roles
  where lower(coalesce(cafe_slug, '')) = lower(v_cafe_slug);

  if v_staff_count >= v_staff_limit then
    raise exception 'Your package allows % staff accounts and all % seats are already in use.', v_staff_limit, v_staff_limit;
  end if;

  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'This email is already registered.';
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
    v_uid, v_email, v_requested_role, p_display_name, v_cafe_id, v_cafe_slug,
    true, false, 'en'
  );

  return v_uid;
end;
$function$;

revoke all on function "public"."create_staff_user"(text, text, text, text) from public;

grant execute on function "public"."create_staff_user"(text, text, text, text) to "authenticated", "postgres";

