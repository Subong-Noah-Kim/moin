# Agentic Deploy Handoff

Last updated: 2026-06-07 12:31 KST

## Summary

This rollout is deployed and verified on GitHub Pages.

Current branch: `codex/overnight-task-discovery`

Reference local commit when this handoff was refreshed: `3d4351e Add morning deploy handoff`. Run `git log -1` again before deployment because additional local commits may exist.

Remote push/deploy status: Supabase applied, Edge Functions deployed, GitHub Pages deployed from `main`

Most recent test baseline: `npm test` passed with 41 tests at 2026-06-07 12:10 KST.

Branch upstream: not set locally at the time of this handoff.

## Recommended Morning Decision

If you want the safest path, review and deploy in this order:

1. Review this handoff and `supabase/capacity-rollout-checklist.md`.
2. Decide whether the capacity rollout is going live now.
3. If yes, deploy the current branch only after the Supabase capacity steps are applied in order.
4. If no, split or cherry-pick the low-risk frontend/test/doc commits separately and leave capacity for a later rollout.

The important point: the live Supabase project now has the capacity contract, so the frontend no longer needs to fail closed with `접수 확인중` once the latest Pages artifact is deployed.

## Rollout Record

Completed at 2026-06-07 12:16 KST:

- `npm test` passed: 41 tests.
- Live Supabase project `jqnnolsyvynrhjvfmege` was checked before migration.
- Capacity migrations were applied in order:
  - `supabase/migrations/20260607000000_capacity_remaining_spots.sql`
  - `supabase/migrations/20260607010000_capacity_rpc_guards.sql`
  - `supabase/migrations/20260607020000_capacity_read_contract.sql`
- `supabase/capacity-smoke-test.sql` passed against live Supabase.
- Smoke-test leftovers were checked: 0 rows in `meetups`, `applications`, `orders`, and `payments`.
- Edge Functions were deployed:
  - `create-public-submission`
  - `confirm-toss-payment`
- Live Edge Function smoke test passed with temporary meetup `__edge_capacity_smoke__`:
  - first demo order returned HTTP 200
  - second demo order returned HTTP 409 with `MEETUP_SOLD_OUT`
  - temporary rows were deleted and leftovers were checked: 0 rows
- `list_public_meetup_availability()` returned live rows successfully.
- First GitHub Pages deploy exposed a browser-only issue: availability RPC was 200, but direct anon `meetups` select returned 401.
- Added and applied `supabase/migrations/20260607030000_public_meetup_read_rpc.sql`.
- Updated the frontend to call `list_public_meetups()` instead of direct anon table select.
- Verified `list_public_meetups()` with the publishable anon key: HTTP 200.

Completed after the hotfix redeploy at 2026-06-07 12:31 KST:

- Pushed `main` through commit `0263193`.
- GitHub Pages workflow run `27081546768` completed successfully.
- Playwright live public-page check passed:
  - 8 meetup cards rendered.
  - `접수 확인중` was not present.
  - `접수중` was present.
  - `main.js`, `supabase-client.js`, `public-availability.js`, `list_public_meetups`, and `list_public_meetup_availability` all returned HTTP 200.
- Playwright admin-page check passed:
  - login page rendered.
  - `admin.js`, `admin-meetup-form.js`, `admin-availability.js`, `admin-status.js`, and `supabase-client.js` returned HTTP 200.
- Playwright payment-result page check passed:
  - `payment-result.js`, `payment-result-state.js`, and `supabase-client.js` returned HTTP 200.
- `PUBLIC_AGENTIC_STATUS.json` returned HTTP 200.
- Raw `AGENTIC_STATUS.json` returned HTTP 404.

## Deployment Bundles

### Bundle A - Lower-risk frontend, docs, and tests

What it contains:

- Admin session storage hardening
- Admin status helper tests for operator-facing labels and manual order status rules
- Public form labels and helper tests
- Payment result identifier minimization
- Public localStorage resilience
- Public Agentic status redaction
- GitHub Pages workflow runtime/cache-busting cleanup

Why it is useful:

These changes reduce operational risk and improve maintainability without changing the core Supabase data contract as much as the capacity work.

Main caveat:

Some files are currently interleaved on the same branch with capacity work, so splitting this bundle may require cherry-picking or a separate branch.

### Bundle B - Capacity, remaining spots, and automatic sold-out

What it contains:

- `meetups.capacity`, `registration_status`, `close_reason`
- `orders.expires_at` for stale pending order cleanup
- Public/admin availability RPCs
- Edge Function guards for sold-out, closed, and expired pending orders
- Public/admin UI for remaining spots and manual close/open controls

Why it is useful:

This is the most important product-readiness work because it prevents overbooking and makes seat status explicit for both users and administrators.

Main caveat:

This bundle must be deployed in the exact Supabase-first order below.

### Bundle C - Agentic monitor and documentation

What it contains:

- Agentic work rules
- Local live monitor
- Public redacted status artifact
- Work logs and task details

Why it is useful:

It makes long-running work easier to audit and understand without exposing the raw local status file publicly.

Main caveat:

The deployed admin Agentic tab intentionally shows less detail than the local monitor because GitHub Pages files are public static files.

## Required Order If Deploying The Current Branch

1. Run `npm test` locally.
2. Apply the capacity migrations to Supabase in this order:
   - `supabase/migrations/20260607000000_capacity_remaining_spots.sql`
   - `supabase/migrations/20260607010000_capacity_rpc_guards.sql`
   - `supabase/migrations/20260607020000_capacity_read_contract.sql`
3. Run `supabase/capacity-smoke-test.sql` against the live Supabase project.
4. Deploy Edge Functions:
   - `supabase functions deploy create-public-submission --no-verify-jwt`
   - `supabase functions deploy confirm-toss-payment --no-verify-jwt`
5. Verify public application, demo order, and Toss test payment flows against Supabase before frontend deploy.
6. Push or merge the branch.
7. Run the GitHub Pages workflow.
8. Verify the live public page and admin page.

## Post-deploy Checks

Public page:

- Meetup list loads.
- Capacity badge and remaining spots show correctly.
- Sold-out or manually closed meetups block application and checkout.
- Normal open meetups can create an application or Toss test checkout.

Admin page:

- Admin login still works.
- Meetup form shows capacity, registration status, and close reason fields.
- Seat summary appears for capacity-enabled meetups.
- Existing meetup edit/save still works.

Payment result page:

- Toss success callback confirms payment.
- Failure/cancel paths show clear status.
- Raw `paymentKey` is not displayed.
- Callback query values are cleaned from the URL after capture.

Agentic status:

- `PUBLIC_AGENTIC_STATUS.json` returns 200 after Pages deploy.
- Raw `AGENTIC_STATUS.json` should not be copied to the Pages artifact.
- Local `agent-monitor` can still show detailed internal status from `AGENTIC_LIVE_STATUS.json`.

Static modules:

- The deployed site should not 404 for these browser modules:
  - `public-availability.js`
  - `admin-availability.js`
  - `admin-status.js`
  - `payment-result-state.js`
  - `admin-meetup-form.js`
  - `public-form.js`
  - `public-storage.js`

## Known Risks

- Capacity work is cross-layer. Database, Edge Functions, and frontend must match.
- Do not deploy the capacity-aware Edge Functions before the capacity migrations exist remotely.
- `momentclub:paid` is only a browser UI marker, not proof of payment.
- Current tests are mostly helper/source-contract tests. They are useful, but they are not a full browser automation suite.
- Public Agentic status is intentionally redacted on Pages; use local monitor for detailed work context.

## What Not To Do

- Do not push or deploy this branch until the deploy bundle decision is made.
- Do not deploy capacity-related Edge Functions before live Supabase migrations and smoke-test pass.
- Do not use Toss live keys during this test-mode rollout.
- Do not assume the admin Agentic tab is private just because it is behind the admin UI; Pages artifacts are static public files.
