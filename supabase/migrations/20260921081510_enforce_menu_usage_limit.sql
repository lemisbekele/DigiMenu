-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION cafe_private.enforce_menu_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare max_items integer; begin
 perform 1 from public.cafes where slug=new.cafe_slug for update;
 select (p.limits->>'menuItems')::integer into max_items from public.packages p where p.id=public.get_active_cafe_plan(new.cafe_slug);
 if max_items is null or (select count(*) from public.menu_items where cafe_slug=new.cafe_slug and id<>new.id)>=max_items then
  raise exception 'The menu-item limit for this cafe package has been reached.' using errcode='23514';
 end if;
 return new;
end $function$;

REVOKE ALL ON FUNCTION cafe_private.enforce_menu_limit() FROM PUBLIC;

CREATE TRIGGER menu_items_enforce_limit
  BEFORE INSERT OR UPDATE OF cafe_slug ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION cafe_private.enforce_menu_limit();

-- Preserve custom descriptions; correct only the original misleading copy.
update public.packages set description='Staff workspaces for kitchen, payments and operational management.' where id='professional' and description='Full cafe suite with KDS & POS';
update public.packages set description='Cafe operations, staff management and activity records.' where id='enterprise' and description='Multi-location enterprise control';
set check_function_bodies=true;
-- Subscription price currency confirmed by the product owner; amounts unchanged.
update public.packages set price='USD 29' where id='starter' and price='$29';
update public.packages set price='USD 79' where id='professional' and price='$79';
update public.packages set price='USD 199' where id='enterprise' and price='$199';
notify pgrst,'reload schema';
