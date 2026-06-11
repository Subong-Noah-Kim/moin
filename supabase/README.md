# Supabase Setup

This folder contains the Supabase migrations and Edge Function setup notes for moin.

## 1. Create a Supabase Project

Create a new Supabase project, then open the SQL editor.

## 2. Run the Migration

Run `migrations/20260605000000_initial_schema.sql` in the Supabase SQL editor.

The migration creates:

- `meetups`
- `applications`
- `orders`
- `payments`

It also enables RLS and seeds the starter meetup data.

## 3. Add Public API Settings

Edit `supabase-config.js`:

```js
export const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_PUBLIC_ANON_KEY';
```

Only use the public anon key in the browser. Never put the service role key in this file.

## 4. Public Submission Flow

Public application and order creation should go through `functions/create-public-submission` before direct browser inserts are locked down.

Run `migrations/20260606080000_public_submission_abuse_controls.sql` first. This migration creates:

- `public_submission_attempts`
- `create_public_application` RPC
- `create_public_order` RPC
- server-side rate-limit checks for anonymous application/order creation

Set the required visitor-hash salt secret first, then deploy the Edge Function:

```bash
supabase secrets set PUBLIC_SUBMISSION_HASH_SALT=YOUR_RANDOM_SECRET
supabase functions deploy create-public-submission --no-verify-jwt
```

`PUBLIC_SUBMISSION_HASH_SALT` is required. The function refuses to build visitor hashes without it, so public application/order creation will fail until the secret is set.

Both Edge Functions answer CORS requests only for the GitHub Pages origin (`https://subong-noah-kim.github.io`) and local dev origins (`http://localhost:5173`, `http://127.0.0.1:5173`). Update the `allowedOrigins` list in each function's `index.ts` if the frontend moves to a different domain.

After the frontend has been deployed and application, screen-only demo order, and Toss test pending order creation have been checked, run `migrations/20260606090000_lock_public_direct_inserts.sql`.

Important deployment caution: do not run the lock migration before the Edge Function and frontend are both live. It revokes anonymous direct inserts into `applications` and `orders`, so the old browser insert path will stop working.

## 5. Payment Flow

The browser checkout asks `functions/create-public-submission` to write a pending Toss test order with `status = 'pending'`.
The Supabase Edge Function then:

- calls the Toss Payments test confirm API
- validates amount and order ID
- writes the final payment row into `payments`
- records Toss checkout cancellations and failures as `cancelled` or `failed`

## 6. Admin Dashboard

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

## 7. Admin Meetup Editing

Run `migrations/20260606010000_admin_meetup_writes.sql` to allow registered admins to add, edit, publish, and hide meetups from `admin.html`.

Run `migrations/20260606060000_meetup_image_storage.sql` to create the public `meetup-images` Storage bucket and allow registered admins to upload meetup images.

## 8. Admin Application Status

Run `migrations/20260606020000_admin_application_status.sql` to allow registered admins to update application statuses from `admin.html`.

## 9. Admin Order Status

Run `migrations/20260606030000_admin_order_status.sql` to allow registered admins to update order statuses from `admin.html`.

## 10. Toss Payments Test Preparation

The static checkout can create a pending Toss Payments test order before opening the Toss test payment window. Add the public test client key to `../toss-config.js`.

Do not put a Toss secret key in browser code. Payment confirmation is handled by `functions/confirm-toss-payment`, which validates `paymentKey`, `orderId`, and `amount`, then updates `orders` and inserts a row into `payments`.

## 11. Toss Payment Confirmation

Run `migrations/20260606040000_toss_payment_confirmation.sql` to prevent duplicate Toss order IDs and duplicate Toss payment keys.

Run `migrations/20260606050000_edge_function_service_role_grants.sql` so the payment confirmation Edge Function can read and update orders and insert payment records.

Run `migrations/20260606070000_harden_toss_payment_security.sql` to require server-side meetup price matching, add checkout tokens for failure/cancel recording, restrict manual paid status changes, and add the atomic `confirm_toss_payment_order` RPC.

Deploy the Edge Function in `functions/confirm-toss-payment` and store the Toss test secret key as a Supabase secret:

```bash
supabase secrets set TOSS_SECRET_KEY=YOUR_TOSS_TEST_SECRET_KEY
supabase functions deploy confirm-toss-payment --no-verify-jwt
```

The function reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TOSS_SECRET_KEY`, confirms the Toss test payment with the configured test secret key, updates the matching `orders.provider_order_id`, and inserts a `payments` row. It also records Toss checkout cancellation/failure redirects so pending test orders do not stay stuck.

## 12. Capacity and Sold-Out Guard Rollout

Use `capacity-rollout-checklist.md` as the live execution checklist before touching the production Supabase project.

Only run this section after the earlier public-submission and Toss hardening migrations are already present in the target Supabase project, especially:

- `migrations/20260606070000_harden_toss_payment_security.sql`
- `migrations/20260606080000_public_submission_abuse_controls.sql`
- `migrations/20260606090000_lock_public_direct_inserts.sql`

Before deploying the capacity-aware Edge Functions, apply the capacity migrations in this order:

1. `migrations/20260607000000_capacity_remaining_spots.sql`
2. `migrations/20260607010000_capacity_rpc_guards.sql`
3. `migrations/20260607020000_capacity_read_contract.sql`

Then run `capacity-smoke-test.sql` in the Supabase SQL editor. The smoke test uses a transaction and ends with `ROLLBACK`, so successful runs should not leave test rows behind.

Run `migrations/20260612000000_shorten_attempt_retention.sql` to shorten the rate-limit attempt log cleanup from one day to one hour. The limit windows are at most 10 minutes, so older rows never affect decisions.

As of 2026-06-12 the remote migration history is synced with this directory (`supabase migration repair` marked the earlier SQL-editor-applied migrations as applied). New migrations can now be applied with `npx supabase db push` instead of pasting SQL into the editor.

Do not deploy `functions/create-public-submission` or `functions/confirm-toss-payment` from this branch before all capacity migrations exist in the live Supabase project. The updated functions read `orders.expires_at` and expect the new capacity RPCs to be available.

After the smoke test passes, deploy the two Edge Functions, then deploy the frontend/admin bundle that reads or displays structured capacity state.

Stop the rollout if any capacity migration fails, if `capacity-smoke-test.sql` raises an exception, or if public application/order/payment checks fail after the Edge Function deploy. Do not continue to the next layer with a partially verified capacity state.

This repository documents the Toss Payments test flow only. Before switching to live payment keys, confirm business approval, user-facing terms, cancellation/refund policy, privacy notices, and operational reconciliation outside this setup checklist.
