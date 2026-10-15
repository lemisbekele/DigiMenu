-- Migration: 20261015000000_fix_package_entitlements.sql
-- Fix package entitlements and limits in public.packages catalog

-- 1. Starter Package:
-- Essential cafe tier: customer digital menu, online ordering, staff access for owner,
-- menu management, tables, cafe settings, kitchen order history, KDS, analytics, and multi-language support.
-- Limits: 50 menu items, 2 staff accounts (owner + 1 staff).
UPDATE public.packages
SET features = '["digitalMenu","ordering","staffAccess","menuManagement","tables","settings","orderHistory","kds","analytics","multiLanguage"]'::jsonb,
    limits = jsonb_set(
      jsonb_set(coalesce(limits, '{}'::jsonb), '{menuItems}', to_jsonb(50)),
      '{staffUsers}',
      to_jsonb(2)
    ),
    updated_at = now()
WHERE id = 'starter';

-- 2. Professional Package:
-- Growing cafe tier: Starter + cashier POS, inventory management, real-time notifications,
-- user management (for 8 staff), and multi-language support.
-- Limits: 500 menu items, 8 staff accounts.
UPDATE public.packages
SET features = '["digitalMenu","ordering","staffAccess","kds","orderHistory","cashierPos","inventory","notifications","analytics","menuManagement","tables","settings","userManagement","multiLanguage"]'::jsonb,
    limits = jsonb_set(
      jsonb_set(coalesce(limits, '{}'::jsonb), '{menuItems}', to_jsonb(500)),
      '{staffUsers}',
      to_jsonb(8)
    ),
    updated_at = now()
WHERE id = 'professional';

-- 3. Enterprise Package:
-- Full enterprise tier: Professional + audit logs.
-- Limits: 5000 menu items, 25 staff accounts.
UPDATE public.packages
SET features = '["digitalMenu","ordering","staffAccess","kds","orderHistory","cashierPos","inventory","notifications","analytics","menuManagement","tables","settings","userManagement","auditLogs","multiLanguage"]'::jsonb,
    limits = jsonb_set(
      jsonb_set(coalesce(limits, '{}'::jsonb), '{menuItems}', to_jsonb(5000)),
      '{staffUsers}',
      to_jsonb(25)
    ),
    updated_at = now()
WHERE id = 'enterprise';
