-- Paid orders are locked against manual status changes, so refunds need a
-- dedicated path: the admin-verified edge function cancels the capture at
-- Toss, then this RPC atomically marks the order refunded and records the
-- refund on the payment row. Seats free up automatically because seat
-- counting only looks at ('paid', 'demo_paid'), and the application link
-- stays intact for audit.

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'demo_paid', 'paid', 'cancelled', 'failed', 'refunded'));

create or replace function public.refund_paid_order(
  p_order_id uuid,
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
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND: no order for id';
  end if;

  if v_order.status not in ('paid', 'demo_paid') then
    raise exception 'ORDER_NOT_REFUNDABLE: order status is %', v_order.status;
  end if;

  update public.orders
  set status = 'refunded'
  where id = v_order.id
  returning * into v_order;

  update public.payments
  set status = 'refunded',
      raw_payload = coalesce(raw_payload, '{}'::jsonb) || jsonb_build_object('refund', p_raw_payload)
  where order_id = v_order.id
    and status = 'paid'
  returning * into v_payment;

  if v_payment.id is null then
    -- Demo orders (and the paid-without-record anomaly) have no payment row;
    -- insert one so the refund still leaves an audit trail.
    insert into public.payments (
      order_id,
      meetup_id,
      amount,
      currency,
      status,
      provider,
      payment_method,
      raw_payload
    )
    values (
      v_order.id,
      v_order.meetup_id,
      v_order.amount,
      v_order.currency,
      'refunded',
      v_order.provider,
      v_order.payment_method,
      jsonb_build_object('refund', p_raw_payload)
    )
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order) - 'checkout_token',
    'payment', to_jsonb(v_payment)
  );
end;
$$;

revoke all on function public.refund_paid_order(uuid, jsonb) from public;
grant execute on function public.refund_paid_order(uuid, jsonb) to service_role;
