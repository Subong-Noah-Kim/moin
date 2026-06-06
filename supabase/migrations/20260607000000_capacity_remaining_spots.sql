alter table public.meetups
add column if not exists capacity integer,
add column if not exists registration_status text not null default 'open',
add column if not exists closed_at timestamptz,
add column if not exists close_reason text;

alter table public.meetups
drop constraint if exists meetups_capacity_positive;

alter table public.meetups
add constraint meetups_capacity_positive
check (capacity is null or capacity > 0);

alter table public.meetups
drop constraint if exists meetups_registration_status_check;

alter table public.meetups
add constraint meetups_registration_status_check
check (registration_status in ('open', 'closed'));

alter table public.orders
add column if not exists expires_at timestamptz;

update public.orders
set expires_at = created_at + interval '30 minutes'
where status = 'pending'
  and provider = 'tosspayments'
  and expires_at is null;

create index if not exists orders_active_seat_holds_idx
on public.orders(meetup_id, status, expires_at)
where status in ('pending', 'paid', 'demo_paid');

create or replace function public.get_meetup_seat_snapshot(
  p_meetup_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups%rowtype;
  v_active_order_count integer;
  v_effective_registration_status text;
  v_remaining_spots integer;
begin
  select *
  into v_meetup
  from public.meetups
  where id = p_meetup_id
  limit 1;

  if not found then
    raise exception 'MEETUP_NOT_FOUND';
  end if;

  select count(*)::integer
  into v_active_order_count
  from public.orders
  where meetup_id = v_meetup.id
    and (
      status in ('paid', 'demo_paid')
      or (
        status = 'pending'
        and expires_at > now()
      )
    );

  if v_meetup.capacity is null then
    v_remaining_spots := null;
  else
    v_remaining_spots := greatest(v_meetup.capacity - v_active_order_count, 0);
  end if;

  if v_meetup.registration_status = 'closed' then
    v_effective_registration_status := 'closed';
  elsif v_meetup.capacity is not null and v_active_order_count >= v_meetup.capacity then
    v_effective_registration_status := 'sold_out';
  else
    v_effective_registration_status := 'open';
  end if;

  return jsonb_build_object(
    'meetup_id', v_meetup.id,
    'capacity', v_meetup.capacity,
    'active_order_count', v_active_order_count,
    'remaining_spots', v_remaining_spots,
    'registration_status', v_meetup.registration_status,
    'effective_registration_status', v_effective_registration_status,
    'closed_at', v_meetup.closed_at,
    'close_reason', v_meetup.close_reason
  );
end;
$$;

revoke all on function public.get_meetup_seat_snapshot(text) from public;
grant execute on function public.get_meetup_seat_snapshot(text) to service_role;

create or replace function public.assert_meetup_can_register(
  p_meetup_id text
)
returns public.meetups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups%rowtype;
  v_active_order_count integer;
begin
  select *
  into v_meetup
  from public.meetups
  where id = p_meetup_id
    and is_published = true
  for update;

  if not found then
    raise exception 'MEETUP_NOT_FOUND';
  end if;

  if v_meetup.registration_status = 'closed' then
    raise exception 'MEETUP_REGISTRATION_CLOSED';
  end if;

  select count(*)::integer
  into v_active_order_count
  from public.orders
  where meetup_id = v_meetup.id
    and (
      status in ('paid', 'demo_paid')
      or (
        status = 'pending'
        and expires_at > now()
      )
    );

  if v_meetup.capacity is not null and v_active_order_count >= v_meetup.capacity then
    raise exception 'MEETUP_SOLD_OUT';
  end if;

  return v_meetup;
end;
$$;

revoke all on function public.assert_meetup_can_register(text) from public;
grant execute on function public.assert_meetup_can_register(text) to service_role;

create or replace function public.expire_stale_pending_orders(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_count integer;
begin
  with stale_orders as (
    select id
    from public.orders
    where status = 'pending'
      and provider = 'tosspayments'
      and expires_at <= now()
    order by expires_at asc
    limit greatest(coalesce(p_limit, 100), 0)
    for update skip locked
  ),
  expired_orders as (
    update public.orders
    set status = 'failed'
    where id in (select id from stale_orders)
    returning id
  )
  select count(*)::integer
  into v_expired_count
  from expired_orders;

  return v_expired_count;
end;
$$;

revoke all on function public.expire_stale_pending_orders(integer) from public;
grant execute on function public.expire_stale_pending_orders(integer) to service_role;
