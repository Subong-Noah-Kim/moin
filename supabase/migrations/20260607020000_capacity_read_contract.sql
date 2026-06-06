create or replace function public.list_public_meetup_availability()
returns table (
  meetup_id text,
  capacity integer,
  remaining_spots integer,
  effective_registration_status text,
  can_register boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with active_order_counts as (
    select
      orders.meetup_id,
      count(*)::integer as active_order_count
    from public.orders
    where orders.status in ('paid', 'demo_paid')
      or (
        orders.status = 'pending'
        and orders.expires_at > now()
      )
    group by orders.meetup_id
  ),
  availability as (
    select
      meetups.id as meetup_id,
      meetups.capacity,
      coalesce(active_order_counts.active_order_count, 0)::integer as active_order_count,
      case
        when meetups.capacity is null then null
        else greatest(meetups.capacity - coalesce(active_order_counts.active_order_count, 0), 0)::integer
      end as remaining_spots,
      meetups.registration_status,
      case
        when meetups.registration_status = 'closed' then 'closed'
        when meetups.capacity is not null
          and coalesce(active_order_counts.active_order_count, 0) >= meetups.capacity then 'sold_out'
        else 'open'
      end as effective_registration_status
    from public.meetups
    left join active_order_counts on active_order_counts.meetup_id = meetups.id
    where meetups.is_published = true
  )
  select
    availability.meetup_id,
    availability.capacity,
    availability.remaining_spots,
    availability.effective_registration_status,
    availability.effective_registration_status = 'open' as can_register
  from availability;
$$;

revoke all on function public.list_public_meetup_availability() from public;
grant execute on function public.list_public_meetup_availability() to anon;
grant execute on function public.list_public_meetup_availability() to authenticated;
grant execute on function public.list_public_meetup_availability() to service_role;

revoke select on public.meetups from anon;
grant select (
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
  schedule
) on public.meetups to anon;

create or replace function public.list_admin_meetup_availability()
returns table (
  meetup_id text,
  capacity integer,
  paid_order_count integer,
  pending_order_count integer,
  active_order_count integer,
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
      meetups.registration_status,
      meetups.closed_at,
      meetups.close_reason
    from public.meetups
    left join order_counts on order_counts.meetup_id = meetups.id
  )
  select
    availability.meetup_id,
    availability.capacity,
    availability.paid_order_count,
    availability.pending_order_count,
    availability.active_order_count,
    case
      when availability.capacity is null then null
      else greatest(availability.capacity - availability.active_order_count, 0)::integer
    end as remaining_spots,
    availability.registration_status,
    case
      when availability.registration_status = 'closed' then 'closed'
      when availability.capacity is not null
        and availability.active_order_count >= availability.capacity then 'sold_out'
      else 'open'
    end as effective_registration_status,
    (
      availability.registration_status = 'open'
      and (
        availability.capacity is null
        or availability.active_order_count < availability.capacity
      )
    ) as can_register,
    availability.closed_at,
    availability.close_reason
  from availability;
end;
$$;

revoke all on function public.list_admin_meetup_availability() from public;
grant execute on function public.list_admin_meetup_availability() to authenticated;
grant execute on function public.list_admin_meetup_availability() to service_role;
