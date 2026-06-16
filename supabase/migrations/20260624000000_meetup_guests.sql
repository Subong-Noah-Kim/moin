-- Named virtual guests: an admin can add guests who hold a seat without a real
-- order (offline/invited attendees). One row = one held seat. Names are
-- admin-only (RLS); the security-definer seat functions count guests so the
-- public only ever sees the reduced remaining number.

create table if not exists public.meetup_guests (
  id uuid primary key default gen_random_uuid(),
  meetup_id text not null references public.meetups(id) on delete cascade,
  name text not null,
  memo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint meetup_guests_name_length check (char_length(trim(name)) between 1 and 80),
  constraint meetup_guests_memo_length check (memo is null or char_length(memo) <= 200)
);

create index if not exists meetup_guests_meetup_id_idx on public.meetup_guests(meetup_id);

alter table public.meetup_guests enable row level security;

grant select, insert, delete on public.meetup_guests to authenticated;

drop policy if exists "admins read meetup guests" on public.meetup_guests;
create policy "admins read meetup guests"
on public.meetup_guests
for select to authenticated
using (public.is_admin());

drop policy if exists "admins add meetup guests" on public.meetup_guests;
create policy "admins add meetup guests"
on public.meetup_guests
for insert to authenticated
with check (public.is_admin());

drop policy if exists "admins delete meetup guests" on public.meetup_guests;
create policy "admins delete meetup guests"
on public.meetup_guests
for delete to authenticated
using (public.is_admin());

-- Public availability: subtract guests from remaining; guests count toward
-- sold_out. The RETURNS TABLE signature is unchanged (no guest column is
-- exposed publicly).
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
  guest_counts as (
    select meetup_id, count(*)::integer as manual_guest_count
    from public.meetup_guests
    group by meetup_id
  ),
  availability as (
    select
      meetups.id as meetup_id,
      meetups.capacity,
      coalesce(active_order_counts.active_order_count, 0)::integer as active_order_count,
      coalesce(guest_counts.manual_guest_count, 0)::integer as manual_guest_count,
      case
        when meetups.capacity is null then null
        else greatest(
          meetups.capacity
            - coalesce(active_order_counts.active_order_count, 0)
            - coalesce(guest_counts.manual_guest_count, 0),
          0
        )::integer
      end as remaining_spots,
      meetups.registration_status,
      case
        when meetups.registration_status = 'closed' then 'closed'
        when meetups.capacity is not null
          and (
            coalesce(active_order_counts.active_order_count, 0)
            + coalesce(guest_counts.manual_guest_count, 0)
          ) >= meetups.capacity then 'sold_out'
        else 'open'
      end as effective_registration_status
    from public.meetups
    left join active_order_counts on active_order_counts.meetup_id = meetups.id
    left join guest_counts on guest_counts.meetup_id = meetups.id
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

grant execute on function public.list_public_meetup_availability() to anon;
grant execute on function public.list_public_meetup_availability() to authenticated;
grant execute on function public.list_public_meetup_availability() to service_role;

-- Admin availability: same fold-in, plus manual_guest_count in the result for
-- the operator breakdown. The return type gains a column, so drop first
-- (create or replace cannot change an existing function's RETURNS TABLE).
drop function if exists public.list_admin_meetup_availability();
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
    select meetup_id, count(*)::integer as manual_guest_count
    from public.meetup_guests
    group by meetup_id
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

grant execute on function public.list_admin_meetup_availability() to authenticated;
grant execute on function public.list_admin_meetup_availability() to service_role;

-- Single-meetup snapshot: include the guest count in the math and the payload.
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
  v_manual_guest_count integer;
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

  select count(*)::integer
  into v_manual_guest_count
  from public.meetup_guests
  where meetup_id = v_meetup.id;

  if v_meetup.capacity is null then
    v_remaining_spots := null;
  else
    v_remaining_spots := greatest(v_meetup.capacity - v_active_order_count - v_manual_guest_count, 0);
  end if;

  if v_meetup.registration_status = 'closed' then
    v_effective_registration_status := 'closed';
  elsif v_meetup.capacity is not null
    and (v_active_order_count + v_manual_guest_count) >= v_meetup.capacity then
    v_effective_registration_status := 'sold_out';
  else
    v_effective_registration_status := 'open';
  end if;

  return jsonb_build_object(
    'meetup_id', v_meetup.id,
    'capacity', v_meetup.capacity,
    'active_order_count', v_active_order_count,
    'manual_guest_count', v_manual_guest_count,
    'remaining_spots', v_remaining_spots,
    'registration_status', v_meetup.registration_status,
    'effective_registration_status', v_effective_registration_status,
    'closed_at', v_meetup.closed_at,
    'close_reason', v_meetup.close_reason
  );
end;
$$;

-- Registration guard: guests count toward sold-out so they can reserve seats.
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
  v_manual_guest_count integer;
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

  select count(*)::integer
  into v_manual_guest_count
  from public.meetup_guests
  where meetup_id = v_meetup.id;

  if v_meetup.capacity is not null
    and (v_active_order_count + v_manual_guest_count) >= v_meetup.capacity then
    raise exception 'MEETUP_SOLD_OUT';
  end if;

  return v_meetup;
end;
$$;
