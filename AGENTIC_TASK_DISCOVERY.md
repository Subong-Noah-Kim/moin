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
  - 자리 사용 기준을 먼저 정해야 한다. P0에서는 `demo_paid`, `paid`, 만료되지 않은 `pending` 주문을 좌석 사용으로 보는 쪽이 안전하다.
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
- Status: `done_local`
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
  - 2026-06-07 04:22 KST에 `payment-result.html`, `payment-result.js`, `tests/paymentSecurity.test.js`에 로컬 구현과 테스트를 추가했다.

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

## Round 2 - 2026-06-07 03:14 KST

### 요약

이번 수동 하트비트 사이클의 결론은 Round 1의 `정원/잔여석/자동 마감` 우선순위를 유지하되, 구현 전에 `pending 주문 만료`를 함께 설계해야 한다는 것입니다. `pending` 주문을 좌석 점유로 계산하면 Toss 결제창을 열고 이탈한 주문이 좌석을 계속 붙잡아 거짓 마감을 만들 수 있습니다. 따라서 첫 개발 패키지는 `정원 필드 + 좌석 점유 기준 + pending 만료 + sold-out 에러 매핑`을 한 묶음으로 잡는 것이 안전합니다.

### TD-009 - pending 주문 만료 정책 추가

- Priority: `P0`
- Status: `approved`
- Source agents: Security, QA, Review
- What: Toss 결제창 이탈로 남은 `pending` 주문이 좌석을 영구 점유하지 않도록 만료 시간을 둔다.
- Why: 정원 차단에서 `pending` 주문을 좌석 점유로 보면, 결제하지 않은 주문이 모임을 마감 상태로 만들 수 있다.
- First development unit:
  - `orders.expires_at` 추가 후보: pending Toss 주문 만료 시각.
  - `create_public_order` RPC가 새 pending 주문에 만료 시각을 저장한다.
  - 정원 계산은 `paid`, `demo_paid`, 만료되지 않은 `pending`만 좌석 점유로 계산한다.
- Development direction: 정원 초과를 안전하게 막되, 결제창 이탈자가 좌석을 과도하게 붙잡지 않도록 한다.
- Notes:
  - 만료 시간은 운영 정책이다. 첫 값은 15~30분 후보가 현실적이다.
  - 만료된 pending 주문을 즉시 삭제하지 않아도 되지만, 좌석 계산에서는 제외해야 한다.
  - Toss 실패/취소 콜백이 들어오면 기존처럼 failed/cancelled로 정리한다.

### TD-010 - 정원 P0 구현 패키지 순서 확정

- Priority: `P0`
- Status: `approved`
- Source agents: Planning, UX/UI, Security, QA, Review
- What: TD-001~TD-003과 TD-009를 실제 구현 순서로 묶는다.
- Why: DB 정원 필드만 추가하거나 화면 배지만 먼저 추가하면 실제 과판매 방지 효과가 부족하다.
- First development unit:
  - 1단계: DB migration으로 `capacity`, `registration_status`, `closed_at`, `close_reason`, `orders.expires_at` 추가.
  - 2단계: `create_public_application`, `create_public_order` RPC에서 row lock과 좌석 계산을 적용.
  - 3단계: Edge Function이 `MEETUP_SOLD_OUT`을 HTTP 409와 사용자용 메시지로 변환.
  - 4단계: 공개 카드/상세/결제 진입 UI가 `remaining_spots`와 `registration_status`를 반영.
  - 5단계: 관리자 모임 폼과 목록에 정원/잔여석/마감 상태를 표시.
- Development direction: 서버 차단을 먼저 만들고, 화면은 그 결과를 사용자에게 이해시키는 순서로 붙인다.
- Notes:
  - Supabase 원격 SQL 적용과 Edge Function 배포가 필요하므로 코드 커밋과 실제 배포/적용은 분리한다.
  - 로컬 테스트는 정규식 가드로 시작하되, 가능하면 Supabase local DB 시나리오 테스트로 확장한다.

### TD-011 - 관리자 세션 저장소 축소 구현

- Priority: `P0`
- Status: `approved_needs_user_ack`
- Source agents: Planning, Security, QA
- What: 관리자 토큰을 오래 남는 `localStorage`에서 더 짧은 `sessionStorage`로 옮기고, 쓰지 않는 refresh token 저장을 제거한다.
- Why: 관리자 토큰은 관리자 권한을 가진 열쇠라 브라우저에 오래 남길수록 위험하다.
- First development unit:
  - `supabase-client.js`의 admin session 저장소를 `sessionStorage`로 전환.
  - refresh flow를 구현하지 않는 한 저장 객체에서 `refreshToken` 제거.
  - 만료되거나 깨진 세션을 읽으면 즉시 저장소를 정리.
- Development direction: 탭/브라우저를 닫으면 다시 로그인하는 쪽으로 보안을 높인다.
- Notes:
  - 운영 UX가 바뀐다. 관리자는 브라우저를 닫은 뒤 다시 로그인해야 할 수 있다.
  - 사용자가 이 UX 변화를 승인하면 바로 구현하기 좋은 작은 작업이다.

### TD-012 - 결제 결과 식별자 노출 최소화

- Priority: `P1`
- Status: `approved`
- Source agents: Planning, UX/UI, Security, QA
- What: 결제 결과 화면과 브라우저 저장소에서 원문 `paymentKey` 노출을 줄인다.
- Why: 결제 승인 식별자는 확인 요청에는 필요하지만, 사용자 화면이나 sessionStorage에 오래 남길 이유는 적다.
- First development unit:
  - `payment-result.js`에서 confirm 요청 이후 `history.replaceState`로 URL query 정리.
  - 화면의 결제키 원문 표시 제거 또는 마스킹.
  - sessionStorage 저장 객체에서 `paymentKey` 제거.
- Development direction: 요청 처리에는 필요한 값을 쓰되, 화면/저장소/로그에는 최소한만 남긴다.
- Notes:
  - URL 정리 시 새로고침 재시도 UX가 약해질 수 있으므로 실패 안내 문구를 같이 확인한다.
  - 2026-06-07 04:22 KST에 `payment-result.html`, `payment-result.js`, `tests/paymentSecurity.test.js`에 로컬 구현과 테스트를 추가했다.

### TD-013 - Agent status 민감정보 denylist 테스트

- Priority: `P1`
- Status: `done_local`
- Source agents: Security, QA
- What: `AGENTIC_STATUS.json`, `AGENTIC_LIVE_STATUS.json`에 토큰/결제키/고객정보처럼 보이는 문자열이 들어가면 테스트에서 실패하게 한다.
- Why: `AGENTIC_STATUS.json`은 GitHub Pages artifact에 포함되므로 작업 설명에 민감한 값이 실수로 들어가면 공개될 수 있다.
- First development unit:
  - JSON을 재귀적으로 훑는 테스트 helper 추가.
  - `access_token`, `refresh_token`, `paymentKey`, `checkoutToken`, `service_role`, JWT 형태, Toss secret 형태를 denylist로 시작.
  - 실패 메시지는 매칭값 원문이 아니라 경로와 규칙명만 보여준다.
- Development direction: 작은 보수적 denylist로 시작하고 오탐이 많으면 조정한다.
- Notes:
  - 이 작업은 배포가 필요 없는 테스트 안전망이라 다음 작은 개발 단위로 적합하다.
  - 2026-06-07 03:21 KST에 `tests/paymentSecurity.test.js`에 로컬 테스트를 추가했다.

### TD-014 - public localStorage 파싱 복원력

- Priority: `P1`
- Status: `done_local`
- Source agents: QA
- What: public 페이지의 `momentclub:*` localStorage 값이 깨져도 앱이 렌더링되게 한다.
- Why: 잘못된 저장값 하나 때문에 공개 페이지가 초기화 중 멈추면 일반 사용자가 모임 목록을 못 볼 수 있다.
- First development unit:
  - `readStringSet(storage, key)` 같은 작은 helper를 추가한다.
  - invalid JSON, 배열이 아닌 값, storage throw 상황에서 빈 Set으로 복구한다.
  - 깨진 값은 가능하면 정리한다.
- Development direction: 관리자 세션 parser처럼 방어적으로 읽고 실패 시 앱은 계속 보여준다.
- Notes:
  - 결제/신청 핵심 흐름보다 낮지만, 코드 변경 범위가 작고 테스트하기 좋다.
  - 2026-06-07 03:29 KST에 `main.js`, `payment-result.js`, `tests/paymentSecurity.test.js`에 로컬 구현과 테스트를 추가했다.

### Round 2 보류/폐기 판단

- 광범위한 frontend module split: 유용하지만 이번 사이클의 직접 사용자/운영 리스크 해소에는 덜 맞아 `deferred`.
- GitHub Pages workflow runtime 정리: TODO 상단에 남아 있으나 실제 warning 제거 확인은 GitHub Actions 실행이 필요해 별도 배포/검증 사이클로 유지.
- live region 전체 확대: 접근성 품질 개선으로 유지하되, 자동 갱신 모니터에는 과한 알림을 피한다.

## Round 3 - 2026-06-07 03:37 KST

### 요약

이번 사이클은 새 기능 발굴보다 `TODO.md`의 현재 1순위인 GitHub Pages workflow runtime 정리를 실제 개발 대상으로 배정했습니다. 쉽게 말하면, GitHub가 Actions 실행 환경을 Node 24 쪽으로 옮기는 중이라 배포 자동화 파일도 그 변화에 맞춰 미리 손보는 작업입니다. 이 작업은 사이트 기능을 바꾸는 작업은 아니지만, 나중에 배포 버튼을 눌렀을 때 경고나 실패가 나지 않게 하는 운영 안정화 작업입니다.

### TD-015 - GitHub Pages workflow runtime 정리

- Priority: `P1`
- Status: `done_local`
- Source agents: Director, Development, QA, Security, Ops Log
- What: GitHub Pages 배포 workflow에서 오래된 action/runtime 조합을 최신 GitHub Actions 환경에 맞게 정리한다.
- Why: 현재 배포는 성공하더라도 GitHub Actions Node runtime 경고가 쌓이면 어느 시점에 배포가 갑자기 실패할 수 있다.
- First development unit:
  - `checkout`, `setup-node`, `configure-pages`, `upload-pages-artifact`, `deploy-pages` action 버전 정책을 하나로 확정한다.
  - 배포에 필요한 권한은 deploy job에만 두고, test job은 최소 권한으로 유지한다.
  - workflow 버전 정책을 테스트로 고정해 다음에 오래된 action이 다시 들어오면 `npm test`에서 잡는다.
- Development direction: 먼저 로컬 workflow/test 정합성을 맞추고, 사용자가 배포를 선택한 뒤 GitHub Actions 실제 실행 로그에서 runtime 경고가 사라졌는지 확인한다.
- Risks:
  - action major version을 올리면 GitHub-hosted runner에서는 대체로 안전하지만, 각 action의 새 요구 조건과 동작 변경을 확인해야 한다.
  - `upload-pages-artifact` 계열은 숨김 파일 처리 변경이 있을 수 있어 `.nojekyll`이나 `.well-known`을 배포하게 될 때는 별도 확인이 필요하다.
  - 배포 경고 제거 여부는 로컬 테스트만으로 확정할 수 없고, 실제 GitHub Actions 실행 로그를 봐야 한다.
- Notes:
  - 이 사이클에서 push와 deploy는 하지 않았다.
  - 로컬 구현과 `npm test`는 완료했다.
  - TODO.md의 최종 완료 조건은 fresh deploy warning 확인까지 포함하므로 TODO 체크박스는 아직 열어둔다.
  - QA와 보안 검토 결과를 반영해 action 버전 정책, 최소 권한, 테스트 기대값을 맞췄다.

## Round 4 - 2026-06-07 03:45 KST

### 요약

이번 사이클은 `TODO.md`의 다음 우선순위인 관리자 세션 저장 방식을 정리했습니다. 쉽게 말하면, 관리자 로그인 열쇠를 브라우저에 오래 남겨두지 않도록 바꾼 작업입니다. live 배포 후에는 같은 탭 새로고침은 유지되지만, 브라우저 탭/창을 닫으면 다시 로그인해야 할 수 있습니다.

### TD-016 - 관리자 세션 저장소 축소

- Priority: `P1`
- Status: `done_local`
- Source agents: Director, Security, QA, Development, Ops Log
- What: 관리자 세션을 오래 남는 저장소가 아니라 탭 단위 저장소에 보관하고, 쓰지 않는 refresh token 저장을 제거한다.
- Why: 관리자 권한을 가진 값이 브라우저에 오래 남을수록 XSS나 같은 origin 페이지 사고 때 피해가 커진다.
- First development unit:
  - 관리자 세션 저장소를 `sessionStorage`로 전환한다.
  - 기존 `localStorage` 세션은 옮기지 않고 삭제한다.
  - 저장 세션에서 refresh token을 제거한다.
  - 만료되거나 깨진 세션을 읽으면 저장소를 비우고 다시 로그인 안내를 보여준다.
  - 초대/인증 토큰이 URL에 보이면 유효하지 않은 초대 링크라도 주소창에서 제거한다.
- Development direction: 자동 refresh flow는 만들지 않고, 관리자 보안을 우선해 짧은 세션으로 운영한다.
- Risks:
  - 배포 후 관리자가 브라우저 탭/창을 닫으면 다시 로그인해야 할 수 있다.
  - GitHub Pages 정적 구조에서는 HttpOnly cookie 기반 서버 세션은 별도 백엔드 설계가 필요해 이번 범위에서 제외했다.
- Notes:
  - 이 사이클에서 push와 deploy는 하지 않았다.
  - `npm test` 20개가 모두 통과했다.
  - live admin 페이지에 반영하려면 나중에 사용자가 선택한 배포 묶음에 포함해야 한다.

## Round 5 - 2026-06-07 03:54 KST

### 요약

밤샘 자동화 재시작 후 1회차 사이클에서는 `신청/결제 폼 label 접근성 개선`을 개발했습니다. 쉽게 말하면, 입력칸 안의 흐린 안내 문구에만 의존하지 않고 입력칸 위에 계속 보이는 이름표를 붙인 작업입니다. 사용자가 입력을 시작해도 어떤 칸인지 계속 보이고, 접근성 도구도 입력칸의 의미를 더 정확히 알 수 있습니다.

### TD-017 - 신청/결제 폼 label 접근성 개선

- Priority: `P2`
- Status: `done_local`
- Source agents: Director, UX/UI, QA, Security/Review
- What: 공개 모임 상세의 신청 폼과 결제 모달의 입력칸에 명시적인 label과 도움 문구를 추가한다.
- Why: placeholder는 사용자가 입력을 시작하면 사라지고, 보조 기술에서도 실제 label만큼 안정적인 이름이 되지 못한다.
- First development unit:
  - 신청 폼 `이름`, `이 모임에 끌린 이유` 입력에 label을 추가한다.
  - 각 신청 입력에 화면에 보이는 도움 문구를 추가하고 `aria-describedby`로 연결한다.
  - 결제 폼 이름 입력 문구를 `결제자 이름 (선택)`으로 구체화한다.
  - 동적 id는 안전한 ASCII 조각으로 정규화하고 `escapeAttribute`를 거쳐 사용한다.
  - form field 스타일을 기존 drawer/checkout 디자인에 맞게 추가한다.
- Development direction: 큰 UI 개편 없이 현재 폼 구조 안에서 accessible name과 helper text를 보강한다.
- Risks:
  - label이 추가되어 폼 높이가 조금 늘어난다. 모바일에서 겹침이 없는지 배포 전 화면 확인이 필요하다.
  - 실서비스 결제 약관/환불/개인정보 고지 문구는 별도 product copy 작업으로 남긴다.
- Notes:
  - 이 사이클에서 push와 deploy는 하지 않았다.
  - `npm test` 21개가 모두 통과했다.
  - 로컬 서버에서 `index.html`, 최신 `main.js`, 최신 `styles.css` 응답을 확인했다.

## Round 6 - 2026-06-07 04:08 KST

### 요약

이번 사이클은 `TODO.md`의 운영 준비 항목인 제품/데모 결제 문구와 설정 문서 정리를 개발했습니다. 쉽게 말하면, 지금 moin은 토스 테스트 결제와 Supabase 승인 함수까지 연결되어 있지만 실제 출금이 일어나는 운영 결제는 아니므로, 사용자가 화면만 보고 실결제나 참가 확정으로 오해하지 않게 문구를 정리한 작업입니다.

### TD-018 - 제품/데모 결제 문구와 설정 문서 정리

- Priority: `P1`
- Status: `done_local`
- Source agents: Director, Planning/Copy, QA, Security/Review, Ops Log
- What: 공개 결제 모달, 모임 상세 결제 상태, 결제 결과 화면, README, Supabase README가 현재 통합 상태를 정확히 설명하게 한다.
- Why: Supabase, Toss Payments test, confirm Edge Function이 연결된 상태에서 예전 `데모`, `연결 준비`, 단독 `결제 완료` 문구가 섞이면 사용자가 실제 과금 또는 참가 확정으로 오해할 수 있다.
- First development unit:
  - public checkout copy를 `토스 테스트 결제`, `실제 출금 없음`, `Supabase Edge Function 승인 API 호출` 중심으로 정리한다.
  - screen-only demo fallback은 `데모 결제 표시`로 표현해 실제 결제 완료처럼 보이지 않게 한다.
  - payment-result success/error copy에서 테스트 승인과 주문/결제 기록 업데이트를 구분한다.
  - README와 `supabase/README.md`가 현재 연결된 Edge Function 흐름과 라이브 결제 전 준비 항목을 분리해 설명한다.
  - 문서와 화면 copy가 다시 낡은 표현으로 돌아가지 않도록 테스트를 추가한다.
- Development direction: 결제 로직을 크게 바꾸지 않고, 사용자에게 보이는 설명과 운영 문서를 먼저 정확하게 만든다.
- Risks:
  - 문구가 너무 길어지면 모바일 결제 모달에서 줄바꿈이 늘어날 수 있으므로 배포 전 화면 확인이 필요하다.
  - 테스트 결제 완료 표시는 여전히 브라우저 보조 상태이며 결제 증명으로 쓰면 안 된다.
  - 실제 live payment 전환은 토스 라이브 키, 약관/환불/개인정보 고지, 운영 정산 확인이 별도로 필요하다.
- Notes:
  - 이 사이클에서 push와 deploy는 하지 않았다.
  - `npm test` 23개가 모두 통과했다.
  - TODO.md의 해당 항목은 로컬 완료로 체크했다.

## Round 7 - 2026-06-07 04:22 KST

### 요약

이번 사이클은 `TD-012 결제 결과 식별자 노출 최소화`를 개발했습니다. 쉽게 말하면, 토스 테스트 결제 승인에 필요한 확인값은 서버 승인 요청에만 쓰고, 사용자 화면이나 브라우저 저장소, 주소창에는 오래 남기지 않도록 줄인 작업입니다. 결제 기능을 바꾸기보다 민감할 수 있는 식별자가 덜 노출되게 정리했습니다.

### TD-012 - 결제 결과 식별자 노출 최소화

- Priority: `P1`
- Status: `done_local`
- Source agents: Director, UX/UI, Security/Review, QA, Ops Log
- What: 결제 결과 화면에서 원문 `paymentKey` 표시를 제거하고, 승인 처리에 필요한 동안만 메모리에서 사용한다.
- Why: `paymentKey`는 테스트 결제 승인에 필요한 식별자입니다. 테스트 환경이라도 화면, 주소창, 브라우저 저장소에 오래 남기면 공유/복사/로그 노출 위험이 커집니다.
- First development unit:
  - `payment-result.html`의 원문 결제키 행을 `테스트 결제 접수 상태`로 바꾼다.
  - `payment-result.js`는 `paymentKey`를 `confirmTossPayment` 호출에만 사용하고 화면에는 쓰지 않는다.
  - `momentclub:toss-last-auth` 저장값에서 `paymentKey`를 제거한다.
  - 성공/실패 callback query는 필요한 값을 모두 읽은 뒤 `history.replaceState`로 정리한다.
  - `payment-result.html`에 `referrer` no-referrer meta를 추가한다.
  - 같은 회귀가 돌아오면 실패하는 테스트를 추가한다.
- Development direction: 서버 승인 흐름은 그대로 두고, 화면/저장소/주소창 노출 면적만 줄인다.
- Risks:
  - 초기 Toss callback URL은 JS가 실행되기 전 잠깐 존재할 수 있어 모든 로그 노출을 완전히 없애는 것은 아니다.
  - URL을 정리하면 실패 후 새로고침으로 같은 승인 요청을 재시도하는 UX는 약해진다.
  - 운영 전에는 결제 식별자 마스킹/로그 정책을 서버 쪽에서도 다시 확인해야 한다.
- Notes:
  - 이 사이클에서 push와 deploy는 하지 않았다.
  - `npm test` 24개가 모두 통과했다.
  - 배포 후에는 payment-result 성공/실패 callback 화면에서 인증값이 직접 노출되지 않는지 확인한다.

## Round 8 - 2026-06-07 04:26 KST

### 요약

이번 사이클은 `정원/잔여석/자동 마감` P0 패키지를 실제 구현 전에 다시 쪼갰습니다. 쉽게 말하면, “정원이 10명인데 12명이 결제되는 사고”를 막는 핵심 작업입니다. 다만 이 작업은 Supabase DB migration, 두 개의 Edge Function, 공개 화면, 관리자 화면이 모두 맞물려 있어 순서를 틀리면 결제가 막히거나 과판매가 생길 수 있습니다. 그래서 이번 라운드는 코드 구현이 아니라 안전한 구현 순서와 검증 기준을 확정하는 데 집중했습니다.

### TD-019 - 정원/잔여석 P0 롤아웃 명세

- Priority: `P0`
- Status: `done_local`
- Source agents: Director, DB/Backend, Security/Review, UX/UI, QA, Ops Log
- What: TD-001, TD-002, TD-003, TD-004, TD-009, TD-010을 하나의 배포 가능한 패키지로 묶고 안전한 구현 순서를 확정한다.
- Why: 정원 필드만 추가하거나 UI 배지만 먼저 바꾸면 실제 과판매를 막지 못합니다. 반대로 Edge Function이 새 컬럼을 먼저 읽으면 DB migration 전 배포에서 결제/신청이 깨질 수 있습니다.
- First development unit:
  - DB migration으로 `meetups.capacity`, `meetups.registration_status`, `meetups.closed_at`, `meetups.close_reason`, `orders.expires_at`를 추가한다.
  - 기존 Toss `pending` 주문은 `created_at + interval '30 minutes'` 같은 명시 정책으로 backfill한다.
  - 좌석 점유는 `paid`, `demo_paid`, 만료되지 않은 `pending`만 계산한다.
  - `create_public_application`과 `create_public_order`는 meetup row를 `FOR UPDATE`로 잠그고, `MEETUP_SOLD_OUT`, `MEETUP_REGISTRATION_CLOSED` 같은 안정적인 에러 코드를 발생시킨다.
  - `confirm-toss-payment`는 만료된 pending 주문을 결제 승인하기 전에 막거나, 적어도 capacity를 다시 확인해야 한다.
  - `create-public-submission`은 sold-out/closed 에러를 HTTP 409와 사용자용 한국어 메시지로 변환한다.
  - 공개 화면은 기존 `status_label` 대신 계산된 `remaining_spots`와 `effective_registration_status`를 신청/결제 가능 여부의 기준으로 쓴다.
  - 관리자 화면은 `운영 설정` 영역에 정원/신청 상태를 추가하고, 목록에는 좌석 요약을 보여준다.
- Development direction: DB가 최종 차단선을 맡고, Edge Function은 안정적인 상태 코드를 사용자에게 번역하며, 프론트엔드는 그 결과를 이해하기 쉽게 보여준다.
- Rollout order:
  - 1. DB migration 적용: 새 컬럼, helper 함수, view, RPC 갱신, pending backfill.
  - 2. Supabase SQL/RPC smoke test: unlimited, capacity 1, sold out, closed, expired pending.
  - 3. `confirm-toss-payment` 배포: `expires_at` 컬럼 존재 이후에만 배포.
  - 4. `create-public-submission` 배포: sold-out/closed를 409로 매핑.
  - 5. frontend/admin 배포: 공개 조회와 관리자 폼/목록이 새 구조를 사용.
  - 6. 실제 Pages 배포 후 public/admin/Toss test callback 수동 확인.
- Rollback:
  - 가장 빠른 기능 롤백은 `meetups.capacity = null`로 전체를 무제한 상태로 되돌리는 것입니다.
  - 급한 상황에서도 새 컬럼을 바로 drop하지 않습니다.
  - RPC 정의는 이전 migration의 함수 정의로 되돌릴 수 있게 보관합니다.
  - anon direct insert lock은 되열지 않습니다. 이걸 열면 row lock을 우회해 과판매 위험이 돌아옵니다.
- Verification:
  - `capacity = 2`에서 유효 주문 생성 시 잔여석이 `2 -> 1 -> 0`으로 줄어드는지 확인한다.
  - `capacity = null`은 무제한으로 계속 접수 가능한지 확인한다.
  - `paid`, `demo_paid`, 만료되지 않은 Toss `pending`만 좌석을 차지하는지 확인한다.
  - `cancelled`, `failed`, 만료된 `pending`은 좌석을 돌려주는지 확인한다.
  - 마지막 1석에 동시 주문 2개를 보내면 정확히 1개만 성공하고 1개는 409인지 확인한다.
  - 만료된 pending 주문의 늦은 Toss success가 과판매를 만들지 않는지 확인한다.
  - public card/detail/checkout/application form이 마감/신청 종료 상태에서 비활성화되는지 확인한다.
  - admin form/list가 정원, 결제중, 확정, 잔여석을 구분해 보여주는지 확인한다.
- Risks:
  - `registration_status = sold_out`를 DB에 저장하면 실제 주문 취소 후 상태가 낡을 수 있습니다. 수동 상태는 `closed` 중심으로 쓰고 sold-out은 계산값으로 도출하는 편이 안전합니다.
  - 기존 `status_label`은 계속 홍보/상태 문구로 남기되, 신청/결제 가능 여부 판단에 쓰면 안 됩니다.
  - pending 만료 시간을 너무 길게 잡으면 결제 이탈자가 자리를 오래 붙잡고, 너무 짧게 잡으면 결제 중인 사용자가 늦은 성공에서 실패할 수 있습니다. 첫 후보는 30분입니다.
  - 이 작업은 원격 Supabase migration과 Edge Function 배포가 필요하므로 밤중 자동 개발에서 바로 적용하지 않습니다.
- Notes:
  - 이번 사이클에서 기능 코드, 원격 DB, Edge Function 배포, push는 하지 않았다.
  - TODO.md에 P0 실제 구현 항목을 추가했다.
  - AGENTIC_STATUS.json에는 AG-0020 문서화 작업으로 기록한다.

## Round 9 - 2026-06-07 04:36 KST

### 요약

이번 사이클은 `정원/잔여석/자동 마감` P0 패키지의 첫 번째 실제 개발 조각을 만들었습니다. 쉽게 말하면, “몇 명까지 받을 수 있는지”와 “결제창을 열고 이탈한 주문이 언제 자리를 놓아주는지”를 Supabase DB가 이해할 수 있게 하는 기초 공사입니다. 아직 사용자가 보는 화면이나 실제 원격 Supabase에는 반영하지 않았고, 다음 단계에서 Edge Function이 이 계약을 사용하도록 연결해야 합니다.

### TD-020 - 정원/잔여석 DB 계약 1단계

- Priority: `P0`
- Status: `done_local`
- Source agents: Director, Security/Review, UX/UI, QA, Ops Log
- What: 정원/잔여석 계산에 필요한 DB 컬럼과 보조 함수를 Supabase migration 초안으로 추가한다.
- Why: 현재 `status_label`은 사람이 적는 문구라 실제 결제 수와 다를 수 있습니다. 정원을 안전하게 막으려면 화면 문구가 아니라 DB가 계산하는 기준이 먼저 있어야 합니다.
- First development unit:
  - `meetups.capacity`: 정원, `NULL`이면 무제한.
  - `meetups.registration_status`: 사람이 직접 닫는 신청 상태. `open`, `closed`만 저장하고 `sold_out`은 계산한다.
  - `meetups.closed_at`, `meetups.close_reason`: 운영자가 신청을 닫은 이유 기록.
  - `orders.expires_at`: Toss `pending` 주문이 자리를 붙잡는 만료 시각.
  - 기존 Toss `pending` 주문은 `created_at + interval '30 minutes'`로 backfill한다.
  - `get_meetup_seat_snapshot`: 정원, 유효 주문 수, 잔여석, 계산된 신청 상태를 돌려주는 함수.
  - `assert_meetup_can_register`: 모임 row를 `FOR UPDATE`로 잠그고 `MEETUP_SOLD_OUT`, `MEETUP_REGISTRATION_CLOSED`를 발생시키는 함수.
  - `expire_stale_pending_orders`: 오래된 pending 주문을 정리하는 보조 함수.
- Development direction: 실제 신청/결제 생성 RPC와 Edge Function은 다음 단계에서 `assert_meetup_can_register`를 호출하도록 연결한다.
- Risks:
  - 이 migration만 원격 적용해도 아직 공개 화면이나 Edge Function은 새 상태를 사용하지 않습니다.
  - `confirm-toss-payment`는 다음 단계에서 Toss 승인 API를 호출하기 전에 `expires_at`을 먼저 확인해야 합니다.
  - `sold_out`을 DB에 저장하지 않는 이유는 주문 취소/실패/만료 후 상태가 낡을 수 있기 때문입니다.
- Notes:
  - 이번 사이클에서 원격 Supabase migration 적용, Edge Function deploy, GitHub Pages deploy, push는 하지 않았다.
  - `TODO.md`의 Current Priority Queue를 현재 상태에 맞게 다시 정렬했다.
  - `tests/paymentSecurity.test.js`에 migration 계약 테스트를 추가했다.
  - `npm test` 25개가 모두 통과했다.

## Round 10 - 2026-06-07 04:47 KST

### 요약

이번 사이클은 정원/잔여석 P0 패키지의 백엔드 guard를 한 단계 더 연결했습니다. 쉽게 말하면, 정원이 찼거나 운영자가 신청을 닫은 모임에 새 신청/주문이 들어오지 않도록 public RPC가 DB의 정원 확인 함수를 먼저 거치게 했고, 결제창을 열고 오래 지나 만료된 Toss 주문은 외부 승인 API를 호출하기 전에 막도록 했습니다. 아직 원격 Supabase나 GitHub Pages에는 반영하지 않았습니다.

### TD-021 - 정원/마감 public RPC와 Edge guard 연결

- Priority: `P0`
- Status: `done_local`
- Source agents: Director, Security/Review, QA, Ops Log
- What: 공개 신청/주문 생성 RPC와 Toss 승인 Edge Function이 정원/마감/만료 pending 상태를 확인하도록 연결한다.
- Why: DB에 정원 필드만 있어도 실제 신청/결제 생성 경로가 그 기준을 쓰지 않으면 과모집을 막지 못합니다. 결제창 이탈 후 만료된 pending 주문도 늦게 성공으로 돌아오면 좌석 수가 어긋날 수 있습니다.
- First development unit:
  - `create_public_application`과 `create_public_order`가 `assert_meetup_can_register`를 호출한 뒤에만 insert한다.
  - 새 Toss pending 주문에는 `expires_at = now() + interval '30 minutes'`를 저장한다.
  - 정원 확인 전에 `expire_stale_pending_orders(100)`을 호출해 오래된 pending을 보수적으로 정리한다.
  - `create-public-submission`은 `MEETUP_SOLD_OUT`, `MEETUP_REGISTRATION_CLOSED`를 HTTP 409와 사용자용 메시지, 안정적인 `code`로 변환한다.
  - `confirm-toss-payment`는 만료된 pending 주문이면 Toss confirm API를 호출하기 전에 failed로 정리하고 `ORDER_EXPIRED` 409를 반환한다.
  - SQL `confirm_toss_payment_order` RPC도 row lock 아래에서 만료 pending을 paid로 바꾸지 못하게 막는다.
- Development direction: 화면은 아직 바꾸지 않고, 서버/DB 쪽 최종 차단선을 먼저 만든다. public/admin UI는 다음 사이클에서 계산된 상태를 읽고 보여주는 역할로 붙인다.
- Risks:
  - 이 변경은 Edge Function이 `orders.expires_at` 컬럼을 읽기 때문에 원격 DB migration 전에 Edge Function만 먼저 배포하면 깨질 수 있습니다.
  - Toss 승인 직전 만료 경계에 걸린 결제는 live payment 전 환불/재시도 정책을 별도로 정해야 합니다.
  - 현재 테스트는 소스 계약 테스트라 PL/pgSQL 문법이나 실제 동시성은 Supabase SQL smoke test로 다시 확인해야 합니다.
- Notes:
  - 이번 사이클에서 원격 Supabase migration 적용, Edge Function deploy, GitHub Pages deploy, push는 하지 않았다.
  - `supabase-client.js`는 결제 승인 Edge Function 실패 시 `error.status`와 `error.code`를 보존하게 맞췄다.
  - `npm test` 26개가 모두 통과했다.

## Round 11 - 2026-06-07 04:58 KST

### 요약

이번 사이클은 정원/잔여석 backend guard를 실제 Supabase에 적용하기 전에 사람이 확인할 수 있는 SQL/RPC smoke-test를 준비했습니다. 쉽게 말하면, 아침에 DB migration을 적용하기로 결정했을 때 “정원이 1명인 모임에서 두 번째 주문이 막히는지”, “신청 종료 모임이 막히는지”, “만료된 Toss pending 주문이 결제완료로 바뀌지 않는지”를 SQL Editor에서 한 번에 확인하는 점검표입니다. 테스트 데이터는 transaction 안에서 만들고 마지막에 `ROLLBACK`합니다.

### TD-022 - 정원/잔여석 SQL/RPC smoke-test 준비

- Priority: `P0`
- Status: `done_local`
- Source agents: Director, Security/Review, QA, Ops Log
- What: capacity migration 적용 후 live Supabase SQL Editor에서 실행할 smoke-test 스크립트를 만든다.
- Why: 현재 `npm test`는 소스 코드와 migration 문자열을 확인하지만, 실제 Supabase에서 PL/pgSQL 함수가 실행되는지, 권한과 schema 순서가 맞는지는 확인하지 못합니다.
- First development unit:
  - `supabase/capacity-smoke-test.sql`을 추가한다.
  - 스크립트는 `BEGIN`/`ROLLBACK`으로 감싸 테스트 row가 남지 않게 한다.
  - exact smoke id를 사용하고 wildcard `LIKE` cleanup을 피한다.
  - 무제한 정원, 정원 1명 sold-out, 신청 종료, Toss pending `expires_at`, 정상 Toss pending confirm, expired pending `ORDER_EXPIRED`, stale pending failed 처리 경로를 확인한다.
  - `supabase/README.md`에 선행 migration과 실행 순서를 명시한다.
- Development direction: 원격 DB 적용과 Edge Function deploy 전에 SQL/RPC 실행 경로를 먼저 검증한다. public/admin UI는 실제 잔여석 read contract가 정리된 뒤 붙인다.
- Risks:
  - 이 스크립트는 아직 실제 `jqnnolsyvynrhjvfmege` 프로젝트에서 실행하지 않았다.
  - 성공하더라도 Toss 외부 API 자체를 부르는 smoke-test는 아니므로 Edge Function callback 검증은 별도입니다.
  - 만료 경계에 걸린 실제 결제는 live payment 전 환불/재시도 정책이 필요합니다.
- Notes:
  - 이번 사이클에서 원격 Supabase migration 적용, Edge Function deploy, GitHub Pages deploy, push는 하지 않았다.
  - `tests/paymentSecurity.test.js`에 smoke-test 구조와 README 배포 순서 가드를 추가했다.
  - `npm test` 27개가 모두 통과했다.
