alter table public.orders
add column if not exists checkout_token text;

grant select on public.meetups to service_role;
grant select, update on public.orders to service_role;
grant select, insert on public.payments to service_role;

drop policy if exists "visitors can create demo orders" on public.orders;
drop policy if exists "visitors can create limited orders" on public.orders;
create policy "visitors can create limited orders"
on public.orders
for insert
to anon
with check (
  amount = coalesce(
    (
      select price_amount
      from public.meetups
      where id = meetup_id
        and is_published = true
    ),
    -1
  )
  and currency = 'KRW'
  and (
    (
      status = 'pending'
      and provider = 'tosspayments'
      and source = 'toss-test'
      and provider_order_id is not null
      and char_length(provider_order_id) between 8 and 120
      and checkout_token is not null
      and char_length(checkout_token) between 32 and 128
    )
    or (
      status = 'demo_paid'
      and provider = 'demo'
      and source = 'github-pages-demo'
      and provider_order_id is null
      and checkout_token is null
    )
  )
);

drop policy if exists "admins can update order status" on public.orders;
create policy "admins can update order status"
on public.orders
for update
to authenticated
using (public.is_admin())
with check (
  public.is_admin()
  and status in ('pending', 'cancelled', 'failed')
);

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
