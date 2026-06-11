-- Require application tokens for public orders, phase 2 of 2 (lock).
-- The deployed frontend always sends an application token with checkout
-- requests, so tokenless public orders are no longer accepted:
-- create_public_order now raises APPLICATION_REQUIRED when the token is
-- missing. The partial unique index below converts a concurrent
-- double-confirm race into a visible unique-violation failure instead of a
-- silent double charge.

create unique index if not exists orders_single_paid_per_application_idx
on public.orders(application_id)
where application_id is not null
  and status in ('paid', 'demo_paid');

create or replace function public.create_public_order(
  p_visitor_hash text,
  p_action text,
  p_meetup_id text,
  p_buyer_name text,
  p_payment_method text,
  p_provider_order_id text default null,
  p_checkout_token text default null,
  p_application_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups%rowtype;
  v_order public.orders%rowtype;
  v_application public.applications%rowtype;
  v_action text := trim(coalesce(p_action, ''));
  v_buyer_name text := nullif(trim(coalesce(p_buyer_name, '')), '');
  v_payment_method text := nullif(trim(coalesce(p_payment_method, '')), '');
  v_provider_order_id text := nullif(trim(coalesce(p_provider_order_id, '')), '');
  v_checkout_token text := nullif(trim(coalesce(p_checkout_token, '')), '');
  v_application_token text := nullif(trim(coalesce(p_application_token, '')), '');
begin
  if v_action not in ('toss_order', 'demo_order') then
    raise exception 'unsupported public order action';
  end if;

  if v_application_token is null then
    raise exception 'APPLICATION_REQUIRED';
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

  if v_application_token is not null then
    select *
    into v_application
    from public.applications
    where confirmation_token = v_application_token
    for update;

    if not found then
      raise exception 'APPLICATION_NOT_FOUND';
    end if;

    if v_application.meetup_id <> trim(coalesce(p_meetup_id, '')) then
      raise exception 'APPLICATION_MEETUP_MISMATCH';
    end if;

    if v_application.status in ('rejected', 'cancelled') then
      raise exception 'APPLICATION_NOT_PAYABLE';
    end if;

    perform 1
    from public.orders
    where application_id = v_application.id
      and status in ('paid', 'demo_paid');

    if found then
      raise exception 'APPLICATION_ALREADY_PAID';
    end if;
  end if;

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
    application_id,
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
    v_application.id,
    case when v_action = 'toss_order' then 'toss-test-edge' else 'github-pages-demo-edge' end
  )
  returning * into v_order;

  if v_action = 'demo_order' and v_application.id is not null then
    update public.applications
    set status = 'accepted'
    where id = v_application.id
      and status in ('submitted', 'reviewing');
  end if;

  return jsonb_build_object('order', to_jsonb(v_order) - 'checkout_token');
end;
$$;

revoke all on function public.create_public_order(text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_public_order(text, text, text, text, text, text, text, text) to service_role;
