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
