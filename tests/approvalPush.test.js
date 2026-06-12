import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function readProjectFile(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

const MIGRATION = 'supabase/migrations/20260615000000_approval_push_notifications.sql';

test('push migration stores subscriptions behind token validation and RLS', async () => {
  const sql = await readProjectFile(MIGRATION);
  assert.match(sql, /create table if not exists public\.push_subscriptions/);
  assert.match(sql, /application_id uuid not null references public\.applications\(id\) on delete cascade/);
  assert.match(sql, /endpoint text not null unique/);
  assert.match(sql, /alter table public\.push_subscriptions enable row level security/);
  assert.match(sql, /create or replace function public\.register_push_subscription/);
  assert.match(sql, /APPLICATION_NOT_FOUND/);
  assert.match(sql, /assert_public_submission_rate_limit/);
  assert.match(sql, /'push_subscription'/);
  assert.match(sql, /on conflict \(endpoint\) do update/);
  assert.match(sql, /grant execute on function public\.register_push_subscription\(text, text, text, text, text\) to service_role/);
});

test('push config exposes a base64url VAPID application server key', async () => {
  const { PUSH_APPLICATION_SERVER_KEY } = await import('../push-config.js');
  assert.match(PUSH_APPLICATION_SERVER_KEY, /^[A-Za-z0-9_-]{40,}$/, 'must be base64url without padding');
  const generator = await readProjectFile('scripts/generate-vapid-keys.mjs');
  assert.match(generator, /generateKey\(\s*\{ name: 'ECDSA', namedCurve: 'P-256' \}/);
  assert.match(generator, /base64url/);
});

test('push support detection requires service worker, notification, and push manager', async () => {
  const { isPushSupported } = await import('../push-client.js');
  assert.equal(isPushSupported({ navigator: { serviceWorker: {} }, Notification: class {}, PushManager: class {} }), true);
  assert.equal(isPushSupported({ navigator: {}, Notification: class {}, PushManager: class {} }), false);
  assert.equal(isPushSupported({ navigator: { serviceWorker: {} }, Notification: class {} }), false);
});

test('push opt-in state covers hidden, install hint, blocked, done, and button modes', async () => {
  const { getPushOptInState } = await import('../push-client.js');
  assert.equal(getPushOptInState({ supported: true, hasToken: false, permission: 'default', subscribed: false }).mode, 'hidden');
  assert.equal(getPushOptInState({ supported: false, hasToken: true, permission: 'default', subscribed: false }).mode, 'install-hint');
  assert.equal(getPushOptInState({ supported: true, hasToken: true, permission: 'denied', subscribed: false }).mode, 'blocked');
  assert.equal(getPushOptInState({ supported: true, hasToken: true, permission: 'granted', subscribed: true }).mode, 'done');
  const button = getPushOptInState({ supported: true, hasToken: true, permission: 'default', subscribed: false });
  assert.equal(button.mode, 'button');
  assert.equal(button.label, '승인되면 알림 받기');
});

test('application server key decodes from base64url to bytes', async () => {
  const { applicationServerKeyToUint8Array } = await import('../push-client.js');
  const bytes = applicationServerKeyToUint8Array('BAg-_w');
  assert.deepEqual(Array.from(bytes), [4, 8, 62, 255]);
});

test('push registration payload extracts subscription keys and rejects partial input', async () => {
  const { createPushRegistrationPayload } = await import('../push-client.js');
  const subscription = {
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'pk', auth: 'ak' } }),
  };
  assert.deepEqual(
    createPushRegistrationPayload({ meetupId: 'm-1', applicationToken: 't'.repeat(64), subscription }),
    { meetupId: 'm-1', applicationToken: 't'.repeat(64), endpoint: 'https://push.example/abc', p256dh: 'pk', auth: 'ak' },
  );
  assert.equal(
    createPushRegistrationPayload({ meetupId: 'm-1', applicationToken: 't'.repeat(64), subscription: { toJSON: () => ({ endpoint: '', keys: {} }) } }),
    null,
  );
});

test('service worker handles push display and click without any fetch caching', async () => {
  const sw = await readProjectFile('sw.js');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(sw, /openWindow/);
  assert.ok(!/addEventListener\('fetch'/.test(sw), 'sw.js must not intercept fetch (no caching)');
  assert.ok(!/caches\./.test(sw), 'sw.js must not touch the Cache API');
});

test('public submission function and client forward push subscriptions', async () => {
  const fn = await readProjectFile('supabase/functions/create-public-submission/index.ts');
  assert.match(fn, /'push_subscription'/);
  assert.match(fn, /rpc\/register_push_subscription/);
  assert.match(fn, /p_application_token: getText\(payload, 'applicationToken'\)/);
  const client = await readProjectFile('supabase-client.js');
  assert.match(client, /export async function registerPushSubscription/);
  assert.match(client, /callPublicSubmission\('push_subscription'/);
  assert.match(client, /export async function sendApprovalPush/);
  assert.match(client, /functions\/v1\/send-approval-push/);
  assert.match(client, /result\.application \|\| result\.order \|\| result\.subscription/);
});

test('send-approval-push claims atomically, pushes, and prunes dead subscriptions', async () => {
  const fn = await readProjectFile('supabase/functions/send-approval-push/index.ts');
  assert.match(fn, /jsr:@negrel\/webpush/);
  assert.match(fn, /rpc\/claim_approval_push/);
  assert.match(fn, /VAPID_KEYS_JWK/);
  assert.match(fn, /VAPID_SUBJECT/);
  assert.match(fn, /importVapidKeys/);
  assert.match(fn, /ApplicationServer\.new/);
  assert.match(fn, /pushTextMessage/);
  assert.match(fn, /404|410/);
  assert.match(fn, /push_subscriptions\?id=eq\./);
  const config = await readProjectFile('supabase/config.toml');
  assert.match(config, /\[functions\.send-approval-push\]\nverify_jwt = false/);
});

test('approval push summary message covers sent, empty, and already-claimed cases', async () => {
  const { getApprovalPushSummaryMessage } = await import('../admin-status.js');
  assert.equal(getApprovalPushSummaryMessage({ skipped: true }), '신청 상태 승인 저장 완료');
  assert.equal(getApprovalPushSummaryMessage({ claimed: false, sent: 0 }), '신청 상태 승인 저장 완료 · 보낼 알림이 없어요');
  assert.equal(getApprovalPushSummaryMessage({ claimed: true, sent: 2, failed: 0, expired: 0 }), '신청 상태 승인 저장 완료 · 승인 알림 2건 발송');
  assert.equal(getApprovalPushSummaryMessage({ claimed: true, sent: 0, failed: 1, expired: 0 }), '신청 상태 승인 저장 완료 · 알림 발송 실패 1건');
  assert.equal(getApprovalPushSummaryMessage({ claimed: true, sent: 1, failed: 1, expired: 1 }), '신청 상태 승인 저장 완료 · 승인 알림 1건 발송 · 알림 발송 실패 1건');
});

test('frontend wires push opt-in and admin approval send', async () => {
  const main = await readProjectFile('main.js');
  assert.match(main, /from '\.\/push-client\.js\?v=__ASSET_VERSION__'/);
  assert.match(main, /from '\.\/push-config\.js\?v=__ASSET_VERSION__'/);
  assert.match(main, /serviceWorker\.register\('\.\/sw\.js'\)/);
  assert.match(main, /data-push-optin/);
  assert.match(main, /registerPushSubscription/);
  const admin = await readProjectFile('admin.js');
  assert.match(admin, /nextStatus === 'accepted'/);
  assert.match(admin, /sendApprovalPush/);
  assert.match(admin, /getApprovalPushSummaryMessage/);
});

test('pages deploy ships the service worker and push modules', async () => {
  const workflow = await readProjectFile('.github/workflows/deploy-pages.yml');
  assert.match(workflow, /cp sw\.js dist\//);
  assert.match(workflow, /cp push-client\.js dist\//);
  assert.match(workflow, /cp push-config\.js dist\//);
});

test('push migration claims approval sends atomically', async () => {
  const sql = await readProjectFile(MIGRATION);
  assert.match(sql, /add column if not exists approval_notified_at timestamptz/);
  assert.match(sql, /create or replace function public\.claim_approval_push/);
  assert.match(sql, /update public\.applications[\s\S]*?set approval_notified_at = now\(\)[\s\S]*?where[\s\S]*?status = 'accepted'[\s\S]*?approval_notified_at is null[\s\S]*?returning/);
  assert.match(sql, /grant execute on function public\.claim_approval_push\(uuid\) to service_role/);
});

test('rate limiter accepts the push_subscription action', async () => {
  const sql = await readProjectFile('supabase/migrations/20260616000000_allow_push_subscription_rate_limit.sql');

  assert.match(
    sql,
    /drop constraint if exists public_submission_attempts_action_check/,
    'the attempts table check constraint must be rebuilt to accept push_subscription rows',
  );
  assert.match(
    sql,
    /check \(action in \('application', 'toss_order', 'demo_order', 'push_subscription'\)\)/,
  );
  assert.match(sql, /create or replace function public\.assert_public_submission_rate_limit/);
  assert.match(
    sql,
    /if p_action not in \('application', 'toss_order', 'demo_order', 'push_subscription'\) then/,
    'the function allowlist must accept push_subscription, otherwise every push opt-in fails',
  );
  assert.match(sql, /now\(\) - interval '1 hour'/, 'keep the shortened attempt retention from 20260612000000');
});

test('push opt-in renders as a labeled checkbox instead of a ghost button', async () => {
  const main = await readProjectFile('main.js');

  assert.match(main, /data-push-optin-checkbox/);
  assert.match(main, /type="checkbox"/);
  assert.doesNotMatch(main, /data-push-optin-button/, 'the old ghost-button opt-in must be replaced');
  assert.match(
    main,
    /addEventListener\('change'[\s\S]{0,400}data-push-optin-checkbox/,
    'checking the box must trigger the subscription',
  );

  const styles = await readProjectFile('styles.css');
  assert.match(styles, /\.push-optin-toggle/);
  assert.match(styles, /\.push-optin-helper/);
});

test('drawer gathers application form, push opt-in, and payment into one flow section', async () => {
  const main = await readProjectFile('main.js');

  assert.match(
    main,
    /drawer-apply-flow[\s\S]*?\$\{applicationMarkup\}[\s\S]*?aria-label="결제 요약"/,
    'application form (with push opt-in) must sit directly above the payment summary in one section',
  );
  assert.match(
    main,
    /aria-label="결제 요약"[\s\S]*?<\/section>[\s\S]*?\$\{scheduleMarkup\}/,
    'schedule, FAQ, and recommendations move below the consolidated apply flow',
  );
});

test('approval claim is not consumed while there is nothing to send', async () => {
  const sql = await readProjectFile('supabase/migrations/20260617000000_claim_requires_subscription.sql');

  assert.match(sql, /create or replace function public\.claim_approval_push/);
  assert.match(
    sql,
    /and exists \(\s*select 1\s*from public\.push_subscriptions s\s*where s\.application_id = a\.id\s*\)/,
    'claiming with zero subscriptions must not burn approval_notified_at, otherwise a later opt-in can never be notified',
  );
  assert.match(sql, /grant execute on function public\.claim_approval_push\(uuid\) to service_role/);
});

test('payment auto-accept paths trigger the approval push best-effort', async () => {
  const confirmFn = await readProjectFile('supabase/functions/confirm-toss-payment/index.ts');

  assert.match(confirmFn, /functions\/v1\/send-approval-push/);
  assert.match(
    confirmFn,
    /async function notifyApprovalPush[\s\S]*?try \{[\s\S]*?\} catch/,
    'a failed push hop must never fail the payment confirmation',
  );
  assert.match(
    confirmFn,
    /confirmOrderAndPayment\(order, tossPayment\);[\s\S]{0,200}notifyApprovalPush\(/,
    'the push hop runs after the payment is confirmed and the application auto-accepted',
  );

  const submissionFn = await readProjectFile('supabase/functions/create-public-submission/index.ts');

  assert.match(submissionFn, /functions\/v1\/send-approval-push/);
  assert.match(
    submissionFn,
    /async function notifyApprovalPush[\s\S]*?try \{[\s\S]*?\} catch/,
  );
  assert.match(
    submissionFn,
    /action === 'demo_order'[\s\S]{0,200}notifyApprovalPush\(/,
    'demo orders auto-accept their application, so they need the same push hop',
  );
});
