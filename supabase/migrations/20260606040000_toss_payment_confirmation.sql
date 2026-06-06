create unique index if not exists orders_provider_order_id_unique_idx
on public.orders(provider_order_id)
where provider_order_id is not null;

create unique index if not exists payments_provider_payment_key_unique_idx
on public.payments(provider_payment_key)
where provider_payment_key is not null;
