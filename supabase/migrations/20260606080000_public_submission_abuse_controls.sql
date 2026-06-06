create table if not exists public.public_submission_attempts (
  id uuid primary key default gen_random_uuid(),
  visitor_hash text not null check (char_length(visitor_hash) between 32 and 128),
  action text not null check (action in ('application', 'toss_order', 'demo_order')),
  meetup_id text references public.meetups(id) on update cascade on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists public_submission_attempts_visitor_created_idx
on public.public_submission_attempts(visitor_hash, created_at desc);

create index if not exists public_submission_attempts_action_meetup_created_idx
on public.public_submission_attempts(visitor_hash, action, meetup_id, created_at desc);

alter table public.public_submission_attempts enable row level security;

grant usage on schema public to service_role;
grant select, insert, delete on public.public_submission_attempts to service_role;
grant select on public.meetups to service_role;
grant insert on public.applications to service_role;
grant insert on public.orders to service_role;

create or replace function public.assert_public_submission_rate_limit(
  p_visitor_hash text,
  p_action text,
  p_meetup_id text,
  p_global_limit integer,
  p_global_window interval,
  p_action_limit integer,
  p_action_window interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_global_count integer;
  v_action_count integer;
begin
  if p_visitor_hash is null or char_length(trim(p_visitor_hash)) < 32 then
    raise exception 'visitor hash is required';
  end if;

  if p_action not in ('application', 'toss_order', 'demo_order') then
    raise exception 'unsupported public submission action';
  end if;

  delete from public.public_submission_attempts
  where created_at < now() - interval '1 day';

  select count(*)
  into v_global_count
  from public.public_submission_attempts
  where visitor_hash = p_visitor_hash
    and created_at >= now() - p_global_window;

  if v_global_count >= p_global_limit then
    raise exception 'PUBLIC_SUBMISSION_RATE_LIMITED';
  end if;

  select count(*)
  into v_action_count
  from public.public_submission_attempts
  where visitor_hash = p_visitor_hash
    and action = p_action
    and meetup_id is not distinct from p_meetup_id
    and created_at >= now() - p_action_window;

  if v_action_count >= p_action_limit then
    raise exception 'PUBLIC_SUBMISSION_RATE_LIMITED';
  end if;

  insert into public.public_submission_attempts (
    visitor_hash,
    action,
    meetup_id
  ) values (
    p_visitor_hash,
    p_action,
    p_meetup_id
  );
end;
$$;

revoke all on function public.assert_public_submission_rate_limit(text, text, text, integer, interval, integer, interval) from public;
grant execute on function public.assert_public_submission_rate_limit(text, text, text, integer, interval, integer, interval) to service_role;

create or replace function public.create_public_application(
  p_visitor_hash text,
  p_meetup_id text,
  p_applicant_name text,
  p_interest text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups%rowtype;
  v_application public.applications%rowtype;
  v_name text := trim(coalesce(p_applicant_name, ''));
  v_interest text := trim(coalesce(p_interest, ''));
begin
  select *
  into v_meetup
  from public.meetups
  where id = p_meetup_id
    and is_published = true
  limit 1;

  if not found then
    raise exception 'published meetup was not found';
  end if;

  if char_length(v_name) not between 1 and 80 then
    raise exception 'applicant name must be between 1 and 80 characters';
  end if;

  if char_length(v_interest) not between 1 and 500 then
    raise exception 'interest must be between 1 and 500 characters';
  end if;

  perform public.assert_public_submission_rate_limit(
    trim(p_visitor_hash),
    'application',
    v_meetup.id,
    20,
    interval '10 minutes',
    2,
    interval '10 minutes'
  );

  insert into public.applications (
    meetup_id,
    applicant_name,
    interest,
    source
  ) values (
    v_meetup.id,
    v_name,
    v_interest,
    'edge-function'
  )
  returning * into v_application;

  return jsonb_build_object('application', to_jsonb(v_application));
end;
$$;

revoke all on function public.create_public_application(text, text, text, text) from public;
grant execute on function public.create_public_application(text, text, text, text) to service_role;

create or replace function public.create_public_order(
  p_visitor_hash text,
  p_action text,
  p_meetup_id text,
  p_buyer_name text,
  p_payment_method text,
  p_provider_order_id text default null,
  p_checkout_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups%rowtype;
  v_order public.orders%rowtype;
  v_action text := trim(coalesce(p_action, ''));
  v_buyer_name text := nullif(trim(coalesce(p_buyer_name, '')), '');
  v_payment_method text := nullif(trim(coalesce(p_payment_method, '')), '');
  v_provider_order_id text := nullif(trim(coalesce(p_provider_order_id, '')), '');
  v_checkout_token text := nullif(trim(coalesce(p_checkout_token, '')), '');
begin
  if v_action not in ('toss_order', 'demo_order') then
    raise exception 'unsupported public order action';
  end if;

  select *
  into v_meetup
  from public.meetups
  where id = p_meetup_id
    and is_published = true
  limit 1;

  if not found then
    raise exception 'published meetup was not found';
  end if;

  if v_buyer_name is not null and char_length(v_buyer_name) > 80 then
    raise exception 'buyer name must be 80 characters or shorter';
  end if;

  if v_payment_method is not null and char_length(v_payment_method) > 80 then
    raise exception 'payment method must be 80 characters or shorter';
  end if;

  if v_action = 'toss_order' then
    if v_provider_order_id is null or char_length(v_provider_order_id) not between 8 and 120 then
      raise exception 'provider order id is required';
    end if;

    if v_checkout_token is null or char_length(v_checkout_token) not between 32 and 128 then
      raise exception 'checkout token is required';
    end if;
  else
    v_provider_order_id := null;
    v_checkout_token := null;
  end if;

  perform public.assert_public_submission_rate_limit(
    trim(p_visitor_hash),
    v_action,
    v_meetup.id,
    20,
    interval '10 minutes',
    5,
    interval '5 minutes'
  );

  insert into public.orders (
    meetup_id,
    buyer_name,
    amount,
    currency,
    status,
    provider,
    payment_method,
    provider_order_id,
    checkout_token,
    source
  ) values (
    v_meetup.id,
    v_buyer_name,
    v_meetup.price_amount,
    'KRW',
    case when v_action = 'toss_order' then 'pending' else 'demo_paid' end,
    case when v_action = 'toss_order' then 'tosspayments' else 'demo' end,
    v_payment_method,
    v_provider_order_id,
    v_checkout_token,
    case when v_action = 'toss_order' then 'toss-test-edge' else 'github-pages-demo-edge' end
  )
  returning * into v_order;

  return jsonb_build_object('order', to_jsonb(v_order) - 'checkout_token');
end;
$$;

revoke all on function public.create_public_order(text, text, text, text, text, text, text) from public;
grant execute on function public.create_public_order(text, text, text, text, text, text, text) to service_role;
