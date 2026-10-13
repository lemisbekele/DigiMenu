alter table "public"."menu_items"
  add column "calories" integer not null default 0;

alter table "public"."menu_items"
  add column "name_am" text default ''::text;

alter table "public"."menu_items"
  add column "description_am" text default ''::text;

alter table "public"."menu_items"
  add column "name_om" text default ''::text;

alter table "public"."menu_items"
  add column "description_om" text default ''::text;

alter table "public"."menu_items"
  add constraint "menu_items_calories_range_check" check (((calories >= 0) AND (calories <= 100000)));

