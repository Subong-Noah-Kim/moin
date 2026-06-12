-- A device endpoint used to be globally unique, so opting into a second
-- meetup repointed the device's single subscription row and earlier
-- applications silently lost their approval/refund notifications. Make
-- subscriptions unique per (endpoint, application) so one device receives
-- pushes for every application it opted into.

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_application_key
  unique (endpoint, application_id);

create or replace function public.register_push_subscription(
  p_visitor_hash text,
  p_application_token text,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications%rowtype;
  v_subscription public.push_subscriptions%rowtype;
  v_token text := trim(coalesce(p_application_token, ''));
  v_endpoint text := trim(coalesce(p_endpoint, ''));
  v_p256dh text := trim(coalesce(p_p256dh, ''));
  v_auth text := trim(coalesce(p_auth, ''));
begin
  if char_length(v_token) not between 32 and 128 then
    raise exception 'APPLICATION_NOT_FOUND: invalid application token';
  end if;

  if char_length(v_endpoint) not between 1 and 2000
    or char_length(v_p256dh) not between 1 and 500
    or char_length(v_auth) not between 1 and 500 then
    raise exception 'push subscription payload is invalid';
  end if;

  select * into v_application
  from public.applications
  where confirmation_token = v_token
    and status not in ('rejected', 'cancelled');

  if v_application.id is null then
    raise exception 'APPLICATION_NOT_FOUND: no application for token';
  end if;

  perform public.assert_public_submission_rate_limit(
    trim(p_visitor_hash),
    'push_subscription',
    v_application.meetup_id,
    30,
    interval '10 minutes',
    5,
    interval '10 minutes'
  );

  insert into public.push_subscriptions (application_id, endpoint, p256dh, auth)
  values (v_application.id, v_endpoint, v_p256dh, v_auth)
  on conflict (endpoint, application_id) do update
  set p256dh = excluded.p256dh,
      auth = excluded.auth
  returning * into v_subscription;

  return jsonb_build_object(
    'subscription',
    jsonb_build_object('id', v_subscription.id, 'application_id', v_subscription.application_id)
  );
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text, text) from public;
grant execute on function public.register_push_subscription(text, text, text, text, text) to service_role;
