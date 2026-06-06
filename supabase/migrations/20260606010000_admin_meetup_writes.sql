grant insert, update on public.meetups to authenticated;

drop policy if exists "admins can create meetups" on public.meetups;
create policy "admins can create meetups"
on public.meetups
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins can update meetups" on public.meetups;
create policy "admins can update meetups"
on public.meetups
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
