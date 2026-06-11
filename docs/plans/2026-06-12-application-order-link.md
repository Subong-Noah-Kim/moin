# 신청 → 결제 연결 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 신청서(`applications`)와 주문(`orders`)을 확인 토큰으로 연결해, 결제 전 신청을 필수화하고 결제 완료 시 신청을 자동 승인한다.

**Architecture:** 신청 생성 시 서버가 64자 토큰을 발급해 브라우저 localStorage에 보관, 결제 시 토큰을 제출하면 RPC가 신청서를 찾아 `orders.application_id`로 연결한다. 2단계 마이그레이션(선택→필수)으로 무중단 롤아웃한다. 설계 문서: `docs/plans/2026-06-12-application-order-link-design.md`

**Tech Stack:** Supabase(plpgsql RPC, Deno Edge Function), 바닐라 JS ES 모듈, node --test

**작업 위치:** 이 저장소는 main 직접 커밋 + push-시-Pages-배포 컨벤션을 따른다. 단, **git push는 Task 7 완료 후 한 번만** 한다(중간 push는 미완성 프론트를 배포함). DB 적용(`db push`)과 함수 배포 시점은 각 태스크에 명시된 순서를 반드시 지킨다.

**기존 테스트 패턴:** `tests/paymentSecurity.test.js` — 헬퍼 단위 테스트 + 소스 계약(regex) 테스트 + 모의 글로벌 통합 테스트. 모든 태스크는 RED(테스트 실패 확인) → GREEN(구현) → 커밋 순서.

---

### Task 1: 1차 마이그레이션 — 토큰 발급 + 선택적 연결

**Files:**
- Create: `supabase/migrations/20260613000000_link_orders_to_applications.sql`
- Test: `tests/paymentSecurity.test.js` (소스 계약 테스트 추가)

**Step 1: 실패하는 테스트 작성** — `tests/paymentSecurity.test.js`의 `test('admin tables collapse...` 직전에 추가:

```js
test('link migration issues application tokens and optionally links orders', async () => {
  const migration = await readProjectFile('../supabase/migrations/20260613000000_link_orders_to_applications.sql');

  assert.match(migration, /add column if not exists confirmation_token text/);
  assert.match(migration, /add column if not exists application_id uuid references public\.applications\(id\) on delete set null/);
  assert.match(migration, /create unique index if not exists applications_confirmation_token_idx/);
  assert.match(migration, /p_application_token text default null/);
  assert.match(migration, /APPLICATION_NOT_FOUND/);
  assert.match(migration, /APPLICATION_MEETUP_MISMATCH/);
  assert.match(migration, /APPLICATION_NOT_PAYABLE/);
  assert.match(migration, /APPLICATION_ALREADY_PAID/);
  assert.match(migration, /status in \('submitted', 'reviewing'\)/, 'auto-accept must not resurrect rejected applications');
  assert.match(migration, /drop function if exists public\.create_public_order\(text, text, text, text, text, text, text\)/, 'old 7-arg overload must be dropped to avoid PostgREST ambiguity');
});
```

**Step 2: RED 확인** — `node --test --test-name-pattern="link migration"` → FAIL (ENOENT)

**Step 3: 마이그레이션 작성** — 라이브 RPC 본문은 `20260607010000_capacity_rpc_guards.sql`이 최신이다. 그 본문을 기반으로 작성한다 (capacity 가드·rate limit·expires_at 유지):

```sql
-- 신청 확인 토큰과 주문-신청 연결.
-- 이 단계에서 p_application_token은 선택이다(구버전 프론트 무중단).
-- 필수 전환은 후속 잠금 마이그레이션에서 한다.

alter table public.applications
add column if not exists confirmation_token text;

alter table public.applications
drop constraint if exists applications_confirmation_token_length;

alter table public.applications
add constraint applications_confirmation_token_length
check (confirmation_token is null or char_length(confirmation_token) between 32 and 128);

create unique index if not exists applications_confirmation_token_idx
on public.applications(confirmation_token)
where confirmation_token is not null;

alter table public.orders
add column if not exists application_id uuid references public.applications(id) on delete set null;

create index if not exists orders_application_id_idx
on public.orders(application_id)
where application_id is not null;

create or replace function public.create_public_application(
  p_visitor_hash text,
  p_meetup_id text,
  p_applicant_name text,
  p_interest text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups%rowtype;
  v_application public.applications%rowtype;
  v_name text := trim(coalesce(p_applicant_name, ''));
  v_interest text := trim(coalesce(p_interest, ''));
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if char_length(v_name) not between 1 and 80 then
    raise exception 'applicant name must be between 1 and 80 characters';
  end if;

  if char_length(v_interest) not between 1 and 500 then
    raise exception 'interest must be between 1 and 500 characters';
  end if;

  perform public.expire_stale_pending_orders(100);

  v_meetup := public.assert_meetup_can_register(p_meetup_id);

  perform public.assert_public_submission_rate_limit(
    trim(p_visitor_hash),
    'application',
    v_meetup.id,
    20,
    interval '10 minutes',
    2,
    interval '10 minutes'
  );

  insert into public.applications (
    meetup_id,
    applicant_name,
    interest,
    source,
    confirmation_token
  ) values (
    v_meetup.id,
    v_name,
    v_interest,
    'edge-function',
    v_token
  )
  returning * into v_application;

  return jsonb_build_object('application', to_jsonb(v_application));
end;
$$;

revoke all on function public.create_public_application(text, text, text, text) from public;
grant execute on function public.create_public_application(text, text, text, text) to service_role;

-- 파라미터 추가는 새 오버로드를 만들기 때문에 기존 7-인자 함수를 먼저 제거한다.
-- (남겨두면 PostgREST 호출이 ambiguous 에러를 낸다)
drop function if exists public.create_public_order(text, text, text, text, text, text, text);

create or replace function public.create_public_order(
  p_visitor_hash text,
  p_action text,
  p_meetup_id text,
  p_buyer_name text,
  p_payment_method text,
  p_provider_order_id text default null,
  p_checkout_token text default null,
  p_application_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups%rowtype;
  v_order public.orders%rowtype;
  v_application public.applications%rowtype;
  v_action text := trim(coalesce(p_action, ''));
  v_buyer_name text := nullif(trim(coalesce(p_buyer_name, '')), '');
  v_payment_method text := nullif(trim(coalesce(p_payment_method, '')), '');
  v_provider_order_id text := nullif(trim(coalesce(p_provider_order_id, '')), '');
  v_checkout_token text := nullif(trim(coalesce(p_checkout_token, '')), '');
  v_application_token text := nullif(trim(coalesce(p_application_token, '')), '');
begin
  if v_action not in ('toss_order', 'demo_order') then
    raise exception 'unsupported public order action';
  end if;

  if v_buyer_name is not null and char_length(v_buyer_name) > 80 then
    raise exception 'buyer name must be 80 characters or shorter';
  end if;

  if v_payment_method is not null and char_length(v_payment_method) > 80 then
    raise exception 'payment method must be 80 characters or shorter';
  end if;

  if v_action = 'toss_order' then
    if v_provider_order_id is null or char_length(v_provider_order_id) not between 8 and 120 then
      raise exception 'provider order id is required';
    end if;

    if v_checkout_token is null or char_length(v_checkout_token) not between 32 and 128 then
      raise exception 'checkout token is required';
    end if;
  else
    v_provider_order_id := null;
    v_checkout_token := null;
  end if;

  perform public.expire_stale_pending_orders(100);

  if v_application_token is not null then
    select *
    into v_application
    from public.applications
    where confirmation_token = v_application_token
    for update;

    if not found then
      raise exception 'APPLICATION_NOT_FOUND';
    end if;

    if v_application.meetup_id <> trim(coalesce(p_meetup_id, '')) then
      raise exception 'APPLICATION_MEETUP_MISMATCH';
    end if;

    if v_application.status in ('rejected', 'cancelled') then
      raise exception 'APPLICATION_NOT_PAYABLE';
    end if;

    -- 같은 신청서의 미결 pending 주문을 정리해 좌석 이중 점유를 막는다.
    update public.orders
    set status = 'cancelled'
    where application_id = v_application.id
      and status = 'pending';
  end if;

  v_meetup := public.assert_meetup_can_register(p_meetup_id);

  if v_application.id is not null then
    perform 1
    from public.orders
    where application_id = v_application.id
      and status in ('paid', 'demo_paid');

    if found then
      raise exception 'APPLICATION_ALREADY_PAID';
    end if;
  end if;

  perform public.assert_public_submission_rate_limit(
    trim(p_visitor_hash),
    v_action,
    v_meetup.id,
    20,
    interval '10 minutes',
    5,
    interval '5 minutes'
  );

  insert into public.orders (
    meetup_id,
    buyer_name,
    amount,
    currency,
    status,
    provider,
    payment_method,
    provider_order_id,
    checkout_token,
    expires_at,
    source,
    application_id
  ) values (
    v_meetup.id,
    v_buyer_name,
    v_meetup.price_amount,
    'KRW',
    case when v_action = 'toss_order' then 'pending' else 'demo_paid' end,
    case when v_action = 'toss_order' then 'tosspayments' else 'demo' end,
    v_payment_method,
    v_provider_order_id,
    v_checkout_token,
    case when v_action = 'toss_order' then now() + interval '30 minutes' else null end,
    case when v_action = 'toss_order' then 'toss-test-edge' else 'github-pages-demo-edge' end,
    v_application.id
  )
  returning * into v_order;

  -- 데모 주문은 생성 즉시 demo_paid이므로 이 시점에 자동 승인한다.
  if v_action = 'demo_order' and v_application.id is not null then
    update public.applications
    set status = 'accepted'
    where id = v_application.id
      and status in ('submitted', 'reviewing');
  end if;

  return jsonb_build_object('order', to_jsonb(v_order) - 'checkout_token');
end;
$$;

revoke all on function public.create_public_order(text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_public_order(text, text, text, text, text, text, text, text) to service_role;

create or replace function public.confirm_toss_payment_order(
  p_order_id uuid,
  p_payment_method text,
  p_provider_payment_key text,
  p_paid_at timestamptz,
  p_raw_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
begin
  -- (20260607010000 본문 전체를 그대로 유지하고, status를 paid로 바꾸는
  --  `if v_order.status = 'pending' then ... end if;` 블록 바로 뒤에 아래를 추가)
  --
  -- if v_order.application_id is not null then
  --   update public.applications
  --   set status = 'accepted'
  --   where id = v_order.application_id
  --     and status in ('submitted', 'reviewing');
  -- end if;
  --
  -- 실제 파일에는 주석이 아니라 전체 본문을 복사해 넣는다.
end;
$$;
```

> **주의:** `confirm_toss_payment_order`는 위 주석 형태가 아니라 `20260607010000_capacity_rpc_guards.sql:156-271`의 본문 전체를 복사한 뒤 paid 전환 블록 직후에 자동 승인 update를 끼워 넣는다. 잠금 순서가 confirm(order→application)과 create(application→meetup→orders)로 달라 이론상 드문 데드락이 가능하지만, Postgres가 감지해 한쪽을 중단시키고 클라이언트 재시도로 해소되므로 수용한다(설계 문서 참조).

**Step 4: GREEN 확인** — `npm test` → 전체 PASS

**Step 5: 커밋**

```bash
git add supabase/migrations/20260613000000_link_orders_to_applications.sql tests/paymentSecurity.test.js
git commit -m "Issue application tokens and optionally link orders"
```

**Step 6: DB 적용** — `npx supabase db push` → `20260613000000` 1건만 적용되는지 프롬프트에서 확인 후 진행. 적용 후 라이브 동작 확인:

```bash
# 구버전 함수(토큰 없는 호출)가 여전히 동작하는지 — 존재하지 않는 모임으로 400 확인
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"action":"application","meetupId":"nonexistent-check","name":"v","interest":"v"}' \
  https://jqnnolsyvynrhjvfmege.supabase.co/functions/v1/create-public-submission
# 기대: {"error":"신청 가능한 모임을 찾지 못했습니다.","code":"MEETUP_NOT_FOUND"} HTTP 400
```

---

### Task 2: 엣지 함수 — 토큰 전달과 에러 매핑

**Files:**
- Modify: `supabase/functions/create-public-submission/index.ts` (createOrder, getErrorStatus, getErrorCode, getErrorMessage)
- Test: `tests/paymentSecurity.test.js`

**Step 1: 실패하는 테스트 작성**

```js
test('public submission function forwards application tokens and maps link errors', async () => {
  const edgeFunction = await readProjectFile('../supabase/functions/create-public-submission/index.ts');

  assert.match(edgeFunction, /p_application_token/);
  assert.match(edgeFunction, /applicationToken/);
  assert.match(edgeFunction, /APPLICATION_NOT_FOUND/);
  assert.match(edgeFunction, /APPLICATION_ALREADY_PAID/);
  assert.match(edgeFunction, /APPLICATION_NOT_PAYABLE/);
  assert.match(edgeFunction, /APPLICATION_MEETUP_MISMATCH/);
});
```

**Step 2: RED 확인** — `node --test --test-name-pattern="forwards application tokens"` → FAIL

**Step 3: 구현**

`createOrder`의 RPC body에 추가:

```ts
      p_checkout_token: getText(payload, 'checkoutToken') || null,
      p_application_token: getText(payload, 'applicationToken') || null,
```

`getErrorStatus`에 추가 (기존 409 분기 위):

```ts
  if (message.includes('APPLICATION_NOT_FOUND')) {
    return 404;
  }

  if (
    message.includes('APPLICATION_ALREADY_PAID') ||
    message.includes('APPLICATION_NOT_PAYABLE') ||
    message.includes('APPLICATION_MEETUP_MISMATCH')
  ) {
    return 409;
  }
```

`getErrorCode`: 같은 4개 코드를 그대로 반환하는 분기 추가. `getErrorMessage`:

```ts
  if (message.includes('APPLICATION_NOT_FOUND')) {
    return '신청 내역을 찾지 못했습니다. 신청서를 다시 제출해 주세요.';
  }

  if (message.includes('APPLICATION_ALREADY_PAID')) {
    return '이미 결제가 완료된 신청입니다.';
  }

  if (message.includes('APPLICATION_NOT_PAYABLE')) {
    return '이 신청은 결제할 수 없는 상태입니다. 운영자에게 문의해 주세요.';
  }

  if (message.includes('APPLICATION_MEETUP_MISMATCH')) {
    return '신청한 모임과 결제하려는 모임이 다릅니다.';
  }
```

**Step 4: GREEN 확인** — `npm test` → 전체 PASS

**Step 5: 커밋 + 함수 배포**

```bash
git add supabase/functions/create-public-submission/index.ts tests/paymentSecurity.test.js
git commit -m "Forward application tokens through the submission function"
npx supabase functions deploy create-public-submission --no-verify-jwt
```

배포 후 Task 1 Step 6과 같은 curl로 무회귀 확인.

---

### Task 3: public-storage.js — 토큰 맵 헬퍼

**Files:**
- Modify: `public-storage.js`
- Test: `tests/paymentSecurity.test.js`

**Step 1: 실패하는 테스트 작성** — 기존 `readPublicStringSet` 테스트 패턴(`createMemoryStorage` 사용)을 따른다:

```js
test('public string map helpers persist and recover meetup token maps', () => {
  const globals = snapshotGlobals(['localStorage']);
  globalThis.localStorage = createMemoryStorage({
    'momentclub:application-tokens': JSON.stringify({ 'salon-night': 'a'.repeat(64) }),
    'momentclub:broken-map': '"not-an-object"',
  });

  try {
    const map = readPublicStringMap('momentclub:application-tokens');
    assert.equal(map.get('salon-night'), 'a'.repeat(64));

    map.set('dating-values', 'b'.repeat(64));
    persistPublicStringMap('momentclub:application-tokens', map);
    assert.deepEqual(
      JSON.parse(globalThis.localStorage.getItem('momentclub:application-tokens')),
      { 'salon-night': 'a'.repeat(64), 'dating-values': 'b'.repeat(64) },
    );

    assert.equal(readPublicStringMap('momentclub:broken-map').size, 0, 'corrupted state recovers to empty map');

    const oversized = new Map([['k', 'x'.repeat(publicStateMaxValueLength + 1)]]);
    persistPublicStringMap('momentclub:oversized', oversized);
    assert.equal(readPublicStringMap('momentclub:oversized').size, 0, 'over-length values are dropped');
  } finally {
    restoreGlobals(globals);
  }
});
```

import 블록의 `public-storage.js` 항목에 `persistPublicStringMap, readPublicStringMap` 추가.

**Step 2: RED 확인** — export 부재로 모듈 로드 실패 확인

**Step 3: 구현** — `public-storage.js`에 추가 (기존 `publicStateMaxItems`/`publicStateMaxValueLength` 상수 재사용):

```js
export function readPublicStringMap(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return new Map();
    }

    return new Map(
      Object.entries(parsed)
        .filter(([key, value]) =>
          typeof key === 'string'
          && key.length <= publicStateMaxValueLength
          && typeof value === 'string'
          && value.length > 0
          && value.length <= publicStateMaxValueLength)
        .slice(0, publicStateMaxItems),
    );
  } catch {
    return new Map();
  }
}

export function persistPublicStringMap(storageKey, map) {
  try {
    const entries = [...map.entries()]
      .filter(([key, value]) =>
        typeof key === 'string'
        && key.length <= publicStateMaxValueLength
        && typeof value === 'string'
        && value.length > 0
        && value.length <= publicStateMaxValueLength)
      .slice(0, publicStateMaxItems);

    localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // storage unavailable: keep in-memory state only
  }
}
```

> 구현 전 `public-storage.js`를 읽고 상수가 export되어 있는지·기존 헬퍼의 에러 처리 방식과 일치하는지 확인할 것.

**Step 4: GREEN 확인 → Step 5: 커밋** `"Add public string map storage helpers"`

---

### Task 4: supabase-client.js — 토큰 송수신

**Files:**
- Modify: `supabase-client.js` (createApplication, createDemoOrder, createTossPendingOrder)
- Test: `tests/paymentSecurity.test.js`

**Step 1: 먼저 현재 코드 확인** — `grep -n "createApplication\|createDemoOrder\|callPublicSubmission" supabase-client.js`로 시그니처와 반환 구조(`body.result` 형태)를 확인한다.

**Step 2: 실패하는 테스트 작성** — 모의 fetch로 페이로드에 `applicationToken`이 실리는지 검증:

```js
test('checkout requests carry the application token to the submission function', async () => {
  const globals = snapshotGlobals(['fetch']);
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: { order: {} } }) };
  };

  try {
    await createDemoOrder({
      meetup: { id: 'salon-night' },
      payerName: '',
      paymentMethod: '간편결제',
      applicationToken: 'c'.repeat(64),
    });
    assert.equal(calls[0].applicationToken, 'c'.repeat(64));
    assert.equal(calls[0].action, 'demo_order');

    await createTossPendingOrder({
      meetup: { id: 'salon-night' },
      payerName: '',
      paymentMethod: '카드',
      providerOrderId: 'mc_order_test_1234',
      checkoutToken: 'd'.repeat(64),
      applicationToken: 'c'.repeat(64),
    });
    assert.equal(calls[1].applicationToken, 'c'.repeat(64));
  } finally {
    restoreGlobals(globals);
  }
});
```

import에 `createDemoOrder, createTossPendingOrder` 추가.

**Step 3: RED 확인 → Step 4: 구현** — 두 함수 시그니처에 `applicationToken` 추가, `callPublicSubmission` 페이로드에 `applicationToken: applicationToken || ''` 포함. `createApplication`은 반환값에 이미 `result.application`이 포함되므로(토큰은 DB 컬럼에서 따라옴) 변경 불필요 — 반환 경로만 확인.

**Step 5: GREEN → Step 6: 커밋** `"Send application tokens with public order requests"`

---### Task 5: public-flow.js — 결제 버튼 게이트 상태

**Files:**
- Modify: `public-flow.js` (getPublicMeetupActionState)
- Test: `tests/paymentSecurity.test.js`

**Step 1: 실패하는 테스트 작성** — 기존 `public flow helper keeps detail...` 테스트 옆에:

```js
test('public flow helper gates checkout behind a stored application', () => {
  const [open] = mergeMeetupAvailability(
    [{ id: 'open', title: 'Open Meetup', price: '40,000원' }],
    [{ meetup_id: 'open', capacity: 5, remaining_spots: 3, effective_registration_status: 'open', can_register: true }],
  );

  const noApplication = getPublicMeetupActionState(open, { hasApplication: false });
  assert.equal(noApplication.requiresApplication, true);
  assert.equal(noApplication.canOpenCheckout, false);
  assert.equal(noApplication.paymentButtonDisabled, false, 'button stays clickable to guide users to the form');
  assert.equal(noApplication.paymentButtonText, '신청 후 결제');

  const withApplication = getPublicMeetupActionState(open, { hasApplication: true });
  assert.equal(withApplication.requiresApplication, false);
  assert.equal(withApplication.canOpenCheckout, true);
  assert.equal(withApplication.paymentButtonText, '결제하기');

  const paid = getPublicMeetupActionState(open, { hasApplication: true, isPaid: true });
  assert.equal(paid.requiresApplication, false);
  assert.equal(paid.canOpenCheckout, false);
});
```

> **하위 호환:** `hasApplication` 옵션 기본값은 `true`로 한다. 기존 호출부(옵션 미전달)는 동작이 변하지 않고, main.js가 명시적으로 전달하기 시작할 때만 게이트가 작동한다. 기존 테스트가 깨지지 않는지 확인.

**Step 2: RED → Step 3: 구현** — `getPublicMeetupActionState(item, { isPaid = false, hasApplication = true } = {})`로 확장. `requiresApplication = 등록 가능 && !isPaid && !hasApplication`. 해당 시 `canOpenCheckout: false`, `paymentButtonText: '신청 후 결제'`, `paymentButtonDisabled: false`. 구현 전 `public-flow.js` 전체(52줄)를 읽고 기존 상태 계산과 합칠 것.

**Step 4: GREEN → Step 5: 커밋** `"Gate checkout state behind stored applications"`

---

### Task 6: main.js — 토큰 저장·게이트·체크아웃 연결

**Files:**
- Modify: `main.js`
- Test: `tests/paymentSecurity.test.js` (소스 계약)

**Step 1: 실패하는 테스트 작성**

```js
test('main.js stores application tokens and gates checkout on them', async () => {
  const mainScript = await readProjectFile('../main.js');

  assert.match(mainScript, /readPublicStringMap/);
  assert.match(mainScript, /momentclub:application-tokens/);
  assert.match(mainScript, /hasApplication:/);
  assert.match(mainScript, /requiresApplication/);
  assert.match(mainScript, /applicationToken/);
  assert.match(mainScript, /APPLICATION_NOT_FOUND/);
});
```

**Step 2: RED → Step 3: 구현** — 변경 지점:

1. import: `public-storage.js`에서 `persistPublicStringMap, readPublicStringMap` 추가.
2. 상태: `const applicationTokens = readPublicStringMap('momentclub:application-tokens');` + `getApplicationToken/setApplicationToken/clearApplicationToken(meetupId)` 헬퍼 (persist 동반).
3. 드로어/카드 렌더에서 `getPublicMeetupActionState(item, { isPaid, hasApplication: Boolean(getApplicationToken(item.id)) })`로 호출 변경 (호출부 전수 grep: `getPublicMeetupActionState(`).
4. `openCheckout` 진입부: `actionState.requiresApplication`이면 `showToast('신청서를 먼저 제출하면 결제할 수 있어요.')` + 드로어가 열려 있으면 신청 폼 첫 입력에 포커스, return.
5. 신청 폼 제출 성공 핸들러: 응답에서 `result.application.confirmation_token`을 찾아 `setApplicationToken(item.id, token)` 후 드로어 내 결제 버튼 텍스트/상태를 새 actionState로 갱신.
6. `completeCheckout`: `createTossPendingOrder`/`createDemoOrder` 호출에 `applicationToken: getApplicationToken(item.id)` 전달.
7. 주문 생성 실패 처리: `error.code === 'APPLICATION_NOT_FOUND'`면 `clearApplicationToken(item.id)` 후 재신청 안내 메시지를 setCheckoutStatus로 표시.

> 구현 전 신청 폼 제출 핸들러(main.js에서 `createApplication` 호출부)와 에러 코드 전달 경로(supabase-client의 error.code)를 읽고 맞출 것.

**Step 4: GREEN — `npm test` 전체 + `npm run smoke:browser`** (이 시점엔 토큰 없으면 체크아웃이 안 열리므로 스모크의 "checkout modal opened"가 실패할 수 있다 → Task 7과 함께 GREEN 처리해도 된다. 그 경우 커밋은 Task 7과 묶는다.)

**Step 5: 커밋** `"Require a stored application before public checkout"`

---

### Task 7: 브라우저 스모크 + 관리자 표시

**Files:**
- Modify: `scripts/browser-smoke.mjs`, `admin.js`, `supabase-client.js`(fetchAdminOrders/fetchAdminOverview의 select), `admin.html`(컬럼 헤더)
- Test: `tests/paymentSecurity.test.js`

**Step 1 (스모크):** `scripts/browser-smoke.mjs`를 읽고, 결제 모달을 여는 단계 **이전에** 페이지 컨텍스트에서 가짜 토큰을 주입한다 (서버 검증은 제출 시에만 일어나므로 모달 열기는 로컬 토큰만으로 통과):

```js
// 결제 버튼 클릭 전에 실행
await evaluate(`(() => {
  const id = document.querySelector('[data-checkout]')?.dataset.checkout;
  if (id) localStorage.setItem('momentclub:application-tokens', JSON.stringify({ [id]: 'f'.repeat(64) }));
})()`);
```

(스모크 러너의 evaluate 함수명·셀렉터는 파일을 읽고 실제 구조에 맞출 것. 주입 후 페이지 리로드가 필요하면 리로드 단계 추가.)

**Step 2 (관리자, 소스 계약 테스트 먼저):**

```js
test('admin dashboard joins orders to applicants and flags paid applications', async () => {
  const [adminScript, clientScript, adminHtml] = await Promise.all([
    readProjectFile('../admin.js'),
    readProjectFile('../supabase-client.js'),
    readProjectFile('../admin.html'),
  ]);

  assert.match(clientScript, /applications\(applicant_name\)/, 'orders select must embed the linked applicant');
  assert.match(clientScript, /orders\(status\)/, 'applications select must embed linked order statuses');
  assert.match(adminScript, /<td data-label="신청자">/);
  assert.match(adminHtml, /신청자/);
});
```

RED 확인 후 구현:
- `supabase-client.js`의 주문 조회 select에 `,applications(applicant_name)`, 신청 조회 select에 `,orders(status)` 추가 (현재 select 문자열을 grep으로 찾아 수정).
- `admin.js` 주문 행 렌더에 `<td data-label="신청자">${escapeHtml(order.applications?.applicant_name || '-')}</td>`, `admin.html` 주문 테이블 thead에 `신청자` 추가.
- `admin.js` 신청 행 렌더에 결제 표시: `order.status가 paid/demo_paid인 연결 주문이 있으면 '결제완료' 뱃지`.

**Step 3: GREEN — `npm test` + `npm run smoke:browser` 통과 확인**

**Step 4: 커밋 + 푸시**

```bash
git add -A && git commit -m "Link applications to orders in public flow and admin"
git push origin main   # Pages 배포 + CI 스모크
gh run watch <run-id> --repo Subong-Noah-Kim/moin --exit-status
```

**Step 5: 라이브 수동 검증 (잠금 전 필수 게이트)**
1. 사이트에서 신청서 제출 → 결제 버튼이 '결제하기'로 풀리는지
2. 토스 테스트 결제 → payment-result 성공
3. 서비스롤 키로 확인: 최신 주문의 `application_id`가 채워졌는지, 연결 신청서 status가 `accepted`인지

```bash
# Task 검증용 조회 (서비스롤 키 셸 변수 사용, 출력에 키 노출 금지)
curl -s "$BASE/orders?select=application_id,status,created_at&order=created_at.desc&limit=1" -H "$H1" -H "$H2"
```

---

### Task 8: 2차 잠금 마이그레이션 — 토큰 필수화

**선행 조건: Task 7 Step 5의 라이브 검증이 끝나기 전에는 절대 진행하지 않는다.** (이 마이그레이션이 적용되면 토큰 없는 결제가 차단되므로, 구버전 프론트가 캐시에 남은 사용자는 결제 실패를 겪는다 — Pages 배포 후 충분히 확인하고 진행)

**Files:**
- Create: `supabase/migrations/20260614000000_require_application_for_orders.sql`
- Test: `tests/paymentSecurity.test.js`

**Step 1: 실패하는 테스트 작성**

```js
test('lock migration makes application tokens mandatory for public orders', async () => {
  const migration = await readProjectFile('../supabase/migrations/20260614000000_require_application_for_orders.sql');

  assert.match(migration, /APPLICATION_REQUIRED/);
  assert.match(migration, /create or replace function public\.create_public_order/);
});
```

**Step 2: RED → Step 3: 구현** — Task 1의 `create_public_order` 본문을 복사하고, action 검증 직후에 추가:

```sql
  if v_application_token is null then
    raise exception 'APPLICATION_REQUIRED';
  end if;
```

엣지 함수 `getErrorStatus/Code/Message`에 `APPLICATION_REQUIRED`(409, '신청서를 먼저 제출해 주세요.') 분기 추가 + Task 2 계약 테스트에 한 줄 추가.

**Step 4: GREEN → Step 5: 커밋 + 적용**

```bash
git add -A && git commit -m "Require application tokens for public orders"
git push origin main
npx supabase db push
npx supabase functions deploy create-public-submission --no-verify-jwt
```

**Step 6: 최종 검증** — 토큰 없는 주문 생성이 409 `APPLICATION_REQUIRED`로 거부되는지 curl로 확인 + 사이트에서 신청→결제 전체 사이클 1회 재확인. `supabase/README.md`에 새 마이그레이션 2건과 신청-결제 연결 동작을 문서화하는 후속 커밋으로 마무리.

---

## 태스크 순서 요약 (배포 타이밍이 핵심)

| 순서 | 작업 | 배포 행위 |
|---|---|---|
| 1 | 1차 마이그레이션 | `db push` (즉시, 무해) |
| 2 | 엣지 함수 토큰 전달 | `functions deploy` (즉시, 무해) |
| 3–6 | 프론트 헬퍼·게이트·연결 | 로컬 커밋만 |
| 7 | 스모크·관리자 + **git push** | Pages 배포, 라이브 검증 |
| 8 | 잠금 마이그레이션 | 검증 후 `db push` + 함수 재배포 |
