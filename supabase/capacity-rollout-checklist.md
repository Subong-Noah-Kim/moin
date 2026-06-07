# Capacity Rollout Checklist

Use this checklist when applying the local capacity / remaining-spots work to the live Supabase project `jqnnolsyvynrhjvfmege`.

This is an execution checklist, not a deployment record. Mark items during the actual rollout.

## Goal

The rollout makes Supabase the source of truth for:

- meetup capacity
- remaining spots
- automatic sold-out checks
- manual registration close/open state
- expired Toss pending seat holds

It also lets the public page and admin page read structured capacity state instead of relying on manual `status_label` text.

## Do Not Start Unless

- [ ] The working branch and commit set have been reviewed.
- [ ] `npm test` passes locally.
- [ ] You can access the Supabase project SQL editor for `jqnnolsyvynrhjvfmege`.
- [ ] You can deploy Supabase Edge Functions for this project.
- [ ] You can deploy GitHub Pages after the Supabase work is confirmed.
- [ ] You are ready to stop the rollout if any SQL step or smoke-test assertion fails.
- [ ] These prior migrations already exist in the live project: `20260606070000`, `20260606080000`, `20260606090000`.

## Hard Stop Rules

Stop and do not deploy the next layer if any of these happen:

- A migration fails in the SQL editor.
- `supabase/capacity-smoke-test.sql` raises an exception.
- Public meetup list reads fail after the read-contract migration.
- `create-public-submission` cannot create a valid application or pending Toss test order after Edge Function deploy.
- `confirm-toss-payment` cannot handle a valid Toss test payment after Edge Function deploy.

## Required Order

## Execution Record - 2026-06-07 12:16 KST

- [x] `npm test` passed locally: 41 tests.
- [x] Live Supabase project `jqnnolsyvynrhjvfmege` was checked before migration.
- [x] Supabase migration history did not contain local migration records, so `supabase db push` was not used.
- [x] Capacity migrations were applied manually with `supabase db query --linked --file`.
- [x] `supabase/capacity-smoke-test.sql` passed against live Supabase.
- [x] Smoke-test leftovers were checked: 0 rows.
- [x] Edge Functions were deployed:
  - `create-public-submission`
  - `confirm-toss-payment`
- [x] Temporary live Edge Function smoke test passed:
  - first demo order: HTTP 200
  - second demo order on one-seat meetup: HTTP 409 `MEETUP_SOLD_OUT`
  - temporary rows cleaned up: 0 leftovers
- [ ] GitHub Pages frontend/admin deployed.
- [ ] Live public/admin/payment pages verified after frontend deploy.

### 1. Apply Capacity Migrations

Run these in the Supabase SQL editor in exactly this order:

- [x] `supabase/migrations/20260607000000_capacity_remaining_spots.sql`
- [x] `supabase/migrations/20260607010000_capacity_rpc_guards.sql`
- [x] `supabase/migrations/20260607020000_capacity_read_contract.sql`

Do not deploy the capacity-aware Edge Functions before all three migrations are applied.

### 2. Run SQL/RPC Smoke Test

Run:

- [ ] `supabase/capacity-smoke-test.sql`

Expected result:

- [x] The script completes without exceptions.
- [x] It ends with `ROLLBACK`.
- [x] No `__capacity_smoke_*` rows remain in `meetups`, `applications`, `orders`, or `payments`.

The smoke test verifies:

- unlimited capacity still accepts application/order creation
- Toss pending orders get a future `expires_at`
- non-expired Toss pending orders can become `paid`
- one-seat meetups become `sold_out`
- public availability RPC returns `sold_out`
- sold-out application/order attempts fail
- manually closed meetups fail
- expired pending Toss orders cannot become paid
- stale pending orders can be marked failed

### 3. Deploy Supabase Edge Functions

After the migrations and smoke test pass, deploy:

- [x] `supabase functions deploy create-public-submission --no-verify-jwt`
- [x] `supabase functions deploy confirm-toss-payment --no-verify-jwt`

Confirm secrets are still present:

- [x] `TOSS_SECRET_KEY`
- [x] `PUBLIC_SUBMISSION_HASH_SALT` if used in the live project. Current live project does not set it; the Edge Function uses the documented fallback salt.

### 4. Verify Edge Functions Before Frontend Deploy

Before deploying GitHub Pages:

- [ ] Create a normal public application through the current public page.
- [ ] Create a screen-only demo order through the current public page.
- [ ] Create a Toss test pending order through the current public page.
- [ ] Complete one Toss test payment and confirm the order/payment records reconcile in admin.
- [ ] Confirm sold-out or closed test data returns a user-safe 409 message instead of creating a new row.

### 5. Deploy Frontend/Admin

Only after Supabase and Edge Function checks pass:

- [ ] Push the reviewed branch or merge commit.
- [ ] Run the GitHub Pages workflow.
- [ ] Confirm the workflow finishes without Node runtime deprecation warnings.
- [ ] Open the public page and confirm capacity badges render.
- [ ] Open `admin.html` and confirm the new `좌석` column and capacity form controls render.

## Post-Deploy Manual Checks

Public page:

- [ ] Open published meetups.
- [ ] Confirm finite-capacity meetups show `잔여 N석`, `마감`, or `신청 종료`.
- [ ] Confirm application and checkout are blocked for `마감` or `신청 종료`.
- [ ] Confirm Toss test payment still reaches `payment-result.html` and records payment state.

Admin page:

- [ ] Edit a meetup and save a finite `정원`.
- [ ] Reopen the meetup and confirm the capacity value persists.
- [ ] Set `접수 상태` to `수동 종료` with a short reason.
- [ ] Confirm public application/checkout are blocked for that meetup.
- [ ] Set `접수 상태` back to `접수중`.
- [ ] Confirm the admin `좌석` column shows a structured status, not the manual `상태 문구`.

## Known Safe Non-Actions

Do not do these during this rollout:

- Do not deploy Edge Functions before the capacity migrations.
- Do not use the service role key in browser config files.
- Do not paste real customer/payment identifiers into Agentic status files.
- Do not treat `status_label` as the source of truth for sold-out or registration state.
- Do not re-open anonymous direct inserts into `applications` or `orders`.
- Do not drop capacity columns as the first rollback move.
- Do not switch Toss live keys during this test-mode rollout.

## Current Limitation

The admin UI saves `capacity`, `registration_status`, and `close_reason`. It does not currently write `closed_at`; `registration_status = 'closed'` is the operational source of truth for manual close/open behavior.

## Rollback Notes

If the frontend deploy has not happened yet, stop after a failed migration or smoke test and keep the current public site unchanged.

If Edge Functions were deployed but frontend was not, redeploy the previous known-good Edge Function versions or pause public checkout until the migration issue is fixed.

If frontend/admin was deployed and capacity state is broken, hide affected meetups in admin or revert the GitHub Pages deploy, then investigate Supabase migration and RPC status before retrying.
