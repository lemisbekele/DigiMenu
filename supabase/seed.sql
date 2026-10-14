-- =============================================================
-- Local development seed.
-- Creates the "lemi-coffee" demo tenant with an active Enterprise
-- subscription plus ready-to-use staff accounts, mirroring the hosted
-- project so `supabase start` (Docker) and production behave identically.
--
-- Demo credentials (all): Password1!
--   superadmin@lemi.test   -> platform console (/superadmin)
--   admin@lemi.test        -> /lemi-coffee/dashboard
--   manager@lemi.test      -> /lemi-coffee/dashboard
--   cashier@lemi.test      -> /lemi-coffee/pos
--   barista@lemi.test      -> /lemi-coffee/kds
-- =============================================================

-- 1. Tenant ---------------------------------------------------------------
insert into public.cafes (id, name, slug, owner_email, subscription_id, status, created_at)
values (
  'cafe_lemi_seed',
  'Lemi Coffee',
  'lemi-coffee',
  'admin@lemi.test',
  'sub_lemi_seed',
  'active',
  now()
)
on conflict (slug) do nothing;

-- 2. Active Enterprise subscription --------------------------------------
insert into public.subscription_requests (
  id, customer_name, email, phone, plan_key, notes, status,
  requested_at, approved_at, activated_at, cafe_id, cafe_slug, updated_at
)
values (
  'sub_lemi_seed',
  'Lemi Coffee',
  'admin@lemi.test',
  '',
  'enterprise',
  'Seeded active subscription for local development.',
  'active',
  now(), now(), now(),
  'cafe_lemi_seed',
  'lemi-coffee',
  now()
)
on conflict (id) do nothing;

-- 3. Demo auth users + role rows -----------------------------------------
create extension if not exists pgcrypto;

do $$
declare
  v_uid uuid;
  v_cafe_id text := 'cafe_lemi_seed';
  v_slug text := 'lemi-coffee';
  v_user record;
  v_phone_seq int := 0;
begin
  for v_user in
    select * from (values
      ('superadmin@lemi.test', 'Platform Owner', 'superadmin'),
      ('admin@lemi.test',      'Lemi Admin',     'admin'),
      ('manager@lemi.test',    'Lemi Manager',   'manager'),
      ('cashier@lemi.test',    'Lemi Cashier',   'cashier'),
      ('barista@lemi.test',    'Lemi Barista',   'barista')
    ) as t(email, display, user_role)
  loop
    if exists (select 1 from auth.users where lower(email) = v_user.email) then
      continue;
    end if;

    v_uid := gen_random_uuid();
    v_phone_seq := v_phone_seq + 1;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      phone,
      email_confirmed_at, confirmation_sent_at, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_uid,
      'authenticated',
      'authenticated',
      v_user.email,
      crypt('Password1!', gen_salt('bf')),
      -- GoTrue scans token/contact columns as non-null strings; give each
      -- user a unique placeholder so the users_phone_key constraint holds.
      format('+15550100%04s', v_phone_seq),
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'cafe_id', case when v_user.user_role = 'superadmin' then null else v_cafe_id end,
        'cafe_slug', case when v_user.user_role = 'superadmin' then null else v_slug end,
        'display_name', v_user.display
      ),
      now(), now(), false, false,
      '', '', '',
      '', '',
      '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at,
      created_at, updated_at, id
    ) values (
      v_user.email,
      v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_user.email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now(),
      v_uid
    );

    insert into public.user_roles (
      id, email, role, display_name, cafe_id, cafe_slug,
      must_change_password, disabled, language
    ) values (
      v_uid,
      v_user.email,
      v_user.user_role,
      v_user.display,
      case when v_user.user_role = 'superadmin' then null else v_cafe_id end,
      case when v_user.user_role = 'superadmin' then null else v_slug end,
      false, false, 'en'
    );
  end loop;
end $$;

-- 4. A couple of tables so QR management is not empty ---------------------
insert into public.tables (id, cafe_slug, table_number, label, print_title, print_note)
values
  ('table-lemi-coffee-1', 'lemi-coffee', 1, 'Table 1', 'Scan to Order', 'Point your phone camera to view the menu and place your order'),
  ('table-lemi-coffee-2', 'lemi-coffee', 2, 'Table 2', 'Scan to Order', 'Point your phone camera to view the menu and place your order')
on conflict (id) do nothing;

-- 5. Demo Menu Items -------------------------------------------------------
insert into public.menu_items (
  id, name, description, price, category, subcategory, image_url, available, estimated_minutes, ingredients, options, cafe_slug, calories
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Specialty Macchiato',
    'Double shot Ethiopian Arabica layered with silky micro-foam.',
    140.00,
    'Hot Coffee',
    'Espresso',
    'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80',
    true,
    5,
    '["Ethiopian Arabica", "Whole Milk"]'::jsonb,
    '[{"label": "Milk Option", "choices": [{"name": "Whole Milk", "extraPrice": 0}, {"name": "Oat Milk", "extraPrice": 30}]}]'::jsonb,
    'lemi-coffee',
    110
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Honey Oat Cortado',
    'Rich espresso infused with wildflower honey and steamed oat milk.',
    195.00,
    'Hot Coffee',
    'Specialty',
    'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
    true,
    6,
    '["Double Espresso", "Wildflower Honey", "Organic Oat Milk"]'::jsonb,
    '[]'::jsonb,
    'lemi-coffee',
    165
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'Iced Spanish Latte',
    'Chilled espresso over ice with textured condensed and fresh milk.',
    230.00,
    'Iced Drinks',
    'Cold Coffee',
    'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=600&q=80',
    true,
    5,
    '["Espresso", "Condensed Milk", "Fresh Milk", "Ice"]'::jsonb,
    '[]'::jsonb,
    'lemi-coffee',
    260
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'Almond Butter Croissant',
    'Flaky French pastry baked fresh every morning with toasted almonds.',
    240.00,
    'Pastries',
    'Bakery',
    'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80',
    true,
    3,
    '["French Butter", "Flour", "Toasted Almonds", "Almond Frangipane"]'::jsonb,
    '[]'::jsonb,
    'lemi-coffee',
    340
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'Avocado Toast',
    'Artisan sourdough topped with crushed avocado, poached egg, and chili flakes.',
    280.00,
    'Pastries',
    'Brunch',
    'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
    true,
    10,
    '["Sourdough Bread", "Hass Avocado", "Poached Egg", "Olive Oil", "Chili Flakes"]'::jsonb,
    '[]'::jsonb,
    'lemi-coffee',
    320
  ),
  (
    '00000000-0000-0000-0000-000000000006',
    'Ceremonial Matcha Latte',
    'Stone-ground Japanese green tea whisked with silky steamed milk.',
    210.00,
    'Hot Coffee',
    'Tea & Infusions',
    'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=600&q=80',
    true,
    5,
    '["Ceremonial Matcha", "Steamed Milk", "Vanilla"]'::jsonb,
    '[]'::jsonb,
    'lemi-coffee',
    140
  )
on conflict (id) do nothing;

