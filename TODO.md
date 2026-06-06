# moin TODO

Code review follow-up list. Keep this file as the source of truth for near-term cleanup and production-readiness work.

## P0 - Before Real Payment Use

- [x] Lock payment amount to server-side meetup price
  - Problem: anonymous clients can insert `orders.amount`, and the Edge Function currently validates Toss amount against that untrusted order row.
  - Files: `supabase/migrations/20260605000000_initial_schema.sql`, `supabase/functions/confirm-toss-payment/index.ts`, `supabase-client.js`, `main.js`
  - Done when: order creation and confirmation both use `meetups.price_amount` as the source of truth, not client-submitted or display-label-parsed values.
  - Status: code, migration, and Edge Function deploy completed; verified with a real Toss test payment.

- [x] Prevent payment state tampering through `record-failure`
  - Problem: the Edge Function runs with service role and accepts unauthenticated failure writes for a known `provider_order_id`.
  - Files: `supabase/config.toml`, `supabase/functions/confirm-toss-payment/index.ts`, `payment-result.js`, `main.js`
  - Done when: legitimate failure/cancel callbacks can still be recorded, but third parties cannot cancel someone else's pending order.
  - Status: code, migration, and Edge Function deploy completed with per-order `checkout_token`.

- [x] Make Toss confirmation database writes atomic
  - Problem: Toss confirm, order update, and payment insert are separate calls; a partial failure can leave `paid` orders without payment rows.
  - Files: `supabase/functions/confirm-toss-payment/index.ts`, new Supabase migration/RPC
  - Done when: marking an order paid and inserting the payment row happen in one database transaction or are reliably repairable on retry.
  - Status: `confirm_toss_payment_order` RPC applied and Edge Function deploy completed.

- [x] Escape or sanitize all public meetup rendering
  - Problem: admin-entered meetup content is rendered via `innerHTML` in public cards, drawers, checkout, tags, and image attributes.
  - Files: `main.js`
  - Done when: text is escaped or rendered via DOM APIs, URL attributes are validated, and stored HTML cannot execute on the public site.
  - Status: public meetup cards, detail drawer, checkout modal, event rows, waitlist rows, tags, image URLs, and data attributes are escaped/validated before rendering.

## P1 - Checkout Reliability

- [x] Use numeric `price_amount` for order/payment amount
  - Problem: current amount parsing can be wrong for labels like `148,000원 / 4회`, discounts, or free-text price labels.
  - Files: `main.js`, `supabase-client.js`
  - Done when: normalized meetup objects keep both `price_amount` and display `price_label`, and payment APIs use only the numeric amount.

- [x] Make Toss SDK loading awaitable
  - Problem: the first click can fail if the SDK script has been appended but has not loaded yet.
  - Files: `main.js`
  - Done when: `getTossPayment()` waits for the SDK script load event and surfaces a real load failure only after the script fails.
  - Status: `getTossPayment()` now awaits the SDK script load/error path and allows retry after load failure.

- [x] Prevent duplicate pending orders while checkout is in progress
  - Problem: the form can be re-enabled after `requestPayment()` is requested, allowing repeated pending orders.
  - Files: `main.js`
  - Done when: the checkout submit button stays disabled through the Toss request lifecycle, or a single pending order is reused safely.
  - Status: checkout uses a global in-progress lock and keeps the form disabled while Toss checkout is active.

- [x] Restrict manual admin order status transitions
  - Problem: admins can set `paid`/`demo_paid` without a payment row or audit trail.
  - Files: `admin.js`, `supabase-client.js`, `supabase/migrations/20260606030000_admin_order_status.sql`
  - Done when: manual status changes cannot create fake paid revenue, or manual adjustments are separately audited.
  - Status: admin UI/client now allow only `pending`, `cancelled`, and `failed`; the hardening migration applies the same DB policy.

## P2 - Accessibility and Mobile UX

- [x] Fix drawer and checkout modal focus management
  - Problem: closed panels can still expose focusable controls, and open panels do not trap/restore focus.
  - Files: `index.html`, `main.js`, `styles.css`
  - Done when: modals use `hidden`/`inert` or dialog-like behavior, focus is trapped while open, and focus returns to the opener on close.
  - Status: drawer and checkout modal now use `hidden`/`inert`, trap `Tab` focus while open, and restore focus to the opener on close.

- [ ] Add live regions for important loading/error states
  - Problem: login, admin sync, meetup save, and payment confirmation status text changes are not announced.
  - Files: `admin.html`, `payment-result.html`, `index.html`
  - Done when: dynamic statuses use `role="status"` or `aria-live` where appropriate.

- [ ] Add proper labels to application and checkout forms
  - Problem: some generated inputs rely on placeholders instead of explicit labels.
  - Files: `main.js`, `styles.css`
  - Done when: all form fields have visible labels or robust accessible names.

- [x] Restore or remove mobile bottom navigation
  - Problem: mobile bottom nav markup exists but is hidden, while top navigation is also hidden on smaller screens.
  - Files: `index.html`, `styles.css`
  - Done when: mobile users have a clear persistent navigation/CTA path, or dead markup is removed.
  - Status: mobile bottom navigation is visible below 720px, respects safe-area padding, highlights the active section, and keeps a clear application CTA.

- [x] Improve admin mobile tables
  - Problem: applications and orders still depend on wide horizontal scrolling on mobile.
  - Files: `admin.html`, `admin.css`, `admin.js`
  - Done when: applications, orders, and meetups are readable and actionable on a phone without awkward sideways panning.
  - Status: applications, orders, and meetups now collapse into labeled mobile cards with visible action controls.

## P3 - Maintainability and Performance

- [ ] Replace manual cache-busting with a consistent versioning strategy
  - Problem: query-string versions differ across HTML and module imports, making stale deployments easy.
  - Files: `index.html`, `admin.html`, `payment-result.html`, `main.js`, `admin.js`, `payment-result.js`, `supabase-client.js`
  - Done when: one deployment version controls all static asset imports, or a build step fingerprints files.

- [ ] Add frontend tests for shipped flows
  - Problem: current tests cover selected payment, rendering, accessibility, and admin assertions, but shipped flows still need broader coverage.
  - Files: `tests/`, `package.json`
  - Done when: tests cover escaping, numeric payment amount selection, Toss SDK load handling, and result-page state handling.

- [ ] Split large frontend modules into testable slices
  - Problem: `main.js`, `admin.js`, `supabase-client.js`, and CSS files are large and difficult to test safely.
  - Files: `main.js`, `admin.js`, `supabase-client.js`, `styles.css`, `admin.css`
  - Done when: shared helpers and payment/rendering logic can be imported and tested without loading full pages.

- [ ] Lazy-load repeated dynamic images
  - Problem: repeated meetup/event/recommendation images are eager-loaded.
  - Files: `main.js`
  - Done when: non-hero dynamic images include `loading="lazy"` and `decoding="async"` where appropriate.

## Notes

- Payment hardening migration and Edge Function deploy were applied after the SQL migration and function deployment steps. Keep using test keys until business/live payment setup is intentional.
- Supabase Edge Function deploy may require running locally from the terminal because the CLI can pause on macOS keychain/auth prompts.
