grant update (status) on public.orders to authenticated;

drop policy if exists "admins can update order status" on public.orders;
create policy "admins can update order status"
on public.orders
for update
to authenticated
using (public.is_admin())
with check (
  public.is_admin()
  and status in ('pending', 'demo_paid', 'paid', 'cancelled', 'failed')
);
