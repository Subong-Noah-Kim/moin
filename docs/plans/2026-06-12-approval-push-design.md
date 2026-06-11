# 승인 푸시 알림 설계 (2026-06-12)

## 목표

관리자가 신청을 승인(`accepted`)하는 시점에, 신청자가 설치한 PWA로 웹 푸시 알림을
보낸다. 범위는 승인 알림 1종뿐이다.

## 확정된 제품 결정

1. **트리거는 관리자 화면**: 승인 PATCH 성공 직후 admin.js가 발송 Edge Function을
   호출한다. DB 트리거(pg_net)는 이 프로젝트에 없는 인프라 패턴이라 배제,
   승인 경로의 Edge Function 이전은 침습적이라 배제.
2. **익명 사용자 연결은 신청 확인 토큰**: 구독 등록 시 `confirmation_token`으로
   "이 기기 = 이 신청"을 증명한다. 기존 결제 연결과 같은 관용구.
3. **서비스 워커는 푸시 전용**: `push`/`notificationclick` 핸들러만. fetch 핸들러
   없음 = 캐싱 없음(PWA 설계의 stale 배포 회피 원칙 유지).
4. **iOS 제약 수용**: 미설치 Safari에는 옵트인 버튼 대신 "홈 화면에 추가" 안내를
   보여준다.

## 핵심 보안/정합성 설계: 원자적 클레임

발송 함수는 인증 없이 호출 가능하지만(기존 함수들과 동일하게 `verify_jwt = false`),
`claim_approval_push` RPC가 남용을 구조적으로 막는다:

- 신청이 `accepted`이고 `approval_notified_at IS NULL`일 때만, 같은 문장에서
  플래그를 찍고 구독 목록을 반환한다 (`UPDATE ... RETURNING` 원자성).
- 그 외에는 빈 결과. 따라서 어떤 호출 패턴으로도 "실제 승인된 신청에 푸시 1회"를
  초과할 수 없다. 중복 클릭, 재시도, 제3자 스팸 호출 모두 동일.

## 산출물

### 마이그레이션 1개 (`supabase/migrations/`)

- `applications.approval_notified_at timestamptz` 추가.
- `push_subscriptions` 테이블: `id`, `application_id` FK(on delete cascade),
  `endpoint text unique`, `p256dh text`, `auth text`, `created_at`.
  공개 직접 접근 차단(RLS), service role만 접근.
- RPC `register_push_subscription(p_application_token, p_endpoint, p_p256dh, p_auth)`:
  토큰으로 신청 조회(거절/취소 상태 제외), endpoint 기준 upsert.
  토큰 불일치 시 `APPLICATION_NOT_FOUND` — 기존 주문 RPC와 같은 에러 관용구.
- RPC `claim_approval_push(p_application_id)`: 위 원자적 클레임. 반환에 모임명
  포함(알림 본문용).

### Edge Function

- **`send-approval-push` (신규)**: 입력 `{ applicationId }`. service role로
  `claim_approval_push` 호출 → 구독별 Web Push 발송 → 404/410 구독 행 삭제 →
  `{ sent, failed, expired }` 요약 반환. 발송 암호화(RFC 8291)와 VAPID 서명은
  WebCrypto 기반 Deno 라이브러리 `jsr:@negrel/webpush`를 1순위로 사용하고,
  Supabase 엣지 런타임에서 동작하지 않으면 `npm:web-push`로 대체한다(배포
  검증으로 확정). 라이브러리가 JWK 키쌍을 import하므로 secrets는
  `VAPID_KEYS_JWK`(공개+개인 JWK JSON)와 `VAPID_SUBJECT`(mailto) 2개,
  미설정 시 기동 거부(`PUBLIC_SUBMISSION_HASH_SALT` 관용구와 동일).
- **`create-public-submission` (확장)**: `kind: 'push_subscription'` 추가 —
  기존 방문자 해시 반복 제출 제한을 그대로 통과시킨 뒤
  `register_push_subscription` RPC 호출.

### 프론트엔드

- **`sw.js` (신규, 루트)**: `push` → `showNotification(제목, 본문)`,
  `notificationclick` → 열린 창 포커스 또는 `clients.openWindow('./')`.
- **`push-client.js` (신규)**: 테스트 가능한 pure 헬퍼 모듈 — 푸시 지원 감지,
  VAPID 공개키 base64url → Uint8Array 변환, 구독 등록 페이로드 구성,
  옵트인 상태 라벨.
- **`push-config.js` (신규)**: VAPID 공개키 상수 (`toss-config.js` 패턴).
- **`main.js`**: 서비스 워커 등록(실패 가드), 신청 성공 영역에 옵트인 버튼 —
  버튼 탭 → 권한 요청 → `pushManager.subscribe` → 토큰과 함께 등록 제출.
  미지원 환경이면 버튼 대신 "홈 화면에 추가하면 승인 알림을 받을 수 있어요" 안내.
- **`supabase-client.js`**: 구독 등록 제출 함수, 발송 함수 호출 함수
  (admin accessToken 헤더는 기존 패턴 따름).
- **`admin.js`**: 상태 변경 성공 콜백에서 `nextStatus === 'accepted'`일 때
  발송 함수 호출, 결과를 토스트로 표시("알림 N건 발송" / "알림 구독 없음" /
  "알림 발송 실패"). 실패해도 승인 흐름은 정상 진행.

### VAPID 키

- `scripts/generate-vapid-keys.mjs` (신규, 일회성): Node WebCrypto로 P-256 키쌍
  생성. stdout에 JWK 키쌍 JSON(secrets용), stderr에 application server key
  (base64url 공개키, `push-config.js`용) 출력.
- 공개키는 `push-config.js`에 커밋. **개인키가 포함된 JWK JSON은 리포에 넣지
  않고** `supabase secrets set VAPID_KEYS_JWK=...`로만 설정. `VAPID_SUBJECT`는
  `mailto:` 연락처.

### 배포 (`deploy-pages.yml`)

복사 목록에 `sw.js`, `push-client.js`, `push-config.js` 추가. 계약 테스트로 잠금.
`sw.js`는 자산 버저닝 쿼리를 붙이지 않는다(서비스 워커는 URL이 정체성이라
`?v=` 변경 시 새 워커로 인식돼 불필요한 재설치 유발).

### 배포 순서 (무중단)

1. 마이그레이션 적용 (RPC는 추가만, 기존 경로 무변경)
2. `supabase secrets set VAPID_PRIVATE_KEY VAPID_SUBJECT`
3. Edge Function 배포: `send-approval-push` 신규, `create-public-submission` 갱신
4. GitHub Pages 프론트 배포
5. 실플로우 검증: 아이폰 설치 PWA에서 신청 → 옵트인 → 관리자 승인 → 알림 수신

## 테스트

기존 node:test 패턴:

- `push-client.js` pure 헬퍼 단위 테스트 (변환, 지원 감지, 페이로드, 라벨)
- 소스 계약 테스트: 마이그레이션(원자 클레임 `UPDATE ... RETURNING`, 토큰 검증,
  RLS), `sw.js`(push/notificationclick 존재, fetch 핸들러 부재), Edge Function
  (claim 경유, 410 구독 삭제, secrets 필수), `create-public-submission`
  (`push_subscription` kind), admin.js(accepted 시에만 호출), 배포 복사 목록
- 브라우저 스모크: 기존 흐름 회귀 없음 확인(서비스 워커 등록 실패 가드 동작)

## 범위 밖 (나중에)

- 모임 리마인더·오픈 예정 알림 (구독을 모임 단위로 확장할 때)
- 구독 해지 UI (브라우저/OS 설정으로 가능)
- 관리자용 알림, 발송 이력 대시보드
