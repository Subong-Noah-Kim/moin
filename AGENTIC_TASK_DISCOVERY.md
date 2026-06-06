# Agentic Task Discovery

이 문서는 실제 subagent들이 발굴한 개발 후보를 모아두는 작업 후보 목록입니다. `TODO.md`를 대체하지 않고, 아침에 배포/개발할 항목을 고르기 위한 판단 자료로 사용합니다.

## Round 1 - 2026-06-07 02:52 KST

### 요약

첫 번째 밤샘 발굴 라운드의 결론은 `정원/잔여석/자동 마감`을 가장 먼저 작은 단위로 개발해야 한다는 것입니다. 지금은 관리자가 `3자리 남음`, `마감` 같은 문구를 직접 넣기 때문에 실제 신청/결제 수와 화면이 어긋날 수 있습니다. 비개발자 관점에서는 `10명 정원 모임에 12명이 결제되는 사고`를 막는 작업입니다.

### TD-001 - 정원 데이터 모델 추가

- Priority: `P0`
- Status: `approved`
- Source agents: DB/Backend, UX/UI, QA, Review
- What: `meetups`에 정원과 마감 상태를 저장할 필드를 추가한다.
- Why: 현재는 정원을 저장할 곳이 없어서 잔여석을 실제 숫자로 계산할 수 없다.
- First development unit:
  - `meetups.capacity` 추가: 정원, `NULL`이면 무제한.
  - `meetups.registration_status` 추가 후보: `open`, `sold_out`, `closed`.
  - `meetups.closed_at`, `meetups.close_reason` 추가 후보.
- Development direction: 잔여석은 DB에 저장하지 않고 `capacity - 자리 사용 수`로 계산한다.
- Notes:
  - 자리 사용 기준을 먼저 정해야 한다. P0에서는 `pending`, `demo_paid`, `paid` 주문을 좌석 사용으로 보는 쪽이 안전하다.
  - 신청과 결제를 같은 사람이 둘 다 할 수 있어 중복 카운트 정책은 별도 후속 작업이 필요하다.

### TD-002 - 신청/주문 생성 시 정원 초과 차단

- Priority: `P0`
- Status: `approved`
- Source agents: DB/Backend, QA, Review
- What: 공개 신청이나 주문을 만들 때 정원이 이미 찼으면 서버에서 막는다.
- Why: 화면에서 버튼을 비활성화해도 동시에 여러 명이 결제하면 초과 판매가 생길 수 있다.
- First development unit:
  - `create_public_application` RPC에서 모임 row를 `FOR UPDATE`로 잠그고 잔여석을 확인한다.
  - `create_public_order` RPC에서도 같은 방식으로 주문 생성 전 잔여석을 확인한다.
  - 정원이 찼으면 `MEETUP_SOLD_OUT` 같은 명확한 에러를 발생시킨다.
- Development direction: 브라우저가 아니라 DB/RPC에서 최종 차단한다.
- Notes:
  - Edge Function `create-public-submission`은 `MEETUP_SOLD_OUT`을 HTTP 409와 사용자용 메시지로 변환한다.
  - Toss 결제창 이탈로 생긴 `pending` 주문 회수 정책은 P1 후속 작업으로 분리한다.

### TD-003 - 공개 화면 잔여석/마감 표시

- Priority: `P0`
- Status: `approved`
- Source agents: UX/UI, DB/Backend, QA
- What: 모임 카드와 상세 화면에 실제 잔여석과 마감 상태를 표시한다.
- Why: `4자리 남음` 같은 수동 문구는 실제 좌석 수와 어긋날 수 있어 사용자가 잘못 신청할 수 있다.
- First development unit:
  - 공개 모임 조회 결과에 `capacity`, `remaining_spots`, `registration_status`를 포함한다.
  - 카드에는 `잔여 2석`, `마감`처럼 짧게 표시한다.
  - 상세 화면에는 정원/잔여석/마감 안내를 더 명확히 보여준다.
- Development direction: 기존 `status_label`은 보조 문구로 남기되, 결제 가능 여부는 계산된 상태를 기준으로 한다.
- Notes:
  - 모바일에서는 짧은 배지를 우선 사용한다.
  - 잔여석 0이면 신청/결제 버튼이 열리지 않아야 한다.

### TD-004 - 관리자 정원 입력과 마감 위험 표시

- Priority: `P1`
- Status: `approved`
- Source agents: UX/UI, DB/Backend
- What: 관리자 모임 폼과 목록에 정원, 잔여석, 마감 상태를 보여준다.
- Why: 운영자가 공개 전에 과모집 위험을 빠르게 확인해야 한다.
- First development unit:
  - 모임 편집 폼에 `정원` 숫자 입력을 추가한다.
  - 모임 목록에 `정원/잔여석/마감 상태` 컬럼 또는 모바일 카드 필드를 추가한다.
  - 잔여 1석, 마감, 초과 위험 같은 배지를 표시한다.
- Development direction: 긴 관리자 폼 안에서는 정원 관련 필드를 `운영 설정` 묶음으로 배치한다.
- Notes:
  - `상태 문구`와 `자동 마감 상태`가 헷갈리지 않도록 라벨을 분리해야 한다.

### TD-005 - 관리자 세션 저장소 축소

- Priority: `P0`
- Status: `approved`
- Source agents: Security, QA, Review
- What: 관리자 access token을 오래 남는 `localStorage` 대신 더 짧게 보관한다.
- Why: 관리자 토큰은 관리자 열쇠다. 브라우저에 오래 남으면 XSS나 같은 origin 페이지 위험이 커진다.
- First development unit:
  - `localStorage` 대신 `sessionStorage` 사용을 검토한다.
  - refresh flow가 없으므로 저장값에서 `refreshToken` 제거를 검토한다.
  - 만료 세션 감지 시 저장소를 즉시 정리한다.
- Development direction: 보안성은 높이고, 관리자가 탭/브라우저를 닫으면 다시 로그인해야 하는 불편은 명확히 안내한다.
- Notes:
  - sessionStorage 전환은 UX 변화가 있으므로 배포 전 사용자 확인이 좋다.
  - 정식 refresh token 회전/자동 갱신은 후속 작업으로 보류한다.

### TD-006 - Toss 승인값 노출 최소화

- Priority: `P1`
- Status: `approved`
- Source agents: Security, QA
- What: 결제 결과 화면과 브라우저 저장소에 전체 `paymentKey`를 남기지 않는다.
- Why: 결제 승인 식별자는 비밀번호는 아니지만 사용자 화면과 저장소에 오래 남길 이유가 없다.
- First development unit:
  - `payment-result.html`에서 결제키 원문 표시 제거 또는 마스킹.
  - `payment-result.js`의 sessionStorage 저장 객체에서 `paymentKey` 제거.
  - 승인 시작 후 `history.replaceState`로 URL의 결제 query를 정리한다.
- Development direction: confirm 요청에는 필요한 값을 보내되, 화면/스토리지/로그에는 원문을 남기지 않는다.
- Notes:
  - URL을 빨리 지우면 새로고침 재시도 UX가 약해질 수 있으므로 실패 안내가 필요하다.

### TD-007 - Agent status 민감정보 가드

- Priority: `P1`
- Status: `approved`
- Source agents: Security
- What: `AGENTIC_STATUS.json`, `AGENTIC_LIVE_STATUS.json`에 비밀값이 들어가면 테스트에서 실패하게 한다.
- Why: 배포되는 현황판이나 로컬 모니터에 토큰, 결제키, 고객 정보가 실수로 기록되면 위험하다.
- First development unit:
  - `access_token`, `refresh_token`, `paymentKey`, `checkoutToken`, `service_role`, JWT 패턴, Toss secret 패턴 denylist 테스트 추가.
- Development direction: 작고 보수적인 금지 목록으로 시작하고, 오탐이 많으면 조정한다.
- Notes:
  - 렌더링 XSS escape와 민감정보 기록 방지는 별개의 문제다.

### TD-008 - 테스트 구조 보강

- Priority: `P2`
- Status: `approved`
- Source agents: QA
- What: 정규식 기반 구조 감시 테스트를 보완해 실제 상태 변화와 DOM 결과를 검증한다.
- Why: P0/P1 작업은 코드에 문구가 있는지만 보는 테스트로는 부족하다.
- First development unit:
  - 가격, 상태 문구, 저장소, 결제 결과 파싱을 작은 helper로 분리한다.
  - `node:test`로 helper 결과를 직접 검증한다.
  - 정원/마감은 가능하면 Supabase local DB 또는 SQL transaction 테스트를 추가한다.
- Development direction: 기존 테스트는 안전망으로 유지하고, 핵심 흐름에 실제 입력/출력 테스트를 추가한다.
- Notes:
  - DB 쪽 P0는 단순 정규식 테스트만으로는 충분하지 않다.

### 보류 항목

- Toss `pending` 주문 만료/좌석 회수 정책: P0 이후 P1로 설계한다.
- 취소/환불 시 자동 재오픈 정책: 취소/환불 운영 플로우와 함께 설계한다.
- CAPTCHA/Turnstile: 실제 스팸 징후가 생기면 붙인다.
- 정식 admin refresh token lifecycle: sessionStorage 축소 이후 별도 보안 작업으로 분리한다.
