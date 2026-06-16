-- Admin-context probe for list_admin_meetup_availability(), returning a real row
-- so the Management API surfaces it. The LATERAL dependency forces set_config
-- (simulated admin JWT: request.jwt.claims.sub = a real admin user_id) to run
-- before the function is evaluated. On the buggy definition this whole query
-- errors with SQLSTATE 42702 (ambiguous meetup_id); when fixed it returns a count.
select f.admin_rows
from (
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', (select user_id::text from public.admins limit 1))::text,
    true
  ) as claims
) s,
lateral (
  select count(*)::integer as admin_rows
  from public.list_admin_meetup_availability()
) f;
