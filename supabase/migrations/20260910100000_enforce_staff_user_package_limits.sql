-- Package data migration paired with the generated staff-provisioning RPC
-- migration immediately before it. Existing valid allocations are retained.
update public.packages
set limits = jsonb_set(
  coalesce(limits, '{}'::jsonb),
  '{staffUsers}',
  coalesce(
    case
      when jsonb_typeof(limits -> 'staffUsers') = 'number'
        and (limits ->> 'staffUsers') ~ '^[1-9][0-9]*$'
        then limits -> 'staffUsers'
    end,
    case id
      when 'starter' then to_jsonb(1)
      when 'professional' then to_jsonb(8)
      when 'enterprise' then to_jsonb(25)
      else to_jsonb(1)
    end
  ),
  true
)
where id in ('starter', 'professional', 'enterprise')
  or coalesce(features, '[]'::jsonb) ? 'userManagement';
