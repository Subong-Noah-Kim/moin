revoke insert on public.applications from anon;
revoke insert on public.orders from anon;

drop policy if exists "visitors can submit applications" on public.applications;
drop policy if exists "visitors can create demo orders" on public.orders;
drop policy if exists "visitors can create limited orders" on public.orders;
