-- moin capacity / remaining-spots smoke test
--
-- Run this only after applying:
-- 1. supabase/migrations/20260607000000_capacity_remaining_spots.sql
-- 2. supabase/migrations/20260607010000_capacity_rpc_guards.sql
-- 3. supabase/migrations/20260607020000_capacity_read_contract.sql
--
-- The script runs inside one transaction and ends with ROLLBACK, so test rows
-- should not remain in the live project when the whole script succeeds.

begin;

delete from public.payments
where meetup_id in (
  '__capacity_smoke_unlimited__',
  '__capacity_smoke_one__',
  '__capacity_smoke_closed__'
);

delete from public.orders
where meetup_id in (
  '__capacity_smoke_unlimited__',
  '__capacity_smoke_one__',
  '__capacity_smoke_closed__'
);

delete from public.applications
where meetup_id in (
  '__capacity_smoke_unlimited__',
  '__capacity_smoke_one__',
  '__capacity_smoke_closed__'
);

delete from public.meetups
where id in (
  '__capacity_smoke_unlimited__',
  '__capacity_smoke_one__',
  '__capacity_smoke_closed__'
);

insert into public.meetups (
  id,
  type,
  category,
  title,
  description,
  host_name,
  host_role,
  status_label,
  date_label,
  time_label,
  location,
  price_amount,
  price_label,
  tags,
  image_url,
  schedule,
  is_published,
  capacity,
  registration_status
) values
(
  '__capacity_smoke_unlimited__',
  'regular',
  'smoke',
  'Capacity smoke unlimited',
  'Temporary smoke-test meetup.',
  'Smoke Tester',
  'QA',
  'TEST',
  '2099-01-01',
  '00:00',
  'Test Lab',
  1000,
  '1,000원',
  array['smoke'],
  'https://example.com/smoke.jpg',
  array['smoke'],
  true,
  null,
  'open'
),
(
  '__capacity_smoke_one__',
  'regular',
  'smoke',
  'Capacity smoke one seat',
  'Temporary smoke-test meetup.',
  'Smoke Tester',
  'QA',
  'TEST',
  '2099-01-01',
  '00:00',
  'Test Lab',
  1000,
  '1,000원',
  array['smoke'],
  'https://example.com/smoke.jpg',
  array['smoke'],
  true,
  1,
  'open'
),
(
  '__capacity_smoke_closed__',
  'regular',
  'smoke',
  'Capacity smoke closed',
  'Temporary smoke-test meetup.',
  'Smoke Tester',
  'QA',
  'TEST',
  '2099-01-01',
  '00:00',
  'Test Lab',
  1000,
  '1,000원',
  array['smoke'],
  'https://example.com/smoke.jpg',
  array['smoke'],
  true,
  10,
  'closed'
);

do $$
declare
  v_snapshot jsonb;
  v_public_status text;
  v_active_order_id uuid;
  v_order_id uuid;
  v_expired_count integer;
begin
  perform public.create_public_application(
    repeat('a', 32),
    '__capacity_smoke_unlimited__',
    'Unlimited Tester',
    'Smoke test application'
  );

  perform public.create_public_order(
    repeat('b', 32),
    'toss_order',
    '__capacity_smoke_unlimited__',
    'Unlimited Buyer',
    '카드',
    'capacity-smoke-unlimited-order',
    repeat('c', 32)
  );

  if not exists (
    select 1
    from public.orders
    where provider_order_id = 'capacity-smoke-unlimited-order'
      and status = 'pending'
      and expires_at > now()
  ) then
    raise exception 'expected Toss pending order with a future expires_at';
  end if;

  select id
  into v_active_order_id
  from public.orders
  where provider_order_id = 'capacity-smoke-unlimited-order';

  if exists (
    select 1
    from public.orders
    where meetup_id in (
      '__capacity_smoke_unlimited__',
      '__capacity_smoke_one__',
      '__capacity_smoke_closed__'
    )
      and provider = 'tosspayments'
      and status = 'pending'
      and expires_at is null
  ) then
    raise exception 'expected no pending Toss smoke orders with null expires_at';
  end if;

  perform public.confirm_toss_payment_order(
    v_active_order_id,
    '카드',
    'capacity-smoke-active-payment-key',
    now(),
    '{}'::jsonb
  );

  if not exists (
    select 1
    from public.orders
    where id = v_active_order_id
      and status = 'paid'
  ) then
    raise exception 'expected non-expired Toss pending order to become paid';
  end if;

  if not exists (
    select 1
    from public.payments
    where order_id = v_active_order_id
      and provider_payment_key = 'capacity-smoke-active-payment-key'
      and status = 'paid'
  ) then
    raise exception 'expected payment row for confirmed non-expired Toss order';
  end if;

  perform public.create_public_order(
    repeat('d', 32),
    'demo_order',
    '__capacity_smoke_one__',
    'First Buyer',
    '데모',
    null,
    null
  );

  v_snapshot := public.get_meetup_seat_snapshot('__capacity_smoke_one__');

  if v_snapshot->>'effective_registration_status' <> 'sold_out'
    or (v_snapshot->>'remaining_spots')::integer <> 0 then
    raise exception 'expected one-seat meetup to be sold out, got %', v_snapshot;
  end if;

  select effective_registration_status
  into v_public_status
  from public.list_public_meetup_availability()
  where meetup_id = '__capacity_smoke_one__';

  if v_public_status <> 'sold_out' then
    raise exception 'expected public availability read contract to return sold_out, got %', v_public_status;
  end if;

  begin
    perform public.create_public_order(
      repeat('e', 32),
      'demo_order',
      '__capacity_smoke_one__',
      'Second Buyer',
      '데모',
      null,
      null
    );
    raise exception 'expected MEETUP_SOLD_OUT';
  exception when others then
    if sqlerrm not like '%MEETUP_SOLD_OUT%' then
      raise;
    end if;
  end;

  begin
    perform public.create_public_application(
      repeat('h', 32),
      '__capacity_smoke_one__',
      'Sold Out Applicant',
      'Smoke test sold-out application'
    );
    raise exception 'expected MEETUP_SOLD_OUT for application';
  exception when others then
    if sqlerrm not like '%MEETUP_SOLD_OUT%' then
      raise;
    end if;
  end;

  begin
    perform public.create_public_application(
      repeat('f', 32),
      '__capacity_smoke_closed__',
      'Closed Tester',
      'Smoke test closed meetup'
    );
    raise exception 'expected MEETUP_REGISTRATION_CLOSED';
  exception when others then
    if sqlerrm not like '%MEETUP_REGISTRATION_CLOSED%' then
      raise;
    end if;
  end;

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
    expires_at,
    source
  ) values (
    '__capacity_smoke_one__',
    'Expired Buyer',
    1000,
    'KRW',
    'pending',
    'tosspayments',
    '카드',
    'capacity-smoke-expired-order',
    repeat('g', 32),
    now() - interval '1 minute',
    'capacity-smoke'
  )
  returning id into v_order_id;

  begin
    perform public.confirm_toss_payment_order(
      v_order_id,
      '카드',
      'capacity-smoke-expired-payment-key',
      now(),
      '{}'::jsonb
    );
    raise exception 'expected ORDER_EXPIRED';
  exception when others then
    if sqlerrm not like '%ORDER_EXPIRED%' then
      raise;
    end if;
  end;

  v_expired_count := public.expire_stale_pending_orders(10000);

  if v_expired_count < 1 then
    raise exception 'expected at least one stale pending order to expire';
  end if;

  if not exists (
    select 1
    from public.orders
    where id = v_order_id
      and status = 'failed'
  ) then
    raise exception 'expected the smoke expired pending order to be marked failed';
  end if;
end;
$$;

rollback;
