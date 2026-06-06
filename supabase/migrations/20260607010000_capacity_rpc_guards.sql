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
  if char_length(v_name) not between 1 and 80 then
    raise exception 'applicant name must be between 1 and 80 characters';
  end if;

  if char_length(v_interest) not between 1 and 500 then
    raise exception 'interest must be between 1 and 500 characters';
  end if;

  perform public.expire_stale_pending_orders(100);

  v_meetup := public.assert_meetup_can_register(p_meetup_id);

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

  perform public.expire_stale_pending_orders(100);

  v_meetup := public.assert_meetup_can_register(p_meetup_id);

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
    expires_at,
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
    case when v_action = 'toss_order' then now() + interval '30 minutes' else null end,
    case when v_action = 'toss_order' then 'toss-test-edge' else 'github-pages-demo-edge' end
  )
  returning * into v_order;

  return jsonb_build_object('order', to_jsonb(v_order) - 'checkout_token');
end;
$$;

revoke all on function public.create_public_order(text, text, text, text, text, text, text) from public;
grant execute on function public.create_public_order(text, text, text, text, text, text, text) to service_role;

create or replace function public.confirm_toss_payment_order(
  p_order_id uuid,
  p_payment_method text,
  p_provider_payment_key text,
  p_paid_at timestamptz,
  p_raw_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_provider_payment_key is null or char_length(trim(p_provider_payment_key)) = 0 then
    raise exception 'provider payment key is required';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found';
  end if;

  if v_order.provider <> 'tosspayments' then
    raise exception 'order provider is not Toss Payments';
  end if;

  if v_order.status not in ('pending', 'paid') then
    raise exception 'order status is not confirmable: %', v_order.status;
  end if;

  if v_order.status = 'pending' and v_order.expires_at <= now() then
    raise exception 'ORDER_EXPIRED';
  end if;

  if v_order.status = 'pending' then
    update public.orders
    set
      status = 'paid',
      payment_method = coalesce(nullif(trim(p_payment_method), ''), payment_method)
    where id = p_order_id
    returning * into v_order;
  end if;

  select *
  into v_payment
  from public.payments
  where provider_payment_key = p_provider_payment_key
  limit 1;

  if found and v_payment.order_id <> v_order.id then
    raise exception 'provider payment key is already linked to another order';
  end if;

  if not found then
    begin
      insert into public.payments (
        order_id,
        meetup_id,
        amount,
        currency,
        status,
        provider,
        payment_method,
        provider_payment_key,
        paid_at,
        raw_payload
      )
      values (
        v_order.id,
        v_order.meetup_id,
        v_order.amount,
        v_order.currency,
        'paid',
        'tosspayments',
        coalesce(nullif(trim(p_payment_method), ''), v_order.payment_method, '토스페이먼츠'),
        p_provider_payment_key,
        coalesce(p_paid_at, now()),
        coalesce(p_raw_payload, '{}'::jsonb)
      )
      returning * into v_payment;
    exception when unique_violation then
      select *
      into v_payment
      from public.payments
      where provider_payment_key = p_provider_payment_key
      limit 1;

      if not found then
        raise exception 'payment record was not found after duplicate key conflict';
      end if;

      if found and v_payment.order_id <> v_order.id then
        raise exception 'provider payment key is already linked to another order';
      end if;
    end;
  end if;

  return jsonb_build_object(
    'order',
    to_jsonb(v_order) - 'checkout_token',
    'payment',
    to_jsonb(v_payment) - 'raw_payload'
  );
end;
$$;

revoke all on function public.confirm_toss_payment_order(uuid, text, text, timestamptz, jsonb) from public;
grant execute on function public.confirm_toss_payment_order(uuid, text, text, timestamptz, jsonb) to service_role;
