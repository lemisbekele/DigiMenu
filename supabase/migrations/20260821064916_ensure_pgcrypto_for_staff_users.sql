-- `create_staff_user` hashes passwords with crypt(..., gen_salt('bf')).
-- Existing hosted projects may predate the initial migration that enabled
-- pgcrypto, so ensure the extension is present before the RPC is used.
create extension if not exists pgcrypto with schema extensions;
