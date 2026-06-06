# Supabase Setup

This folder contains the database migration for the moin demo.

## 1. Create a Supabase Project

Create a new Supabase project, then open the SQL editor.

## 2. Run the Migration

Run `migrations/20260605000000_initial_schema.sql` in the Supabase SQL editor.

The migration creates:

- `meetups`
- `applications`
- `orders`
- `payments`

It also enables RLS and seeds the current demo meetup data.

## 3. Add Public API Settings

Edit `supabase-config.js`:

```js
export const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_PUBLIC_ANON_KEY';
```

Only use the public anon key in the browser. Never put the service role key in this file.

## 4. Payment Flow

The browser checkout writes a pending Toss test order with `status = 'pending'`.
The Supabase Edge Function then:

- calls the payment provider confirm API
- validates amount and order ID
- writes the final payment row into `payments`
- records Toss checkout cancellations and failures as `cancelled` or `failed`

## 5. Admin Dashboard

Run `migrations/20260606000000_admin_dashboard.sql`, then create a Supabase Auth user and register that user as an admin:

```sql
insert into public.admins (user_id, email)
select id, email
from auth.users
where email = 'admin@example.com';
```

Only registered admin users can read `applications`, `orders`, and `payments` from `admin.html`.

If you invite admins from Supabase Authentication, set Authentication > URL Configuration > Site URL to the deployed admin page:

```text
https://subong-noah-kim.github.io/moin/admin.html
```

After sending the invitation, register the invited user in `admins`:

```sql
insert into public.admins (user_id, email)
select id, email
from auth.users
where email = 'invitee@example.com'
on conflict do nothing;
```

## 6. Admin Meetup Editing

Run `migrations/20260606010000_admin_meetup_writes.sql` to allow registered admins to add, edit, publish, and hide meetups from `admin.html`.

Run `migrations/20260606060000_meetup_image_storage.sql` to create the public `meetup-images` Storage bucket and allow registered admins to upload meetup images.

## 7. Admin Application Status

Run `migrations/20260606020000_admin_application_status.sql` to allow registered admins to update application statuses from `admin.html`.

## 8. Admin Order Status

Run `migrations/20260606030000_admin_order_status.sql` to allow registered admins to update order statuses from `admin.html`.

## 9. Toss Payments Test Preparation

The static checkout can create a pending Toss Payments test order before opening the Toss test payment window. Add the public test client key to `../toss-config.js`.

Do not put a Toss secret key in browser code. Payment confirmation should be handled by a server endpoint or Supabase Edge Function that validates `paymentKey`, `orderId`, and `amount`, then updates `orders` and inserts a row into `payments`.

## 10. Toss Payment Confirmation

Run `migrations/20260606040000_toss_payment_confirmation.sql` to prevent duplicate Toss order IDs and duplicate Toss payment keys.

Run `migrations/20260606050000_edge_function_service_role_grants.sql` so the payment confirmation Edge Function can read and update orders and insert payment records.

Run `migrations/20260606070000_harden_toss_payment_security.sql` to require server-side meetup price matching, add checkout tokens for failure/cancel recording, restrict manual paid status changes, and add the atomic `confirm_toss_payment_order` RPC.

Deploy the Edge Function in `functions/confirm-toss-payment` and store the Toss test secret key as a Supabase secret:

```bash
supabase secrets set TOSS_SECRET_KEY=YOUR_TOSS_TEST_SECRET_KEY
supabase functions deploy confirm-toss-payment --no-verify-jwt
```

The function reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TOSS_SECRET_KEY`, confirms the payment with Toss Payments, updates the matching `orders.provider_order_id`, and inserts a `payments` row. It also records Toss checkout cancellation/failure redirects so pending test orders do not stay stuck.
