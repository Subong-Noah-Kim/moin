# moin TODO

Code review follow-up list. Keep this file as the source of truth for near-term cleanup and production-readiness work.

## 🔴 높은 우선순위 — 토스 라이브 신청/런칭 전 필수

- [ ] 사업자정보·정책 페이지 실제 내용 채우기 (구조 완료, 값만 남음)
  - Problem: 카드사 심사관이 라이브 사이트를 직접 확인하므로, 전자결제 신청 전에 사업자정보 푸터와 정책 페이지에 실제 값이 채워져 있어야 한다. 현재는 플레이스홀더(`[[ ]]`)만 있어 라이브에 노출하면 대괄호가 그대로 보임.
  - Files: `index.html`(푸터 `[[ ]]`), `refund.html`, `terms.html`, `privacy.html`
  - 채울 값: 상호명 / 대표자명 / 사업자등록번호 / 사업장 주소 / 고객센터 전화·이메일 / 통신판매업 신고번호(또는 "면제 대상(간이과세자)") / 환불 기준(취소 시점별 일수·비율) / 개인정보 보호책임자 / 각 문서 시행일
  - 무형 재화 주의: 서비스 제공기간(결제 시점~모임 종료, 사전 예약 기간 포함, 최대 결제일로부터 1년) 명시 — `refund.html` 2번 섹션 + 푸터 공통 안내에 이미 반영됨. 환불 비율·일수만 확정하면 됨.
  - 약관/개인정보처리방침은 공정위 표준약관 등 참고해 법적 검토 후 게시 권장.
  - Done when: 모든 `[[ ]]` 플레이스홀더가 실제 값으로 채워지고, 채운 상태로 배포되어 라이브 사이트 푸터·정책 페이지에 정상 노출됨.
  - 후속(선택): 각 모임 카드/상세에 "서비스 제공기간: 결제일~모임 종료일" 자동 표시 + 결제일 기준 1년 초과 일정 판매 차단.

## Current Priority Queue - 2026-06-07 Audit

1. Continue behavior-oriented frontend tests for shipped public/admin/payment flows.
2. Split large frontend modules into small testable helper slices only when the next test needs it.
3. Keep `TODO.md`, `AGENTIC_STATUS.json`, `AGENTIC_LIVE_STATUS.json`, and `AGENTIC_WORK_LOG.md` current after each completed task.
4. Expand browser smoke coverage only where it catches real release risk, such as authenticated admin edit flow or Toss result callback states.
5. Revisit optional live regions for important loading/error states after operational/test coverage work.

Status note: the P0 capacity, remaining-spots, and automatic sold-out rollout is now deployed and live-verified on Supabase, Edge Functions, and GitHub Pages. Existing published meetups currently have unlimited capacity, so the public label is usually `접수중`; capacity-enabled test meetups showed `잔여 N석`, `마감`, `신청 종료`, and reopened remaining-seat states correctly.

## Current Priority Queue - 2026-06-12 Update

Status note 2026-06-17: per-meetup capacity/remaining display + named virtual guests are deployed and live-verified. Public cards/detail now read `정원 N명 · 잔여 M석` (text only, no progress bar); admins can open a per-row modal to add/delete named guests (name + optional memo, 1 row = 1 seat) that subtract from remaining seats. Schema: migration 20260624000000 adds `public.meetup_guests` (admin-only RLS, no anon grant) and folds the guest count into all four seat functions (remaining = greatest(capacity − active_orders − guests, 0); sold_out when active+guests ≥ capacity); the admin availability RPC now returns `manual_guest_count`. DB-verified during build (remaining 2→1→0, sold_out flip, MEETUP_SOLD_OUT block at order creation, restore on guest delete; test data cleaned). Live-verified post-deploy: deployed admin asset carries the modal markup+wiring, prod `list_public_meetup_availability` returns the new shape, and anon SELECT/INSERT on `meetup_guests` are both denied (401/42501) — admin-only as intended. escapeHtml stays in the single shared module: guest-list markup is built in admin-render.js (`buildGuestListHtml`), not inlined in admin.js. Test suite is at 154 passing.

Status note: the application-order link feature (신청 후 결제) is deployed and live-verified end to end: applications issue confirmation tokens, checkout is gated behind a stored application, every new order links to an application, payment auto-accepts the linked application, and double payment is blocked at order creation, pre-capture, and by a partial unique index. The items below are the agreed follow-up backlog.

Status note 2026-06-13 (2): account-free history is deployed. Applications now require an email (validated in the edge function, stored lowercased), and `my-history.html` lets visitors request a Supabase Auth magic link and view their own applications/orders via the `get_my_history` security-definer RPC (JWT email identity, token columns excluded, anon execution revoked). The admin policy audit confirmed every authenticated policy gates on `is_admin()`, so magic-link users hold no admin access. Live-verified: EMAIL_REQUIRED/EMAIL_INVALID mapping, lowercased storage, history RPC scoping under a simulated session, OTP send 200, and the live page loads without runtime errors. Test suite is at 115 passing.

Status note 2026-06-15: custom SMTP is connected via Brevo (Management API config/auth: smtp_host=smtp-relay.brevo.com:587, sender `moin <soobong1217@gmail.com>`, rate_limit_email_sent raised 2->30, magic-link subject/body localized to Korean). Brevo's new-account IP allowlist blocked the first send (525 Unauthorized IP) until the Supabase send IP (3.39.214.69, AWS Seoul) was authorized. Magic-link email now sends successfully and was delivered — but lands in SPAM because the From is a gmail.com address relayed through Brevo (no DMARC alignment). DELIVERABILITY FIX REQUIRED BEFORE LAUNCH: buy a custom domain and authenticate it (SPF/DKIM/DMARC) in Brevo, then send from no-reply@<domain>; only the smtp_admin_email/sender needs to change, no code. SMTP credentials live only in Supabase auth config, not in the repo.

Status note 2026-06-15 (9): code-quality slice — extracted public-meetup.js from main.js (fallback meetup data + pure helpers: formatPrice/normalizePriceLabel/isPublicImageUrl/escapeImageUrl/getCategoryFallbackImage/escapeAttribute/createFallbackOrder/sortMeetupsByFallbackOrder/matchesSearch/normalizeMeetup/createTagMarkup). main.js dropped 1638→1404 lines; the helpers now have direct unit tests (tests/publicMeetup.test.js). No behavior change — full suite (146) + browser smoke green, live page still renders 8 cards from supabase. Remaining "split large modules" work (admin.js DOM wiring, supabase-client.js) is optional. Test suite is at 146 passing.

Status note 2026-06-15 (8): accessibility polish is deployed. The PWA install guide is now a real modal via the shared modal-manager (focus trap, Escape, focus restore, inert/aria-hidden when closed, body scroll lock) — it previously only toggled [hidden] and had none of that. Dynamic status text (admin login/sync/meetup-form, payment-result confirm/fail) now has role=status aria-live=polite. Browser-verified: Tab keeps focus inside the open guide and Escape closes it (aria-hidden/inert/scroll-lock restored). Remaining a11y backlog from the original list (broader live regions, etc.) is optional. Test suite is at 138 passing.

Status note 2026-06-15 (7): self-serve refund requests are deployed and live-verified. From "내 신청 이력", a magic-link user can flag a paid/demo_paid order for refund (button → confirm + reason → request_order_refund RPC with the session token). The RPC (migration 20260623000000, security definer) verifies the order belongs to the caller's JWT email and only RECORDS the request (orders.refund_requested_at/refund_request_reason) — the actual Toss cancel stays admin-only. get_my_history now returns order id + refund_requested_at; the admin order row shows a "환불 요청됨" pill + reason so the operator knows to act. DB-verified: owner request succeeds, other-account request raises ORDER_NOT_FOUND, history exposes the flag. Follow-up (deployed): the admin dashboard now shows a "환불 요청 N건" banner that jumps to the orders tab, and the orders table sorts pending refund requests to the top with a highlighted row (admin-render isPendingRefundRequest/countPendingRefundRequests/sortOrdersForReview) so requests aren't missed. The refund itself is still admin-initiated (no auto-processing). Test suite is at 136 passing.

Status note 2026-06-15 (6): rejection notifications are deployed and live-verified. When an admin sets an application to 'rejected', admin.js calls sendRejectionNotice → send-approval-push (kind: rejection) → claim_rejection_notice (migration 20260622000000, one-shot rejection_notified_at, does NOT require a push subscription) → gentle Brevo email (always, if email on file) + best-effort push. Verified live: a synthetic rejected application produced emailed:1 and the email was delivered to the inbox ("moin · <meetup> 신청 결과 안내"), and a second call returned claimed:false (idempotent). Closes the gap where approval was notified but rejection was silent. Test suite is at 130 passing.

Status note 2026-06-15 (5): Open Graph / Twitter card meta tags are deployed on index.html with a branded 1200x630 preview image (icons/og-image.png, rendered from icons/og-image.svg via the now width/height-aware scripts/render-app-icons.mjs). Sharing a moin link on KakaoTalk/SNS/iMessage/Slack now shows a card (title/description/image) instead of a bare URL. Absolute URLs used so scrapers can fetch the image; live-verified (tags present, image 200 image/png). Per-meetup previews are out of scope (SPA with hash routing, no per-meetup URLs). Test suite is at 126 passing.

Status note 2026-06-15 (4): a PWA "add to home screen" recommendation is deployed (dismissible site banner + an actionable install hint next to the push opt-in). Platform logic in unit-tested pwa-install.js: Android/desktop Chromium → native beforeinstallprompt dialog; iOS Safari → share-sheet guide modal (iOS has no install API); iOS in-app browsers → "open in Safari"; hidden when already installed (standalone) or dismissed (localStorage momentclub:install-dismissed). Drives iOS push adoption since iOS web push only works once installed. Screenshot-verified banner + guide under an iOS Safari UA. Test suite is at 124 passing.

Status note 2026-06-15 (3): the meetup drawer apply→pay area is now a guided two-step flow (deployed, live, screenshot-verified). Step 1 "신청서 작성" uses a high-contrast green primary submit (was a washed-out white button); step 2 "결제" is visibly locked until the application is submitted, then the form collapses to "✓ 신청 완료" (with the push opt-in checkbox) and the payment step activates and is scrolled into view. main.js gained buildApplyFlow/buildApplicationFormMarkup/buildPaymentSummaryMarkup/refreshApplyFlow; the dead refreshDrawerPaymentSummary was removed. Test suite is at 118 passing.

OPEN EMAIL FOLLOW-UPS (leave for later, not blocking):
1. Email deliverability — magic-link AND application confirmation emails land in SPAM because the From is a gmail.com address relayed through Brevo (no DMARC alignment). Fix: buy a custom domain, authenticate it (SPF/DKIM/DMARC) in Brevo, send from no-reply@<domain>. Then update Supabase auth config smtp_admin_email (magic link) and the BREVO_SENDER_EMAIL function secret (confirmation) — no code change. This also lets the site move off subong-noah-kim.github.io to a clean URL.
2. Key rotation (security hygiene) — the Brevo SMTP key and API key were shared in plaintext during setup. Rotate both in Brevo once stable; update Supabase auth SMTP config + the BREVO_API_KEY function secret. Brevo IP allowlist is currently DISABLED (required for serverless dynamic IPv6 egress); the API key is the security boundary.

Status note 2026-06-15 (2): application confirmation email is deployed and live-verified. After an application is created, `create-public-submission` fires `notifyApplicationReceived` (best-effort) which sends a Korean confirmation via Brevo's transactional HTTP API (`_shared/brevo-email.ts` + `_shared/application-email.ts`). The HTTP API is used instead of SMTP because Brevo's IP allowlist (which gates BOTH SMTP and API) kept blocking the edge function: its egress is a DYNAMIC IPv6 that changes every invocation (observed 2406:da12:358:5c01:... then ...5c0a:... on consecutive sends), so per-IP authorization can never converge. The IP allowlist/review was DISABLED in Brevo (security/authorised_ips) — the API key is the security boundary; this also permanently fixed the magic-link SMTP path. Verified via Brevo events API: requests→delivered for "moin · <meetup> 신청이 접수되었어요". Secrets BREVO_API_KEY/BREVO_SENDER_EMAIL/BREVO_SENDER_NAME set in Supabase function secrets (not in repo); send no-ops without the key. Same SPAM/deliverability caveat as magic links (gmail sender, no domain) — custom domain fixes both. SECURITY HYGIENE TODO: the SMTP key and API key were shared in plaintext during setup; rotate both in Brevo once stable and update the Supabase secret/auth config (no code change). Test suite is at 118 passing.

Status note 2026-06-13: approval push notifications are deployed and verified on a real iPhone PWA end to end (opt-in checkbox → subscription stored → admin approval → push received, duplicate send blocked by the claim). Two launch bugs were fixed along the way: the rate limiter now accepts the `push_subscription` action (20260616000000), and the approval claim is only consumed when subscriptions exist (20260617000000). The drawer now gathers application form, push opt-in checkbox, and payment into one "신청과 결제" section. Payment auto-accept paths (Toss confirm, demo order) now send the approval push best-effort server-side; verified live with a demo-order E2E and a real iPhone Toss test payment. Note for the shared-edge-helper backlog item: `notifyApprovalPush` is now duplicated in confirm-toss-payment and create-public-submission alongside `supabaseRequest`/`readJson`. Test suite is at 99 passing.

- [x] Add an operator refund/cancel flow for paid orders
  - Problem: `paid`/`demo_paid` orders are intentionally locked against manual status changes, so there is no operational path to refund or cancel a completed payment - including the documented concurrent-confirm race loser, whose duplicate Toss capture needs a manual refund.
  - Files: `supabase/migrations/`, `supabase/functions/confirm-toss-payment/index.ts` (Toss cancel API), `admin.html`, `admin.js`, `supabase-client.js`, `tests/paymentSecurity.test.js`
  - Done when: a registered admin can trigger a refund/cancel that calls the Toss cancel API, records the result in `payments`, and releases the seat, with the application link kept intact for audit.
  - Status: deployed (migration `20260618000000`, confirm-toss-payment refund action, admin refund button). The edge function verifies the admin session via auth/v1/user, cancels at Toss (ALREADY_CANCELED_PAYMENT treated as success), and the service-role `refund_paid_order` RPC atomically sets the order to `refunded` and records the refund on the payment row (inserting an audit row for demo orders). Live-verified at the DB level: refund RPC ran on a synthetic demo order — order/payment marked refunded, seat released from `active_order_count`, application link intact, double refund blocked with ORDER_NOT_REFUNDABLE; unauthenticated refund calls return 401. Remaining manual check: refund a real Toss test payment from the admin UI. Note: paid orders missing a payment record are blocked with PAYMENT_RECORD_MISSING and need a Toss dashboard cancel. Test suite is at 105 passing.

- [ ] Prepare the Toss live-key switch (business prerequisites + code prep)
  - Problem: the codebase is test-key only by design; switching to live payments needs terms/refund/privacy notices, live key handling, and reconciliation checks before any code change matters.
  - Files: `toss-config.js`, `toss-checkout.js`, `main.js` (checkout copy), Supabase secrets, `README.md`
  - Done when: business prerequisites are confirmed and a documented live/test key switch exists that cannot accidentally charge in test environments.
  - Status 2026-06-28: the business's OWN Toss test merchant keys are now wired and verified end to end (no longer the shared Toss sample key). Client key `test_ck_jExP…` deployed (commit a660d94, live on Pages); the matching `test_sk_…` is set as the Supabase `TOSS_SECRET_KEY` secret; a real test payment was confirmed and appeared in the merchant's Toss developer-center transaction log. The merchant already has a Toss relationship via an offline card terminal, so the heavy onboarding is mostly cleared. The `8a96…` "보안키" is NOT used by this integration (only client + secret keys are referenced anywhere in the code); it would only matter if webhook signature verification is added later. REMAINING before live:
    1. (business) Obtain `live_ck_`/`live_sk_` keys. The online API-payment product is a SEPARATE Toss contract from the card terminal; only `test_` keys exist today. Apply for online live integration in the Toss dashboard / via Toss support. Online-only prerequisites: 통신판매업 신고 + legal pages (terms / refund / privacy + business info display).
    2. (code, LANDMINE) `toss-checkout.js` `isTossConfigured()` returns `key.startsWith('test_')`, so a `live_` key returns false and SILENTLY falls back to the demo-checkout path (charges nobody). Must accept `live_` before any live key is deployed.
    3. (code) Update the checkout copy in `main.js` (~887–948: "TOSS TEST CHECKOUT", "테스트 결제는 실제 출금되지 않으며…") so live mode shows a real-charge notice instead of the test-mode wording.
    4. (code) Document the switch in `README.md`: the two values that change (toss-config.js client key + Supabase `TOSS_SECRET_KEY`), that they must be a matched pair from the same store, and the test-payment verification step.
  - Status 2026-06-28 (2): code prep (items 2–4) landed and tested. `toss-config.js` now exposes pure `getTossKeyMode` / `isTossClientKeyConfigured` / `isTossLiveKey` helpers (real-behavior unit tests); `toss-checkout.js` `isTossConfigured()` now accepts `live_` and a new `isTossLiveMode()` is exported; `main.js` checkout copy branches live/test/demo (live shows "TOSS LIVE CHECKOUT" + a real-charge / 즉시 출금 notice + a plain "결제하기" button); README has a 라이브 키 전환 section covering the matched-pair swap + verification. Behavior is unchanged under the current `test_` key (tossLive=false → identical test-mode copy). Full suite 173 passing. REMAINING is only item 1: obtain the `live_` keys (online contract) and swap both values.

- [x] Continue the admin.js split (increment 2)
  - Problem: admin.js is still ~1,270 lines mixing DOM wiring with markup building; the reviewed roadmap is to extract the agentic render cluster (`renderTaskDetailSection`, `renderTaskDetails`, markup parts of `renderAgenticStatus`) and then the table row templates (`buildOrderRow` style) into tested modules.
  - Files: `admin.js`, `admin-render.js` (or sibling), `.github/workflows/deploy-pages.yml`, `tests/paymentSecurity.test.js`
  - Done when: admin.js holds only DOM wiring, event handling, and session/fetch orchestration, with row/agentic markup unit-tested.
  - Status: deployed. All row templates (applications/orders/meetups/seat summary/empty rows) and the agentic cluster (summary cards, agent cards, task items, task details) moved into admin-render.js as exported `build*` functions with direct unit tests covering escaping, manual-edit gating, and empty states; admin.js (1,286 → 1,048 lines) holds no `<td`/`<article` markup, enforced by test pins. escapeHtml follow-ups landed too: admin-render no longer re-exports it, agent-monitor.js joined the single-module invariant test, and admin.js no longer needs escaping at all.

- [x] Share the edge function Supabase client helpers
  - Problem: `supabaseRequest`/`readJson` are duplicated between the two edge functions and have already drifted (error body `message` extraction), and the error mapping is three parallel `includes()` chains that can silently diverge.
  - Files: `supabase/functions/_shared/` (new), both `index.ts` files, `tests/paymentSecurity.test.js`
  - Done when: one shared request helper and one `[{ match, status, code, message }]` lookup table drive both functions.
  - Status: deployed and live-verified across all three functions. `_shared/supabase.ts` (request helper with the richer message extraction), `_shared/http.ts` (CORS allowlist + jsonResponse), `_shared/approval-push.ts` (auto-accept push hop), and `_shared/public-submission-errors.ts` (single `[{ match, status, code, message }]` table) replaced the per-function copies; the three index.ts files went from 1,030 to 654 lines total. Live probes confirmed mapped errors, CORS headers, and claim behavior, and the demo-order push E2E passed against the deployed functions.

- [ ] Consolidate the three escapeHtml copies
  - Problem: identical implementations live in `main.js`, `agent-monitor.js`, and `admin-render.js`; a fix to one will not reach the others.
  - Files: `main.js`, `agent-monitor.js`, `admin-render.js`, `tests/paymentSecurity.test.js` (a pin asserts the main.js copy)
  - Done when: one exported implementation is imported everywhere, with the source-contract test updated.

- [x] Add an authenticated admin flow to the CI browser smoke
  - Problem: CI smoke only verifies the admin login screen renders; the authenticated dashboard (tables, embeds, status edits) has no automated release gate.
  - Files: `scripts/browser-smoke.mjs`, `.github/workflows/deploy-pages.yml`, GitHub repo secrets (read-only test admin)
  - Done when: CI logs in with a secret-stored read-only admin account and asserts the dashboard tables render with the applicant/payment link columns.
  - Status: deployed via a CREDENTIAL-FREE approach instead of secret-stored creds (the repo is public and there's no read-only admin tier, so a real admin password in CI was rejected as too risky). `smokeAdminDashboard` seeds a fake session into sessionStorage and answers every Supabase REST/RPC call with fixtures, then asserts the orders/applications/meetups tables render, the applicant row appears, and the refund-request alert surfaces (count 1) — no admin password in CI, no live data read/written. Runs in CI before publish; verified passing locally and in the deploy run. If real end-to-end auth coverage is ever wanted, do it only after adding a read-only admin tier + a staging project.

- [ ] Decide whether TODO.md moves to GitHub Issues
  - Problem: this file is the backlog source of truth but is invisible to GitHub project tooling.
  - Done when: an explicit decision is recorded (stay in-repo or migrate) and stale completed entries are archived either way.

## P0 - Before Real Payment Use

- [x] Add capacity, remaining spots, and automatic sold-out controls
  - Problem: meetup capacity is still a manual display label such as "4자리 남음"; public application/order creation does not atomically block over-capacity submissions, and Toss `pending` orders have no expiry.
  - Files: `supabase/migrations/`, `supabase/functions/create-public-submission/index.ts`, `supabase/functions/confirm-toss-payment/index.ts`, `supabase-client.js`, `main.js`, `admin.html`, `admin.js`, `tests/paymentSecurity.test.js`
  - Done when: capacity is stored in Supabase, remaining spots are computed from seat-holding orders, sold-out/closed states return stable 409 errors, expired pending Toss holds do not consume seats forever, and public/admin UI use structured status instead of freeform `status_label`.
  - Status: deployed and live-verified on Supabase project `jqnnolsyvynrhjvfmege`. Applied migrations `20260607000000_capacity_remaining_spots.sql`, `20260607010000_capacity_rpc_guards.sql`, `20260607020000_capacity_read_contract.sql`, and `20260607030000_public_meetup_read_rpc.sql`; deployed `create-public-submission` and `confirm-toss-payment`; redeployed GitHub Pages; verified public cards no longer fail closed as `접수 확인중`; ran a temporary live meetup check for `잔여 2석` -> `잔여 1석` -> `마감`, server-side over-capacity HTTP 409 `MEETUP_SOLD_OUT`, manual `신청 종료`, reopen to `잔여 1석`, and cleanup leftovers 0.

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

- [x] Mirror checkout payment-method allowlist server-side
  - Problem: the browser now normalizes checkout `paymentMethod`, but a direct `create-public-submission` Edge Function call can still send arbitrary strings into order metadata.
  - Files: `supabase/functions/create-public-submission/index.ts`, `tests/paymentSecurity.test.js`
  - Done when: the Edge Function stores only `간편결제`, `카드`, or `계좌이체`, and falls back to `간편결제` for missing/unknown values.
  - Priority note: this is data hygiene and consistency hardening, not a payment authorization blocker, because amount/provider approval still does not trust this field.
  - Status: deployed with the capacity Edge Function rollout. `create-public-submission` normalizes `paymentMethod` before calling `create_public_order`, and tests pin the server allowlist contract.

- [x] Restrict manual admin order status transitions
  - Problem: admins can set `paid`/`demo_paid` without a payment row or audit trail.
  - Files: `admin.js`, `supabase-client.js`, `supabase/migrations/20260606030000_admin_order_status.sql`
  - Done when: manual status changes cannot create fake paid revenue, or manual adjustments are separately audited.
  - Status: admin UI/client now allow only `pending`, `cancelled`, and `failed`; the hardening migration applies the same DB policy.

## P1 - Operational Readiness

- [x] Refresh admin overview and payment-detail handling
  - Problem: `fetchAdminOverview()` now returns empty data with stale warnings, including "actual payment integration is skipped," even though Toss test confirmation and `payments` writes are connected.
  - Files: `supabase-client.js`, `admin.js`, `admin.html`, `README.md`
  - Done when: the initial admin load has accurate status text, paid orders can be reconciled against payment rows or an explicit payment-detail view, and outdated "before real payment" copy is removed.
  - Status: admin overview no longer emits stale pre-payment warnings, order loading fetches `payments` alongside `orders`, the order table shows a payment-record column, and tests verify the reconciliation path.

- [x] Decide public exposure policy for Agentic status artifacts
  - Problem: `AGENTIC_STATUS.json` is copied into the GitHub Pages artifact, so the admin UI can load it after login, but the raw JSON can also be requested directly by URL. It currently avoids secrets, but still contains branch, task, rollout, and operational notes.
  - Files: `.github/workflows/deploy-pages.yml`, `admin.js`, `AGENTIC_STATUS.json`, `AGENTIC_LIVE_STATUS.json`, `tests/paymentSecurity.test.js`
  - Done when: the project intentionally chooses either a redacted public status JSON, no public status artifact, or an authenticated status source; tests should match that decision.
  - Status: deployed and verified. GitHub Pages workflow now generates `PUBLIC_AGENTIC_STATUS.json` from an allow-list redactor instead of copying raw `AGENTIC_STATUS.json`, admin.js uses the public file in deployed mode and falls back to raw status locally, tests verify branch/owner/commit/currentTask/blocker/detailed notes are excluded, live `PUBLIC_AGENTIC_STATUS.json` returns 200, and raw `AGENTIC_STATUS.json` returns 404.

- [x] Add public submission abuse controls
  - Problem: anonymous visitors can insert applications and valid demo/pending orders directly through public Supabase policies, so a public launch can be spammed even though payment amount tampering is blocked.
  - Files: `supabase-client.js`, `supabase/functions/create-public-submission`, `supabase/migrations/20260606080000_public_submission_abuse_controls.sql`, `supabase/migrations/20260606090000_lock_public_direct_inserts.sql`
  - Done when: application/order creation has a practical spam-control path such as CAPTCHA/Turnstile, rate limits through an Edge Function, or another server-side abuse throttle appropriate for production.
  - Status: deployed and verified on `jqnnolsyvynrhjvfmege`. Public writes route through `create-public-submission`, the setup migration adds rate-limit RPCs, the lock migration removes anonymous direct inserts, Edge Function creation still works after the lock, and direct anon inserts now fail with permission errors.
  - Deployment note: the safe order was `20260606080000_public_submission_abuse_controls.sql`, `create-public-submission` deploy, frontend deploy, application/demo/Toss order verification, then `20260606090000_lock_public_direct_inserts.sql`.

- [x] Tighten admin session lifecycle and token storage
  - Problem: admin access and refresh tokens are stored in `localStorage`, while refresh is not actually used; this increases token persistence without improving the operator experience.
  - Files: `supabase-client.js`, `admin.js`
  - Done when: admin sessions either use a deliberate refresh flow or shorter-lived storage such as `sessionStorage`, expired sessions are handled clearly, and sign-out reliably clears stored credentials.
  - Status: deployed with the Pages rollout. Admin sessions now use tab-scoped storage, refresh token persistence was removed, expired/corrupted sessions are cleaned up, and regression tests pass. Authenticated admin login was not re-tested with credentials during the latest live smoke pass.

- [x] Update product/demo copy and setup docs to match current integration state
  - Problem: some README and UI copy still says "temporary," "demo," or "connection preparation" even though Supabase, Toss test payment, and Edge Function confirmation are wired.
  - Files: `README.md`, `supabase/README.md`, `main.js`, `payment-result.html`
  - Done when: public/admin copy clearly distinguishes real service behavior, Toss test mode, and remaining production setup work.
  - Status: deployed with the Pages rollout. Public checkout/result copy and setup docs now distinguish screen-only demo state, Toss test payment approval, Supabase Edge Function confirmation, and remaining live payment setup.

- [x] Minimize payment result identifier exposure
  - Problem: Toss `paymentKey` was needed for approval, but the raw value also appeared on the result screen, stayed in the callback URL, and was saved in browser storage.
  - Files: `payment-result.html`, `payment-result.js`, `tests/paymentSecurity.test.js`
  - Done when: `paymentKey` is still sent to the confirmation Edge Function, but the raw value is not rendered, not stored in `sessionStorage`, and callback query values are cleaned after capture.
  - Status: deployed with the Pages rollout. The result page now shows receipt status instead of the raw payment key, stores only a summary, cleans callback URLs after reading them, and has regression tests.

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
  - Priority note: defer behind higher operational work; this is an accessibility quality improvement, not a launch blocker. Avoid noisy announcements and prefer `aria-live="polite"` only for states that affect the user's next action.

- [x] Add proper labels to application and checkout forms
  - Problem: some generated inputs rely on placeholders instead of explicit labels.
  - Files: `main.js`, `styles.css`
  - Done when: all form fields have visible labels or robust accessible names.
  - Priority note: this has broader everyday UX value than live regions because labels remain visible after typing and help all users recover context.
  - Status: deployed with the Pages rollout. Application and checkout fields now have explicit labels, helper text, and `aria-describedby` connections.

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

- [x] Replace manual cache-busting with a consistent versioning strategy
  - Problem: query-string versions differ across HTML and module imports, making stale deployments easy.
  - Files: `index.html`, `admin.html`, `payment-result.html`, `main.js`, `admin.js`, `payment-result.js`, `supabase-client.js`
  - Done when: one deployment version controls all static asset imports, or a build step fingerprints files.
  - Status: source files now use a shared `__ASSET_VERSION__` placeholder, the Pages workflow replaces it with the short commit SHA in `dist`, and tests verify all cache-busting query strings stay consistent.

- [x] Update GitHub Pages workflow action/runtime compatibility
  - Problem: the latest successful Pages workflow reports GitHub Actions Node 20 deprecation warnings for checkout/setup/deploy actions, with forced Node 24 behavior coming soon.
  - Files: `.github/workflows/deploy-pages.yml`
  - Done when: the workflow uses action versions/settings compatible with the current GitHub runner runtime and a fresh deploy completes without deprecation warnings.
  - Status: deployed through the latest Pages rollout. Workflow uses `actions/checkout@v6`, `actions/setup-node@v6`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`, and Node 24; tests pin those versions.

- [ ] Add frontend tests for shipped flows
  - Problem: current tests cover selected payment, rendering, accessibility, and admin assertions mostly through source-text regex checks; shipped flows still need broader behavior coverage.
  - Files: `tests/`, `package.json`, `scripts/browser-smoke.mjs`
  - Done when: tests exercise exported helpers or DOM-like behavior for escaping, numeric payment amount selection, Toss SDK load handling, result-page state handling, cache version consistency, public/admin capacity state rendering, and admin status rendering.
  - Status: public capacity availability behavior now has a first pure helper slice in `public-availability.js`, with direct tests for missing availability fail-closed, sold-out, closed, remaining-seat labels/classes, payment button text, and shared registration block reasons used by checkout/application guards. Public detail/application/checkout state now has `public-flow.js`, which keeps drawer payment summary, payment button disabled state, application availability, checkout availability, paid state, and block reasons aligned in one tested helper. A minimal browser smoke runner now exists at `scripts/browser-smoke.mjs`, is deployed, and is runnable with `npm run smoke:browser`; it starts the local server, opens headless Chrome through the Chrome DevTools Protocol, verifies public cards, detail drawer, checkout modal, admin login view, and payment-result fallback view, and fails on local static resource errors or browser runtime errors. Admin capacity behavior now has a matching pure helper slice in `admin-availability.js`, with direct tests for capacity input normalization, open/near-full/sold-out/closed/unknown seat summaries, and read-only availability merge behavior. Payment-result state behavior now has a pure helper slice in `payment-result-state.js`, with direct tests for amount display, confirmation error messages, failure status labels, and safe Toss auth summary storage. Payment-result success callback now has a DOM-like `node:test` slice that imports the real `payment-result.js` module with fake document/window/fetch/storage and verifies confirmation payload, URL cleanup, safe auth summary storage, paid meetup marking, and success status rendering. Admin meetup form payload behavior now has a pure helper slice in `admin-meetup-form.js`, with direct tests for create/edit payloads, price labels, generated IDs, capacity, close reasons, tags/schedule, FormData checkbox behavior, and safe image URL handling. Admin status label and manual order-action behavior now has a pure helper slice in `admin-status.js`, with direct tests for application/order/payment/Agentic labels, option selection, status class normalization, and preventing manual `paid`/`demo_paid` order transitions. Public application/checkout form payload behavior now has a pure helper slice in `public-form.js`, with direct tests for field IDs, FormData/plain object input, trimmed application/checkout fields, and checkout payment-method allowlisting. Public browser storage recovery now has a pure helper slice in `public-storage.js`, with direct tests for corrupted JSON, non-array cleanup, value trimming/length limits, max item limits, and best-effort persistence. Continue with authenticated admin UI or Toss callback browser smoke only when the flow is worth the extra setup.

- [ ] Split large frontend modules into testable slices
  - Problem: `main.js`, `admin.js`, `supabase-client.js`, and CSS files are large and difficult to test safely.
  - Files: `main.js`, `admin.js`, `supabase-client.js`, `styles.css`, `admin.css`
  - Done when: shared helpers and payment/rendering logic can be imported and tested without loading full pages.
  - Status: started with `public-availability.js`, `public-flow.js`, `admin-availability.js`, `payment-result-state.js`, `admin-meetup-form.js`, `admin-status.js`, `public-form.js`, and `public-storage.js`; keep future slices small and avoid moving DOM-heavy code until a browser/jsdom test harness is chosen.

- [x] Lazy-load repeated dynamic images
  - Problem: repeated meetup/event/recommendation images are eager-loaded.
  - Files: `main.js`
  - Done when: non-hero dynamic images include `loading="lazy"` and `decoding="async"` where appropriate.
  - Status: meetup cards, waitlist cards, event rows, and small-group cards now include lazy loading and async decoding; drawer hero image remains eager because it is the active detail visual.

- [x] Make public localStorage parsing resilient
  - Problem: corrupted `momentclub:*` localStorage values can throw during module initialization and prevent the public app from rendering.
  - Files: `main.js`, `payment-result.js`
  - Done when: saved/notified/paid state uses safe parsing with fallback cleanup, matching the defensive admin session parser.
  - Status: completed in AG-0014; public saved/notified/paid state now uses defensive parsing, cleanup, and bounded Set persistence.

## Notes

- Payment hardening migration and Edge Function deploy were applied after the SQL migration and function deployment steps. Keep using test keys until business/live payment setup is intentional.
- Supabase Edge Function deploy may require running locally from the terminal because the CLI can pause on macOS keychain/auth prompts.
- Public submission abuse controls were applied with the two-step migration path. Keep that same order for future environments: setup migration, Edge Function deploy, frontend deploy/verification, then lock migration.
- Capacity work was deployed Supabase-first and then verified on GitHub Pages. For future environments, keep the same order documented in `supabase/capacity-rollout-checklist.md`; do not deploy capacity-aware Edge Functions before the capacity migrations exist remotely.
- `AGENTIC_DEPLOY_HANDOFF.md` now mostly serves as historical rollout context for the capacity deployment. Use this `TODO.md` priority queue for the next development choice.
