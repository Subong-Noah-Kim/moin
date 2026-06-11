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

test('push migration claims approval sends atomically', async () => {
  const sql = await readProjectFile(MIGRATION);
  assert.match(sql, /add column if not exists approval_notified_at timestamptz/);
  assert.match(sql, /create or replace function public\.claim_approval_push/);
  assert.match(sql, /update public\.applications[\s\S]*?set approval_notified_at = now\(\)[\s\S]*?where[\s\S]*?status = 'accepted'[\s\S]*?approval_notified_at is null[\s\S]*?returning/);
  assert.match(sql, /grant execute on function public\.claim_approval_push\(uuid\) to service_role/);
});
