# Agentic Deploy Handoff

Last updated: 2026-06-07 11:45 KST

## Summary

This branch is ready for a careful morning review, but it should not be deployed casually. The branch contains several low-risk frontend/test/documentation improvements and one larger capacity rollout that is coupled across Supabase migrations, Edge Functions, and the GitHub Pages frontend.

Current branch: `codex/overnight-task-discovery`

Last local commit checked before this handoff: `7e0b2ea Add public storage helper`

Remote push/deploy status: not pushed, not deployed

Most recent test baseline: `npm test` passed with 39 tests after this handoff update. Run it again immediately before any deploy decision.

Branch upstream: not set locally at the time of this handoff.

## Recommended Morning Decision

If you want the safest path, review and deploy in this order:

1. Review this handoff and `supabase/capacity-rollout-checklist.md`.
2. Decide whether the capacity rollout is going live now.
3. If yes, deploy the current branch only after the Supabase capacity steps are applied in order.
4. If no, split or cherry-pick the low-risk frontend/test/doc commits separately and leave capacity for a later rollout.

The important point: the current branch includes capacity-aware frontend and Edge Function code. Deploying those pieces before the live Supabase project has the capacity migrations can break registration or payment flows.

## Deployment Bundles

### Bundle A - Lower-risk frontend, docs, and tests

What it contains:

- Admin session storage hardening
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
