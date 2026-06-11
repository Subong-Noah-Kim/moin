-- Approval push notifications.
-- push_subscriptions stores Web Push subscriptions linked to applications via
-- the existing confirmation token idiom. claim_approval_push atomically marks
-- an accepted application as notified and returns its subscriptions, so no
-- call pattern (double click, retry, third-party spam) can exceed one send
-- per approved application.

alter table public.applications
add column if not exists approval_notified_at timestamptz;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_length check (char_length(endpoint) between 1 and 2000),
  constraint push_subscriptions_p256dh_length check (char_length(p256dh) between 1 and 500),
  constraint push_subscriptions_auth_length check (char_length(auth) between 1 and 500)
);

create index if not exists push_subscriptions_application_id_idx
on public.push_subscriptions(application_id);

alter table public.push_subscriptions enable row level security;

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
  on conflict (endpoint) do update
  set application_id = excluded.application_id,
      p256dh = excluded.p256dh,
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

create or replace function public.claim_approval_push(
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
  update public.applications
  set approval_notified_at = now()
  where id = p_application_id
    and status = 'accepted'
    and approval_notified_at is null
  returning * into v_application;

  if v_application.id is null then
    return jsonb_build_object('claimed', false, 'subscriptions', '[]'::jsonb);
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
    'claimed', true,
    'meetup_title', coalesce(v_meetup_title, '모임'),
    'subscriptions', v_subscriptions
  );
end;
$$;

revoke all on function public.claim_approval_push(uuid) from public;
grant execute on function public.claim_approval_push(uuid) to service_role;
