-- Repairs older hosted audit_logs tables used by the current Supabase client.
-- Safe to run more than once in Supabase SQL Editor.
alter table public.audit_logs add column if not exists cafe_slug text;
alter table public.audit_logs add column if not exists created_at_ms bigint;

update public.audit_logs
set created_at_ms = (extract(epoch from coalesce(created_at, now())) * 1000)::bigint
where created_at_ms is null;

alter table public.audit_logs alter column created_at_ms
  set default (extract(epoch from now()) * 1000)::bigint;

create index if not exists audit_logs_cafe_slug_idx on public.audit_logs (cafe_slug);
create index if not exists audit_logs_created_at_ms_idx on public.audit_logs (created_at_ms desc);
