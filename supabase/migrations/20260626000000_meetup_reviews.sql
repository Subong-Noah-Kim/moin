-- Add an optional, admin-authored "reviews" section to meetups: short
-- testimonial-style entries (quote + recommended audience) that describe who a
-- meetup is good for, from a customer's perspective. These are NOT user
-- submitted — the operator curates them when creating/editing a meetup. When
-- absent/empty the public detail simply omits the section.
--
-- Stored as jsonb: [{ "audience": "...", "quote": "..." }, ...].

alter table public.meetups
  add column if not exists reviews jsonb;

-- list_public_meetups() gains the reviews column. Adding a column to a
-- RETURNS TABLE changes the function's return type, so it must be dropped
-- before being recreated (create or replace alone raises 42P13).
drop function if exists public.list_public_meetups();

create or replace function public.list_public_meetups()
returns table (
  id text,
  type text,
  category text,
  title text,
  description text,
  host_name text,
  host_role text,
  status_label text,
  date_label text,
  time_label text,
  location text,
  price_amount integer,
  price_label text,
  tags text[],
  image_url text,
  schedule text[],
  reviews jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    meetups.id,
    meetups.type,
    meetups.category,
    meetups.title,
    meetups.description,
    meetups.host_name,
    meetups.host_role,
    meetups.status_label,
    meetups.date_label,
    meetups.time_label,
    meetups.location,
    meetups.price_amount,
    meetups.price_label,
    meetups.tags,
    meetups.image_url,
    meetups.schedule,
    meetups.reviews
  from public.meetups
  where meetups.is_published = true
  order by meetups.created_at asc;
$$;

revoke all on function public.list_public_meetups() from public;
grant execute on function public.list_public_meetups() to anon;
grant execute on function public.list_public_meetups() to authenticated;
grant execute on function public.list_public_meetups() to service_role;
