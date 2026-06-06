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
