-- Fix: list_admin_meetup_availability raised 42702 "column reference \"meetup_id\"
-- is ambiguous" at runtime. The function is `language plpgsql`, so the OUT column
-- `meetup_id` declared in RETURNS TABLE shadows the bare `meetup_id` used in the
-- guest_counts CTE introduced by 20260624000000. The sibling order_counts CTE
-- already qualifies its column (orders.meetup_id); the guest CTE must do the same.
--
-- Only this one function is affected: list_public_meetup_availability is
-- `language sql` (no plpgsql variable shadowing), and get_meetup_seat_snapshot /
-- assert_meetup_can_register reference the column as `meetup_id = v_meetup.id`
-- against a single table (param is p_meetup_id), so they are unambiguous.
--
-- Same signature as the current definition, so `create or replace` is valid
-- (no return-type change, no DROP needed).

create or replace function public.list_admin_meetup_availability()
returns table (
  meetup_id text,
  capacity integer,
  paid_order_count integer,
  pending_order_count integer,
  active_order_count integer,
  manual_guest_count integer,
  remaining_spots integer,
  registration_status text,
  effective_registration_status text,
  can_register boolean,
  closed_at timestamptz,
  close_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
  with order_counts as (
    select
      orders.meetup_id,
      count(*) filter (where orders.status in ('paid', 'demo_paid'))::integer as paid_order_count,
      count(*) filter (
        where orders.status = 'pending'
          and orders.expires_at > now()
      )::integer as pending_order_count
    from public.orders
    group by orders.meetup_id
  ),
  guest_counts as (
    select meetup_guests.meetup_id, count(*)::integer as manual_guest_count
    from public.meetup_guests
    group by meetup_guests.meetup_id
  ),
  availability as (
    select
      meetups.id as meetup_id,
      meetups.capacity,
      coalesce(order_counts.paid_order_count, 0)::integer as paid_order_count,
      coalesce(order_counts.pending_order_count, 0)::integer as pending_order_count,
      (
        coalesce(order_counts.paid_order_count, 0)
        + coalesce(order_counts.pending_order_count, 0)
      )::integer as active_order_count,
      coalesce(guest_counts.manual_guest_count, 0)::integer as manual_guest_count,
      meetups.registration_status,
      meetups.closed_at,
      meetups.close_reason
    from public.meetups
    left join order_counts on order_counts.meetup_id = meetups.id
    left join guest_counts on guest_counts.meetup_id = meetups.id
  )
  select
    availability.meetup_id,
    availability.capacity,
    availability.paid_order_count,
    availability.pending_order_count,
    availability.active_order_count,
    availability.manual_guest_count,
    case
      when availability.capacity is null then null
      else greatest(
        availability.capacity
          - availability.active_order_count
          - availability.manual_guest_count,
        0
      )::integer
    end as remaining_spots,
    availability.registration_status,
    case
      when availability.registration_status = 'closed' then 'closed'
      when availability.capacity is not null
        and (availability.active_order_count + availability.manual_guest_count) >= availability.capacity then 'sold_out'
      else 'open'
    end as effective_registration_status,
    (
      availability.registration_status = 'open'
      and (
        availability.capacity is null
        or (availability.active_order_count + availability.manual_guest_count) < availability.capacity
      )
    ) as can_register,
    availability.closed_at,
    availability.close_reason
  from availability;
end;
$$;
