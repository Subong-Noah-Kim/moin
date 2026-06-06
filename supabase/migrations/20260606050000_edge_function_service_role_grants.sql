grant usage on schema public to service_role;

grant select, update on public.orders to service_role;
grant select, insert on public.payments to service_role;
