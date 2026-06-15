-- Self-serve refund requests. A magic-link user can flag a paid order for
-- refund from their history page; the actual money movement stays admin-only
-- (the service-role Toss cancel in confirm-toss-payment). This RPC only records
-- the request, and only for orders that belong to the caller's verified email.

alter table public.orders
  add column if not exists refund_requested_at timestamptz;

alter table public.orders
  add column if not exists refund_request_reason text;

create or replace function public.request_order_refund(
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_order public.orders%rowtype;
  v_application public.applications%rowtype;
begin
  if v_email = '' then
    raise exception 'EMAIL_SESSION_REQUIRED: no verified email in session';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  -- Verify ownership through the linked application's email. A mismatch is
  -- reported as not-found so the endpoint never confirms another user's order.
  if v_order.id is not null and v_order.application_id is not null then
    select * into v_application
    from public.applications
    where id = v_order.application_id;
  end if;

  if v_order.id is null
    or v_application.id is null
    or v_application.applicant_email is null
    or lower(v_application.applicant_email) <> v_email then
    raise exception 'ORDER_NOT_FOUND: no order for this account';
  end if;

  if v_order.status not in ('paid', 'demo_paid') then
    raise exception 'ORDER_NOT_REFUNDABLE: order status is %', v_order.status;
  end if;

  if v_order.refund_requested_at is not null then
    return jsonb_build_object('alreadyRequested', true);
  end if;

  update public.orders
  set refund_requested_at = now(),
      refund_request_reason = nullif(left(trim(coalesce(p_reason, '')), 500), '')
  where id = v_order.id;

  return jsonb_build_object('requested', true);
end;
$$;

revoke all on function public.request_order_refund(uuid, text) from public;
grant execute on function public.request_order_refund(uuid, text) to authenticated;

-- Recreate the history payload to expose the order id and refund-request flag
-- so the page can render the request button / "requested" state.
create or replace function public.get_my_history()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_items jsonb;
begin
  if v_email = '' then
    raise exception 'EMAIL_SESSION_REQUIRED: no verified email in session';
  end if;

  select coalesce(jsonb_agg(item order by item -> 'application' ->> 'created_at' desc), '[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'application', jsonb_build_object(
        'id', a.id,
        'meetup_id', a.meetup_id,
        'meetup_title', coalesce(m.title, a.meetup_id),
        'applicant_name', a.applicant_name,
        'status', a.status,
        'created_at', a.created_at
      ),
      'orders', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', o.id,
          'status', o.status,
          'amount', o.amount,
          'created_at', o.created_at,
          'refund_requested_at', o.refund_requested_at
        ) order by o.created_at desc)
        from public.orders o
        where o.application_id = a.id
      ), '[]'::jsonb)
    ) as item
    from public.applications a
    left join public.meetups m on m.id = a.meetup_id
    where a.applicant_email is not null
      and lower(a.applicant_email) = v_email
  ) ranked;

  return jsonb_build_object('email', v_email, 'items', v_items);
end;
$$;

revoke all on function public.get_my_history() from public;
grant execute on function public.get_my_history() to authenticated;
