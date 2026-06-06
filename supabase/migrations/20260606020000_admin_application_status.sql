grant update (status) on public.applications to authenticated;

drop policy if exists "admins can update application status" on public.applications;
create policy "admins can update application status"
on public.applications
for update
to authenticated
using (public.is_admin())
with check (
  public.is_admin()
  and status in ('submitted', 'reviewing', 'accepted', 'rejected', 'cancelled')
);
