-- A legacy overload with p_role defaulted makes PostgREST's named-parameter
-- RPC resolution ambiguous with the tenant-scoped three-argument function.
-- Staff roles are intentionally assigned by the follow-up set_user_role RPC,
-- so this unsafe/obsolete overload must not remain callable.
drop function if exists public.create_staff_user(text, text, text, text);

revoke all on function public.create_staff_user(text, text, text) from public, anon;
grant execute on function public.create_staff_user(text, text, text) to authenticated;
