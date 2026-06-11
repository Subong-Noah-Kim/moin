# Approval Push Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 신청을 승인하면 신청자의 설치된 PWA로 웹 푸시 알림을 1회 보낸다.

**Architecture:** 신청 토큰으로 푸시 구독을 신청서에 연결해 저장하고, 승인 시 admin.js가 `send-approval-push` Edge Function을 호출한다. `claim_approval_push` RPC의 원자적 클레임(`UPDATE ... RETURNING`, accepted + 미발송일 때만)이 중복 발송과 스팸 호출을 구조적으로 차단한다. 서비스 워커는 push/notificationclick 핸들러만 갖는다(fetch 캐싱 없음).

**Tech Stack:** Supabase 마이그레이션 + Edge Functions(Deno, `jsr:@negrel/webpush`), 바닐라 JS(ES 모듈, `?v=__ASSET_VERSION__` 임포트), node:test.

**설계 문서:** `docs/plans/2026-06-12-approval-push-design.md`

**검증된 라이브러리 API** (negrel/webpush README·example에서 확인):
`webpush.importVapidKeys(jwkPairJson, { extractable: false })` → `webpush.ApplicationServer.new({ contactInformation, vapidKeys })` → `appServer.subscribe(subscriptionJson)` → `subscriber.pushTextMessage(text, {})`. 키 생성은 `generateVapidKeys → exportVapidKeys`(JWK 쌍) + `exportApplicationServerKey`(base64url 공개키).

**기존 코드 좌표** (zero-context 작업자용):
- 공개 제출 Edge Function 디스패치: `supabase/functions/create-public-submission/index.ts:19` (`PublicSubmissionAction`), `:114-122` (`getAction`), `:283-285` (분기)
- 프론트 제출 함수: `supabase-client.js:162-196` (`callPublicSubmission` — 응답 `result.application || result.order`만 rows로 받음)
- 신청 성공 지점: `main.js:1149-1151` (`createApplication` → `setApplicationToken`)
- 드로어 신청 폼 템플릿: `main.js:763` (`data-application-form`)
- 관리자 승인 리스너: `admin.js:1060-1072` (`updateAdminApplicationStatus` 성공 → `updateApplicationInOverview`)
- 레이트리밋 헬퍼 시그니처: `assert_public_submission_rate_limit(p_visitor_hash, p_action, p_meetup_id, p_global_limit, p_global_window, p_action_limit, p_action_window)` (`supabase/migrations/20260606080000_public_submission_abuse_controls.sql:23`)
- RPC 스타일 참고: `supabase/migrations/20260613000000_link_orders_to_applications.sql:29-90` (plpgsql security definer, `raise exception 'CODE...'`, revoke/grant service_role)

---

### Task 1: 마이그레이션 — push_subscriptions + RPC 2개

**Files:**
- Create: `supabase/migrations/20260615000000_approval_push_notifications.sql`
- Create: `tests/approvalPush.test.js`

- [ ] **Step 1: 실패하는 계약 테스트 작성**

`tests/approvalPush.test.js` 생성:

```js
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

test('push migration claims approval sends atomically', async () => {
  const sql = await readProjectFile(MIGRATION);
  assert.match(sql, /add column if not exists approval_notified_at timestamptz/);
  assert.match(sql, /create or replace function public\.claim_approval_push/);
  assert.match(sql, /update public\.applications[\s\S]*?set approval_notified_at = now\(\)[\s\S]*?where[\s\S]*?status = 'accepted'[\s\S]*?approval_notified_at is null[\s\S]*?returning/);
  assert.match(sql, /grant execute on function public\.claim_approval_push\(uuid\) to service_role/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 81 tests, 79 pass, 2 fail (ENOENT)

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/20260615000000_approval_push_notifications.sql`:

```sql
-- Approval push notifications.
-- push_subscriptions stores Web Push subscriptions linked to applications via
-- the existing confirmation token idiom. claim_approval_push atomically marks
-- an accepted application as notified and returns its subscriptions, so no
-- call pattern (double click, retry, third-party spam) can exceed one send
-- per approved application.

alter table public.applications
add column if not exists approval_notified_at timestamptz;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_length check (char_length(endpoint) between 1 and 2000),
  constraint push_subscriptions_p256dh_length check (char_length(p256dh) between 1 and 500),
  constraint push_subscriptions_auth_length check (char_length(auth) between 1 and 500)
);

create index if not exists push_subscriptions_application_id_idx
on public.push_subscriptions(application_id);

alter table public.push_subscriptions enable row level security;

create or replace function public.register_push_subscription(
  p_visitor_hash text,
  p_application_token text,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications%rowtype;
  v_subscription public.push_subscriptions%rowtype;
  v_token text := trim(coalesce(p_application_token, ''));
  v_endpoint text := trim(coalesce(p_endpoint, ''));
  v_p256dh text := trim(coalesce(p_p256dh, ''));
  v_auth text := trim(coalesce(p_auth, ''));
begin
  if char_length(v_token) not between 32 and 128 then
    raise exception 'APPLICATION_NOT_FOUND: invalid application token';
  end if;

  if char_length(v_endpoint) not between 1 and 2000
    or char_length(v_p256dh) not between 1 and 500
    or char_length(v_auth) not between 1 and 500 then
    raise exception 'push subscription payload is invalid';
  end if;

  select * into v_application
  from public.applications
  where confirmation_token = v_token
    and status not in ('rejected', 'cancelled');

  if v_application.id is null then
    raise exception 'APPLICATION_NOT_FOUND: no application for token';
  end if;

  perform public.assert_public_submission_rate_limit(
    trim(p_visitor_hash),
    'push_subscription',
    v_application.meetup_id,
    30,
    interval '10 minutes',
    5,
    interval '10 minutes'
  );

  insert into public.push_subscriptions (application_id, endpoint, p256dh, auth)
  values (v_application.id, v_endpoint, v_p256dh, v_auth)
  on conflict (endpoint) do update
  set application_id = excluded.application_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth
  returning * into v_subscription;

  return jsonb_build_object(
    'subscription',
    jsonb_build_object('id', v_subscription.id, 'application_id', v_subscription.application_id)
  );
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text, text) from public;
grant execute on function public.register_push_subscription(text, text, text, text, text) to service_role;

create or replace function public.claim_approval_push(
  p_application_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications%rowtype;
  v_meetup_title text;
  v_subscriptions jsonb;
begin
  update public.applications
  set approval_notified_at = now()
  where id = p_application_id
    and status = 'accepted'
    and approval_notified_at is null
  returning * into v_application;

  if v_application.id is null then
    return jsonb_build_object('claimed', false, 'subscriptions', '[]'::jsonb);
  end if;

  select title into v_meetup_title
  from public.meetups
  where id = v_application.meetup_id;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', s.id,
      'endpoint', s.endpoint,
      'p256dh', s.p256dh,
      'auth', s.auth
    )),
    '[]'::jsonb
  ) into v_subscriptions
  from public.push_subscriptions s
  where s.application_id = v_application.id;

  return jsonb_build_object(
    'claimed', true,
    'meetup_title', coalesce(v_meetup_title, '모임'),
    'subscriptions', v_subscriptions
  );
end;
$$;

revoke all on function public.claim_approval_push(uuid) from public;
grant execute on function public.claim_approval_push(uuid) to service_role;
```

- [ ] **Step 4: 통과 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 81 pass, 0 fail

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/20260615000000_approval_push_notifications.sql tests/approvalPush.test.js
git commit -m "Add push subscription storage and atomic approval claim"
```

---

### Task 2: VAPID 키 생성 스크립트 + push-config.js

**Files:**
- Create: `scripts/generate-vapid-keys.mjs`
- Create: `push-config.js`
- Modify: `tests/approvalPush.test.js` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/approvalPush.test.js`에 추가:

```js
test('push config exposes a base64url VAPID application server key', async () => {
  const { PUSH_APPLICATION_SERVER_KEY } = await import('../push-config.js');
  assert.match(PUSH_APPLICATION_SERVER_KEY, /^[A-Za-z0-9_-]{40,}$/, 'must be base64url without padding');
  const generator = await readProjectFile('scripts/generate-vapid-keys.mjs');
  assert.match(generator, /generateKey\(\s*\{ name: 'ECDSA', namedCurve: 'P-256' \}/);
  assert.match(generator, /base64url/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 82 tests, 1 fail (push-config.js 모듈 없음)

- [ ] **Step 3: 생성 스크립트 작성**

`scripts/generate-vapid-keys.mjs`:

```js
// One-time VAPID key generation. stdout: JWK key pair JSON for the
// VAPID_KEYS_JWK Supabase secret. stderr: the public application server key
// to commit in push-config.js. The private key must never enter the repo.
const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);

const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
const privateKey = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
const rawPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
const applicationServerKey = Buffer.from(rawPublicKey).toString('base64url');

console.log(JSON.stringify({ publicKey, privateKey }));
console.error(`application server key (push-config.js): ${applicationServerKey}`);
```

- [ ] **Step 4: 키 생성 실행 + push-config.js 작성**

Run: `node scripts/generate-vapid-keys.mjs > /tmp/vapid-keys.json`
(stderr에 application server key 출력됨. `/tmp/vapid-keys.json`은 배포 단계에서 secrets로 설정 — 리포에 추가 금지.)

`push-config.js` 생성 (`toss-config.js:1` 패턴, `<application server key>`를 stderr 출력값으로 치환):

```js
export const PUSH_APPLICATION_SERVER_KEY = '<application server key>';
```

- [ ] **Step 5: 통과 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 82 pass, 0 fail

- [ ] **Step 6: 커밋** (`/tmp/vapid-keys.json`이 스테이징에 없는지 확인)

```bash
git status --short
git add scripts/generate-vapid-keys.mjs push-config.js tests/approvalPush.test.js
git commit -m "Add VAPID key tooling and public application server key"
```

---

### Task 3: push-client.js 헬퍼 + 단위 테스트

**Files:**
- Create: `push-client.js`
- Modify: `tests/approvalPush.test.js` (테스트 추가)

- [ ] **Step 1: 실패하는 단위 테스트 추가**

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 86 tests, 4 fail

- [ ] **Step 3: 구현**

`push-client.js`:

```js
export function isPushSupported(env = globalThis) {
  return Boolean(env.navigator?.serviceWorker && env.Notification && env.PushManager);
}

export function getPushOptInState({ supported, hasToken, permission, subscribed }) {
  if (!hasToken) {
    return { mode: 'hidden' };
  }

  if (!supported) {
    return {
      mode: 'install-hint',
      message: '홈 화면에 추가한 moin 앱에서 열면 승인 알림을 받을 수 있어요.',
    };
  }

  if (permission === 'denied') {
    return {
      mode: 'blocked',
      message: '알림이 차단되어 있어요. 기기 설정에서 moin 알림을 허용해주세요.',
    };
  }

  if (subscribed) {
    return { mode: 'done', message: '승인되면 알림으로 알려드릴게요.' };
  }

  return { mode: 'button', label: '승인되면 알림 받기' };
}

export function applicationServerKeyToUint8Array(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);

  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function createPushRegistrationPayload({ meetupId, applicationToken, subscription }) {
  const json = typeof subscription?.toJSON === 'function' ? subscription.toJSON() : subscription || {};
  const keys = json.keys || {};

  if (!meetupId || !applicationToken || !json.endpoint || !keys.p256dh || !keys.auth) {
    return null;
  }

  return {
    meetupId,
    applicationToken,
    endpoint: json.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 86 pass, 0 fail

- [ ] **Step 5: 커밋**

```bash
git add push-client.js tests/approvalPush.test.js
git commit -m "Add push client helpers for opt-in state and subscription payloads"
```

---

### Task 4: sw.js — 푸시 전용 서비스 워커

**Files:**
- Create: `sw.js`
- Modify: `tests/approvalPush.test.js` (테스트 추가)

- [ ] **Step 1: 실패하는 계약 테스트 추가**

```js
test('service worker handles push display and click without any fetch caching', async () => {
  const sw = await readProjectFile('sw.js');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(sw, /openWindow/);
  assert.ok(!/addEventListener\('fetch'/.test(sw), 'sw.js must not intercept fetch (no caching)');
  assert.ok(!/caches\./.test(sw), 'sw.js must not touch the Cache API');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 87 tests, 1 fail (ENOENT sw.js)

- [ ] **Step 3: 구현**

`sw.js`:

```js
self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'moin';
  const options = {
    body: payload.body || '새 소식이 도착했어요.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: payload.url || './' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    if (windowClients[0]) {
      await windowClients[0].focus();
      return;
    }

    await self.clients.openWindow(event.notification.data?.url || './');
  })());
});
```

- [ ] **Step 4: 통과 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 87 pass, 0 fail

- [ ] **Step 5: 커밋**

```bash
git add sw.js tests/approvalPush.test.js
git commit -m "Add push-only service worker"
```

---

### Task 5: 구독 등록 경로 — Edge Function 확장 + supabase-client

**Files:**
- Modify: `supabase/functions/create-public-submission/index.ts:19,114-122,124-134,283-289`
- Modify: `supabase-client.js` (`callPublicSubmission` rows, 신규 export 2개)
- Modify: `tests/approvalPush.test.js` (테스트 추가)

- [ ] **Step 1: 실패하는 계약 테스트 추가**

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 88 tests, 1 fail

- [ ] **Step 3: Edge Function 확장**

`supabase/functions/create-public-submission/index.ts` 변경 4곳:

19행 타입:
```ts
type PublicSubmissionAction = 'application' | 'toss_order' | 'demo_order' | 'push_subscription';
```

`getAction`의 허용 목록:
```ts
  if (!['application', 'toss_order', 'demo_order', 'push_subscription'].includes(action)) {
```

`createApplication` 함수 아래에 추가:
```ts
async function registerPushSubscription(payload: Record<string, unknown>, visitorHash: string) {
  return supabaseRequest('rpc/register_push_subscription', {
    method: 'POST',
    body: JSON.stringify({
      p_visitor_hash: visitorHash,
      p_application_token: getText(payload, 'applicationToken'),
      p_endpoint: getText(payload, 'endpoint'),
      p_p256dh: getText(payload, 'p256dh'),
      p_auth: getText(payload, 'auth'),
    }),
  });
}
```

`handleRequest`의 분기:
```ts
    let result;
    if (action === 'application') {
      result = await createApplication(payload, visitorHash);
    } else if (action === 'push_subscription') {
      result = await registerPushSubscription(payload, visitorHash);
    } else {
      result = await createOrder(action, payload, visitorHash);
    }
```

- [ ] **Step 4: supabase-client.js 확장**

`callPublicSubmission`의 rows 한 줄 수정 (`supabase-client.js:194` 부근):
```js
    rows: [result.application || result.order || result.subscription].filter(Boolean),
```

`createTossPendingOrder` export 아래에 추가:
```js
export async function registerPushSubscription({ meetupId, applicationToken, endpoint, p256dh, auth }) {
  return callPublicSubmission('push_subscription', {
    meetupId,
    applicationToken,
    endpoint,
    p256dh,
    auth,
  });
}

export async function sendApprovalPush(applicationId) {
  if (!isSupabaseConfigured()) {
    return { skipped: true, claimed: false, sent: 0 };
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/send-approval-push`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ applicationId }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message.text);
  }

  const body = await response.json();

  return { skipped: false, ...(body?.result || {}) };
}
```

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 88 pass, 0 fail

```bash
git add supabase/functions/create-public-submission/index.ts supabase-client.js tests/approvalPush.test.js
git commit -m "Route push subscription registration through the public submission function"
```

---

### Task 6: send-approval-push Edge Function

**Files:**
- Create: `supabase/functions/send-approval-push/index.ts`
- Modify: `supabase/config.toml` (함수 항목 추가)
- Modify: `tests/approvalPush.test.js` (테스트 추가)

- [ ] **Step 1: 실패하는 계약 테스트 추가**

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 89 tests, 1 fail

- [ ] **Step 3: 함수 구현**

`supabase/functions/send-approval-push/index.ts` (CORS·헬퍼는 `create-public-submission/index.ts:1-74`와 동일 패턴):

```ts
import * as webpush from 'jsr:@negrel/webpush';

const allowedOrigins = new Set([
  'https://subong-noah-kim.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const defaultAllowedOrigin = 'https://subong-noah-kim.github.io';

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';

  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : defaultAllowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

async function readJson(response: Response) {
  const bodyText = await response.text();

  try {
    return bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return bodyText;
  }
}

async function supabaseRequest(path: string, options: RequestInit = {}) {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const headers = new Headers(options.headers);

  headers.set('apikey', serviceRoleKey);
  headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers,
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      typeof body === 'string'
        ? body
        : body?.message || `Supabase request failed: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  return body;
}

let appServerPromise: Promise<webpush.ApplicationServer> | null = null;

function getApplicationServer() {
  if (!appServerPromise) {
    appServerPromise = (async () => {
      const exportedKeys = JSON.parse(getRequiredEnv('VAPID_KEYS_JWK'));
      const vapidKeys = await webpush.importVapidKeys(exportedKeys, { extractable: false });

      return webpush.ApplicationServer.new({
        contactInformation: getRequiredEnv('VAPID_SUBJECT'),
        vapidKeys,
      });
    })();
  }

  return appServerPromise;
}

type ClaimedSubscription = { id: string; endpoint: string; p256dh: string; auth: string };

function getPushErrorStatus(error: unknown) {
  const candidate = (error as { response?: { status?: number }; status?: number }) || {};
  const status = candidate.response?.status ?? candidate.status;

  if (typeof status === 'number') {
    return status;
  }

  const message = error instanceof Error ? error.message : '';
  if (message.includes('404')) return 404;
  if (message.includes('410')) return 410;

  return 0;
}

async function deleteSubscription(id: string) {
  await supabaseRequest(`push_subscriptions?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

async function handleRequest(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok');
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const payload = await request.json();
    const applicationId = String(payload.applicationId || '').trim();

    if (!applicationId) {
      return jsonResponse({ error: 'applicationId is required.' }, 400);
    }

    const claim = await supabaseRequest('rpc/claim_approval_push', {
      method: 'POST',
      body: JSON.stringify({ p_application_id: applicationId }),
    });

    if (!claim?.claimed) {
      return jsonResponse({ ok: true, result: { claimed: false, sent: 0, failed: 0, expired: 0 } });
    }

    const appServer = await getApplicationServer();
    const subscriptions = (claim.subscriptions || []) as ClaimedSubscription[];
    const message = JSON.stringify({
      title: '신청이 승인되었어요',
      body: `${claim.meetup_title} 신청이 승인되었습니다. 모임에서 만나요!`,
      url: './',
    });

    let sent = 0;
    let failed = 0;
    let expired = 0;

    for (const subscription of subscriptions) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        });
        await subscriber.pushTextMessage(message, {});
        sent += 1;
      } catch (error) {
        const status = getPushErrorStatus(error);

        if (status === 404 || status === 410) {
          expired += 1;
          await deleteSubscription(subscription.id).catch((cleanupError) => {
            console.error('failed to prune expired subscription', cleanupError);
          });
        } else {
          failed += 1;
          console.error('push send failed', error);
        }
      }
    }

    return jsonResponse({ ok: true, result: { claimed: true, sent, failed, expired } });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: '승인 알림 발송에 실패했습니다.' }, 500);
  }
}

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);
  const response = await handleRequest(request);

  Object.entries(corsHeaders).forEach(([name, value]) => {
    response.headers.set(name, value);
  });

  return response;
});
```

- [ ] **Step 4: config.toml에 추가**

`supabase/config.toml` 끝에:

```toml

[functions.send-approval-push]
verify_jwt = false
```

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 89 pass, 0 fail

```bash
git add supabase/functions/send-approval-push/index.ts supabase/config.toml tests/approvalPush.test.js
git commit -m "Add approval push send function with atomic claim and pruning"
```

---

### Task 7: 프론트 연결 — main.js 옵트인 + admin.js 발송

**Files:**
- Modify: `main.js` (임포트, SW 등록, 드로어 템플릿, 옵트인 렌더/클릭, 신청 성공 갱신)
- Modify: `admin.js:1060-1072` (승인 시 발송)
- Modify: `admin-status.js` (요약 메시지 헬퍼)
- Modify: `styles.css` (옵트인 블록 최소 스타일)
- Modify: `tests/approvalPush.test.js` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 91 tests, 2 fail

- [ ] **Step 3: admin-status.js 헬퍼 추가**

`admin-status.js` 끝에:

```js
export function getApprovalPushSummaryMessage(summary) {
  const base = '신청 상태 승인 저장 완료';

  if (!summary || summary.skipped) {
    return base;
  }

  if (!summary.claimed) {
    return `${base} · 보낼 알림이 없어요`;
  }

  const parts = [];
  if (summary.sent > 0) parts.push(`승인 알림 ${summary.sent}건 발송`);
  if (summary.failed > 0) parts.push(`알림 발송 실패 ${summary.failed}건`);
  if (!parts.length) parts.push('보낼 알림이 없어요');

  return [base, ...parts].join(' · ');
}
```

(claimed=true·sent=0·failed=0은 구독이 모두 만료(expired)였거나 없던 클레임 — "보낼 알림이 없어요"로 수렴.)

- [ ] **Step 4: admin.js 승인 후 발송**

`admin.js`의 신청 상태 리스너 성공 분기(1060-1067행 부근)를 다음으로 교체:

```js
    const updatedApplication = await updateAdminApplicationStatus(
      activeSession.accessToken,
      applicationId,
      nextStatus,
    );
    updateApplicationInOverview(updatedApplication);

    if (nextStatus === 'accepted') {
      syncStatus.textContent = '신청 상태 승인 저장 완료 · 알림 확인 중';

      try {
        const pushSummary = await sendApprovalPush(applicationId);
        syncStatus.textContent = getApprovalPushSummaryMessage(pushSummary);
      } catch (pushError) {
        console.error(pushError);
        syncStatus.textContent = '신청 상태 승인 저장 완료 · 알림 발송 확인 실패';
      }
    } else {
      syncStatus.textContent = `신청 상태 ${getApplicationStatusLabel(nextStatus)} 저장 완료`;
    }
```

admin.js 상단 임포트에 `sendApprovalPush`(supabase-client.js), `getApprovalPushSummaryMessage`(admin-status.js)를 기존 임포트 블록 스타일로 추가.

- [ ] **Step 5: main.js 연결**

(a) 상단 임포트 추가:

```js
import {
  applicationServerKeyToUint8Array,
  createPushRegistrationPayload,
  getPushOptInState,
  isPushSupported,
} from './push-client.js?v=__ASSET_VERSION__';
import { PUSH_APPLICATION_SERVER_KEY } from './push-config.js?v=__ASSET_VERSION__';
```

supabase-client 임포트 블록에 `registerPushSubscription` 추가.

(b) 상태 셋 선언부(`momentclub:paid` 부근, main.js:288)에 추가:

```js
const pushOptedIn = readPublicStringSet('momentclub:push-optin');
```

(c) 파일 하단 초기화 영역에 SW 등록(실패 가드):

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.warn('service worker registration failed', error);
  });
}
```

(d) 드로어 템플릿(main.js:763 `data-application-form` 폼 닫는 태그 직후)에 추가:

```js
      <div class="push-optin" data-push-optin="${escapeAttribute(item.id)}"></div>
```

(e) 옵트인 렌더 함수 (드로어 갱신 헬퍼들 부근에 추가) + 신청 성공/드로어 열기에서 호출:

```js
function renderPushOptIn(item) {
  const container = drawerContent?.querySelector(`[data-push-optin="${CSS.escape(item.id)}"]`);
  if (!container) return;

  const state = getPushOptInState({
    supported: isPushSupported(),
    hasToken: hasStoredApplication(item.id),
    permission: typeof Notification === 'undefined' ? 'default' : Notification.permission,
    subscribed: pushOptedIn.has(item.id),
  });

  if (state.mode === 'hidden') {
    container.hidden = true;
    container.textContent = '';
    return;
  }

  container.hidden = false;

  if (state.mode === 'button') {
    container.innerHTML = `<button class="ghost-button" type="button" data-push-optin-button="${escapeAttribute(item.id)}">${escapeHtml(state.label)}</button>`;
    return;
  }

  container.textContent = state.message;
}

async function subscribeToApprovalPush(item, button) {
  button.disabled = true;

  try {
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      renderPushOptIn(item);
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription()
      || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKeyToUint8Array(PUSH_APPLICATION_SERVER_KEY),
      });
    const payload = createPushRegistrationPayload({
      meetupId: item.id,
      applicationToken: getApplicationToken(item.id),
      subscription,
    });

    if (!payload) {
      showToast('알림 구독 정보를 만들지 못했어요. 잠시 후 다시 시도해주세요.');
      return;
    }

    await registerPushSubscription(payload);
    pushOptedIn.add(item.id);
    persist('momentclub:push-optin', pushOptedIn);
    showToast('승인되면 알림으로 알려드릴게요.');
  } catch (error) {
    console.error(error);
    showToast('알림 신청에 실패했어요. 잠시 후 다시 시도해주세요.');
  } finally {
    button.disabled = false;
    renderPushOptIn(item);
  }
}
```

문서 click 위임 리스너(main.js:1190 부근 `[data-checkout]` 분기들 옆)에 추가:

```js
  const pushButton = event.target.closest('[data-push-optin-button]');
  if (pushButton) {
    const item = meetups.find((meetup) => meetup.id === pushButton.dataset.pushOptinButton);
    if (item) subscribeToApprovalPush(item, pushButton);
    return;
  }
```

`submitApplication` 성공 분기(`refreshDrawerPaymentSummary(item);` 다음)와 드로어를 여는 렌더 경로(`refreshDrawerPaymentSummary` 호출부와 같은 곳)에 `renderPushOptIn(item);` 추가.

(f) `styles.css`의 드로어/폼 스타일 부근에 추가:

```css
.push-optin {
  margin-top: 12px;
  font-size: 0.9rem;
  color: var(--muted);
}

.push-optin[hidden] {
  display: none;
}
```

주의: main.js는 `persistPublicStringSet`을 `persist`라는 별칭으로 임포트한다(main.js:25) — 위 코드의 `persist(...)`가 그것이다. `readPublicStringSet`·`escapeAttribute`·`escapeHtml`·`showToast`·`drawerContent`도 main.js에 이미 존재한다. `renderPushOptIn`를 드로어 열기 경로에 연결할 때는 기존 `refreshDrawerPaymentSummary(item)` 호출 지점을 grep해서 같은 자리에 나란히 추가한다.

- [ ] **Step 6: 통과 확인 + 스모크**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 91 pass, 0 fail

Run: `npm run smoke:browser 2>&1 | tail -5`
Expected: `✓ browser smoke checks passed` (SW 등록은 localhost 보안 컨텍스트에서 무해, 실패해도 가드됨)

- [ ] **Step 7: 커밋**

```bash
git add main.js admin.js admin-status.js styles.css tests/approvalPush.test.js
git commit -m "Wire push opt-in into the drawer and send approval pushes from admin"
```

---

### Task 8: 배포 복사 목록

**Files:**
- Modify: `.github/workflows/deploy-pages.yml` (cp 목록)
- Modify: `tests/approvalPush.test.js` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test('pages deploy ships the service worker and push modules', async () => {
  const workflow = await readProjectFile('.github/workflows/deploy-pages.yml');
  assert.match(workflow, /cp sw\.js dist\//);
  assert.match(workflow, /cp push-client\.js dist\//);
  assert.match(workflow, /cp push-config\.js dist\//);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 92 tests, 1 fail

- [ ] **Step 3: 워크플로 수정**

`.github/workflows/deploy-pages.yml`의 `cp manifest.webmanifest dist/` 줄 다음에 추가:

```yaml
          cp sw.js dist/
          cp push-client.js dist/
          cp push-config.js dist/
```

(`sw.js`는 `*.js`라서 `__ASSET_VERSION__` sed 치환 대상이지만 플레이스홀더가 없으므로 무변화. SW URL 자체에는 `?v=`를 붙이지 않는다 — 워커 URL이 바뀌면 새 워커로 재설치되기 때문.)

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 92 pass, 0 fail

```bash
git add .github/workflows/deploy-pages.yml tests/approvalPush.test.js
git commit -m "Ship service worker and push modules in pages deploy"
```

---

### Task 9: 로컬 검증 + README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: dev 서버 응답 확인**

```bash
PORT=5181 node server.js &
sleep 1
curl -sI http://localhost:5181/sw.js | head -2
curl -sI http://localhost:5181/push-client.js | head -2
kill %1
```

Expected: 둘 다 `HTTP/1.1 200`, `Content-Type: text/javascript`

- [ ] **Step 2: 전체 테스트 + 스모크 최종 확인**

```bash
npm test
npm run smoke:browser
```

Expected: 92 pass 0 fail, 스모크 통과

- [ ] **Step 3: README 갱신 + 커밋**

`README.md` "## 포함된 기능" 목록 끝(`- 홈 화면 설치(PWA manifest)` 다음)에:

```markdown
- 신청 승인 웹 푸시 알림
```

```bash
git add README.md
git commit -m "Document approval push notifications"
```

---

### Task 10: 배포 (사용자 확인 게이트 포함)

코드 작업이 아니라 운영 절차다. 설계 문서의 무중단 순서를 따른다. **각 단계 전에 사용자에게 진행 여부를 확인한다** (실DB·secrets·운영 배포).

- [ ] **Step 1: 마이그레이션 적용** — `supabase db push` (프로젝트 `jqnnolsyvynrhjvfmege`)
- [ ] **Step 2: secrets 설정** — `supabase secrets set VAPID_KEYS_JWK="$(cat /tmp/vapid-keys.json)" VAPID_SUBJECT="mailto:subong@shinsegae.com"`
- [ ] **Step 3: 함수 배포** — `supabase functions deploy send-approval-push --no-verify-jwt && supabase functions deploy create-public-submission --no-verify-jwt`
- [ ] **Step 4: 프론트 배포** — main 푸시 → Pages 워크플로 성공 확인 → 운영 URL에서 `sw.js`/`push-config.js` 200 확인
- [ ] **Step 5: 실기기 검증 (사용자)** — 아이폰 설치 PWA에서: 신청 제출 → "승인되면 알림 받기" → 권한 허용 → 관리자 화면에서 해당 신청 승인 → 알림 수신 확인. 관리자 화면에는 "승인 알림 1건 발송" 표시.
- [ ] **Step 6: 중복 방지 확인** — 같은 신청을 다른 상태로 바꿨다가 다시 승인해도 알림이 다시 가지 않는 것 확인(클레임 플래그).

---

## 셀프리뷰 노트

- 스펙 커버리지: 마이그레이션(T1), VAPID(T2), 헬퍼(T3), SW(T4), 구독 등록 경로(T5), 발송 함수(T6), 옵트인 UI+관리자(T7), 배포 목록(T8), 검증(T9), 롤아웃(T10) — 설계 문서 산출물 전부 매핑됨.
- 타입 일관성: `registerPushSubscription` 클라이언트 페이로드 키(meetupId/applicationToken/endpoint/p256dh/auth) = Edge Function `getText` 키 = RPC 파라미터 순서. `sendApprovalPush` 반환 `{claimed, sent, failed, expired}` = `getApprovalPushSummaryMessage` 입력.
- 의도된 단순화: 옵트인 상태는 로컬 셋(`momentclub:push-optin`) 기준 — 기기 간 동기화 안 함(같은 신청을 다른 기기에서 또 구독하면 둘 다 알림, 정상). iOS 설치 안내는 텍스트만(설치 유도 모달은 범위 밖).
