-- Run with: supabase test db  (needs the local stack with supabase/seed.sql loaded)
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- 2 x Specialty Macchiato (140) with Oat Milk (+30). The client lies about the
-- extra price; the server must use the menu's price instead.
select lives_ok($$
  select set_config('test.order_id', public.create_customer_order(
    '1',
    '[{"itemId":"00000000-0000-0000-0000-000000000001","quantity":2,"notes":"no sugar",
       "customizations":{"Milk Option":[{"name":"Oat Milk","extraPrice":0}]}}]'::jsonb,
    0, 'lemi-coffee', repeat('t', 40), 'Cash')::text, true)
$$, 'customer can place an order');

select is((select subtotal_amount from public.orders where id = current_setting('test.order_id')::uuid),
  340.00::numeric, 'subtotal uses menu prices, not client prices');

select is((select total_amount from public.orders where id = current_setting('test.order_id')::uuid),
  (select round(340 * (1 + tax_rate / 100), 2) from public.orders where id = current_setting('test.order_id')::uuid),
  'total adds tax');

select is((select items->0->>'notes' from public.orders where id = current_setting('test.order_id')::uuid),
  'no sugar', 'customer notes are kept');

select * from finish();
rollback;
