-- Run with: supabase test db  (needs the local stack with supabase/seed.sql loaded)
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Three orders of Specialty Macchiato (5 min each) at a kitchen that makes 2 at once.
update public.cafes set kitchen_capacity = 2 where slug = 'lemi-coffee';
update public.orders set order_status = 'paid' where cafe_slug = 'lemi-coffee';
select set_config('test.o' || n, public.create_customer_order('1',
  '[{"itemId":"00000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
  0, 'lemi-coffee', repeat(n::text, 40), 'Cash')::text, true)
from generate_series(1, 3) n;
-- All three were created in this one transaction (same now()); give them distinct arrival times.
update public.orders set created_at_ms = created_at_ms + n
from generate_series(1, 3) n where id = current_setting('test.o' || n)::uuid;

select is((public.get_order_for_tracking(current_setting('test.o1')::uuid, repeat('1', 40), 'lemi-coffee')->>'queue_position')::int,
  0, 'first order is next');
select is((public.get_order_for_tracking(current_setting('test.o2')::uuid, repeat('2', 40), 'lemi-coffee')->>'wait_minutes')::int,
  5, 'second order is being prepared: only its own time');
select is((public.get_order_for_tracking(current_setting('test.o3')::uuid, repeat('3', 40), 'lemi-coffee')->>'wait_minutes')::int,
  10, 'third order waits: 10 min ahead shared by 2, plus its own 5');

-- A "Done" tap moves a received order straight to ready, and the line moves up.
update public.orders set order_status = 'ready' where id = current_setting('test.o1')::uuid;
select is((public.get_order_for_tracking(current_setting('test.o3')::uuid, repeat('3', 40), 'lemi-coffee')->>'queue_position')::int,
  1, 'third order moves up when the first is done');
select ok((public.get_order_for_tracking(current_setting('test.o1')::uuid, repeat('1', 40), 'lemi-coffee')->'queue_position') = 'null'::jsonb,
  'a done order has no place in line');

select * from finish();
rollback;
