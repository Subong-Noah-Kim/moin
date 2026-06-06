create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default now()
);

grant usage on schema public to authenticated;
grant select on public.admins to authenticated;
grant select on public.meetups to authenticated;
grant select on public.applications to authenticated;
grant select on public.orders to authenticated;
grant select on public.payments to authenticated;

alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admins can read themselves" on public.admins;
create policy "admins can read themselves"
on public.admins
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "admins can read all meetups" on public.meetups;
create policy "admins can read all meetups"
on public.meetups
for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can read applications" on public.applications;
create policy "admins can read applications"
on public.applications
for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can read orders" on public.orders;
create policy "admins can read orders"
on public.orders
for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can read payments" on public.payments;
create policy "admins can read payments"
on public.payments
for select
to authenticated
using (public.is_admin());
