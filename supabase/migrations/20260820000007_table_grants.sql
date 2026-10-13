-- =============================================================
-- Table-level grants mirroring hosted Supabase default privileges.
-- Local `db reset` only bestows REFERENCES/TRIGGER/TRUNCATE on new
-- tables, which silently breaks every API call. In hosted Supabase
-- the default ACL grants all privileges to anon, authenticated and
-- service_role on public tables and Row Level Security is the only
-- gate. Reproduce that here (RLS policies were created by the
-- earlier migrations, so row access remains fully controlled).
-- =============================================================

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;