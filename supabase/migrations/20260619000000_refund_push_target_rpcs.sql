-- service_role has no direct SELECT/DELETE grants on applications or
-- push_subscriptions (locked down deliberately), so the refund push lookup
-- returned 403 and expired-subscription pruning silently failed. Route both
-- through security-definer RPCs like every other server-side flow.

create or replace function public.get_refund_push_targets(
  p_application_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications%rowtype;
  v_meetup_title text;
  v_subscriptions jsonb;
begin
  select *
  into v_application
  from public.applications
  where id = p_application_id;

  if v_application.id is null then
    return jsonb_build_object('found', false, 'subscriptions', '[]'::jsonb);
  end if;

  select title into v_meetup_title
  from public.meetups
  where id = v_application.meetup_id;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', s.id,
      'endpoint', s.endpoint,
      'p256dh', s.p256dh,
      'auth', s.auth
    )),
    '[]'::jsonb
  ) into v_subscriptions
  from public.push_subscriptions s
  where s.application_id = v_application.id;

  return jsonb_build_object(
    'found', true,
    'meetup_title', coalesce(v_meetup_title, '모임'),
    'subscriptions', v_subscriptions
  );
end;
$$;

revoke all on function public.get_refund_push_targets(uuid) from public;
grant execute on function public.get_refund_push_targets(uuid) to service_role;

create or replace function public.delete_push_subscription(
  p_subscription_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_subscriptions
  where id = p_subscription_id;
end;
$$;

revoke all on function public.delete_push_subscription(uuid) from public;
grant execute on function public.delete_push_subscription(uuid) to service_role;
