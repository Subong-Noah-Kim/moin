# Agentic Work Log

이 문서는 moin 프로젝트의 Agentic 작업 진행 기록입니다. 제품/개발 백로그는 `TODO.md`를 기준으로 관리하고, 이 파일은 Agent/Subagent 운영 과정과 작업 이력을 별도로 기록합니다.

## 2026-06-07

### AG-0001 - Agentic 작업 체계 초기화

- Status: `done_local`
- Branch: `codex/priority-roadmap-batch`
- Director Agent: main Codex thread
- Purpose: 우선순위 작업을 여러 역할 Agent/Subagent로 분리해 진행하기 위한 운영 규칙과 로그 파일을 만든다.
- Changed files:
  - `AGENTIC_WORKFLOW.md`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - `TODO.md`는 백로그 기준 파일로 유지한다.
  - Agentic 진행 기록은 이 파일에 별도로 남긴다.
  - 사용자가 나중에 배포할 작업을 선택할 수 있도록 `main`이 아닌 별도 브랜치에서 작업한다.
- Verification:
  - `npm test` passed: 13 tests.
- Next:
  - 총괄 디렉터 Agent가 기획/검토/보안/QA/개발 Subagent를 단계별로 투입한다.
  - 첫 실제 개발 후보는 `TODO.md`의 현재 우선순위에서 선택한다.

### AG-0002 - 관리자 Agentic 현황판 추가

- Status: `done_local`
- Branch: `codex/priority-roadmap-batch`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent
- Purpose: 각 Agent와 Task가 어떤 상태인지 관리자 페이지 안에서 한눈에 볼 수 있는 작은 작업판을 추가한다.
- Changed files:
  - `AGENTIC_STATUS.json`
  - `admin.html`
  - `admin.css`
  - `admin.js`
  - `tests/paymentSecurity.test.js`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - 현황판 데이터는 공개 가능한 정적 JSON만 사용한다.
  - 관리자 대시보드가 열린 뒤 `AGENTIC_STATUS.json`을 읽어 렌더링한다.
  - 비밀값, 토큰, 고객 개인정보는 현황판 데이터에 넣지 않는다.
- Verification:
  - `npm test` passed: 14 tests.
  - Local dev server served `admin.html`, `admin.js`, and `AGENTIC_STATUS.json` with HTTP 200.
  - Static JSON parsed as branch `codex/priority-roadmap-batch`, 9 agents, 2 tasks.
- Next:
  - 기획/검토/보안 Subagent를 투입해 다음 개발 후보를 분류한다.

### AG-0003 - UX/UI Agent 역할 추가

- Status: `done_local`
- Branch: `codex/priority-roadmap-batch`
- Director Agent: main Codex thread
- Owner Agent: 총괄 디렉터
- Purpose: 기획 Agent와 별도로 화면 흐름, 모바일 사용성, 접근성, 시각적 밀도, 인터페이스 품질을 검토하는 UX/UI Agent 역할을 추가한다.
- Changed files:
  - `AGENTIC_WORKFLOW.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
  - `tests/paymentSecurity.test.js`
- Notes:
  - 기획 Agent는 서비스 관점의 기능 후보를 정의한다.
  - UX/UI Agent는 기능 후보와 구현 결과가 실제 화면에서 자연스럽고 사용하기 쉬운지 검토한다.
  - 검토 Agent의 우선순위 판단 기준에 UX/UI 영향을 포함한다.
- Verification:
  - `npm test` passed: 14 tests.
  - Agentic status JSON now includes `UX/UI Agent`.
- Next:
  - 기획/UX/UI/검토 Subagent를 투입해 다음 개발 후보를 분류한다.

### AG-0004 - Agentic 현황화면 선배포

- Status: `deployed`
- Branch: `main`
- Director Agent: main Codex thread
- Owner Agent: 총괄 디렉터
- Purpose: 관리자 Agentic 현황화면을 먼저 GitHub Pages에 배포해 실제 화면을 확인한다.
- Changed files:
  - `.github/workflows/deploy-pages.yml`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
  - `tests/paymentSecurity.test.js`
- Notes:
  - Pages artifact에 `AGENTIC_STATUS.json`을 포함해야 관리자 화면의 작업판 fetch가 성공한다.
  - 브랜치 기준 workflow_dispatch 배포는 Pages deploy job이 실행 단계 없이 실패해 `main` 병합 배포로 전환했다.
  - `main` 배포 workflow가 test/deploy 모두 성공했다.
  - 배포된 `admin.html`, `admin.js`, `AGENTIC_STATUS.json`을 URL에서 직접 확인했다.
- Verification:
  - `npm test` passed: 14 tests.
  - GitHub Actions `deploy-pages.yml` test/deploy jobs passed on `main`.
  - Deployed admin page uses the current deploy asset version.
- Next:
  - 기획/UX/UI/검토 Subagent를 투입해 다음 개발 후보를 분류한다.

### AG-0005 - Agentic 작업판 별도 탭 분리

- Status: `deployed`
- Branch: `main`
- Director Agent: main Codex thread
- Owner Agent: UX/UI Agent + 개발 Agent
- Purpose: 관리자 페이지 첫 진입 화면에서 내부 Agentic 작업판이 크게 노출되지 않도록 별도 `작업판` 탭으로 분리한다.
- Changed files:
  - `admin.html`
  - `admin.css`
  - `admin.js`
  - `tests/paymentSecurity.test.js`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - 기본 활성 탭은 `신청`으로 유지한다.
  - `Agentic 작업판`은 `작업판` 탭을 눌렀을 때만 보인다.
  - 작업판 JSON은 기본 진입 시 자동 호출하지 않고, 작업판 탭 진입 또는 작업판 새로고침 시 호출한다.
- Verification:
  - `npm test` passed: 14 tests.
  - GitHub Actions `deploy-pages.yml` test/deploy jobs passed on `main`.
  - Deployed `admin.html` contains the `작업판` tab and hides the Agentic panel by default.
- Next:
  - 기획/UX/UI/검토 Subagent를 투입해 다음 개발 후보를 분류한다.

### AG-0006 - 로컬 Agent Live Monitor 추가

- Status: `done_local`
- Branch: `main`
- Director Agent: main Codex thread
- Owner Agent: 총괄 디렉터 + 개발 Agent
- Purpose: 배포된 관리자 작업판과 별도로, localhost에서 현재 Agent 작업 흐름을 볼 수 있는 로컬 전용 모니터를 만든다.
- Changed files:
  - `agent-monitor.html`
  - `agent-monitor.css`
  - `agent-monitor.js`
  - `AGENTIC_LIVE_STATUS.json`
  - `server.js`
  - `AGENTIC_WORKFLOW.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
  - `tests/paymentSecurity.test.js`
- Notes:
  - `agent-monitor.html`은 `npm run dev`로 연 로컬 서버에서 확인한다.
  - `AGENTIC_LIVE_STATUS.json`은 브라우저가 보이는 동안만 주기적으로 다시 읽는다.
  - GitHub Pages workflow에는 로컬 모니터 파일을 복사하지 않는다.
- Verification:
  - `npm test` passed: 15 tests.
  - Local dev server served `agent-monitor.html`, `agent-monitor.js`, and `AGENTIC_LIVE_STATUS.json` with HTTP 200.
- Next:
  - 장시간 작업을 시작할 때 총괄 디렉터 Agent가 live status를 단계별로 갱신한다.

### AG-0007 - 현황판 Task 상세 설명 추가

- Status: `done_local`
- Branch: `main`
- Director Agent: main Codex thread
- Owner Agent: 작업 정리 Agent + 개발 Agent
- Purpose: Agentic 현황판의 Task를 눌렀을 때 비개발자도 작업의 의미, 필요성, 개발 방향, 주의사항을 이해할 수 있게 한다.
- Changed files:
  - `admin.js`
  - `admin.css`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_WORKFLOW.md`
  - `AGENTIC_WORK_LOG.md`
  - `tests/paymentSecurity.test.js`
- Notes:
  - Task 상세 데이터는 `details.summary`, `details.what`, `details.why`, `details.developmentDirection`, `details.notes` 형식으로 기록한다.
  - 내용이 길어질 때는 `summary`를 먼저 읽을 수 있게 작성한다.
  - 비밀값, 토큰, 고객 개인정보는 기록하지 않는다.
- Verification:
  - `npm test` passed: 15 tests.
- Next:
  - 앞으로 작업 정리 Agent가 새 Task를 추가할 때 같은 상세 설명 형식을 함께 채운다.

### AG-0008 - 밤샘 태스크 발굴 라운드 1

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 총괄 디렉터 + 실제 subagents
- Purpose: 배포 없이 아침에 고를 수 있는 다음 개발 후보를 실제 subagent로 계속 발굴한다.
- Changed files:
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_WORKFLOW.md`
  - `AGENTIC_WORK_LOG.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
- Notes:
  - DB/Backend Agent는 정원/잔여석/자동 마감의 DB/RPC/Edge Function 단위를 분해했다.
  - 보안 Agent는 관리자 세션 저장, Toss 승인값 노출 최소화, Agent status 민감정보 가드를 분해했다.
  - UX/UI Agent는 잔여석 표시, 마감 CTA, 관리자 정원 입력, 모바일 CTA를 분해했다.
  - QA Agent는 정규식 테스트를 넘어 실제 데이터 전이와 DOM 결과 검증이 필요하다고 제안했다.
- Verification:
  - `npm test` passed: 15 tests.
- Next:
  - 다음 라운드에서는 TD-001~TD-008 중 구현 순서와 첫 커밋 단위를 더 좁힌다.

### AG-0009 - 현황판 Task 카드 클릭 상세 보기 수정

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + UX/UI Agent + 작업 정리 Agent
- Purpose: 현황판 Task 카드에서 작은 `상세 보기` 문구만 눌러야 설명이 열리던 문제를 고쳐, 카드 자체를 눌러도 상세 설명을 볼 수 있게 한다.
- Changed files:
  - `admin.js`
  - `admin.css`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
  - `tests/paymentSecurity.test.js`
- Notes:
  - 상세 데이터가 있는 Task 카드에만 클릭 가능한 상태와 키보드 포커스를 부여한다.
  - 카드 클릭, Enter, Space로 상세 설명을 열고 닫을 수 있게 한다.
  - 펼쳐진 상세 설명 내부를 읽거나 선택할 때는 불필요하게 다시 접히지 않게 한다.
- Verification:
  - `npm test` passed: 15 tests.
- Next:
  - 로컬 관리자 작업판에서 카드 클릭 동작을 확인한다.

### AG-0010 - 로컬 현황판 Task 상세 패널 추가

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + QA Agent + 작업 정리 Agent
- Purpose: 휴대폰으로 보는 로컬 `agent-monitor.html`에서도 Task를 눌러 작업 설명을 확인할 수 있게 한다.
- Changed files:
  - `agent-monitor.html`
  - `agent-monitor.css`
  - `agent-monitor.js`
  - `server.js`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
  - `tests/paymentSecurity.test.js`
- Notes:
  - 이전 수정은 관리자 페이지 안의 작업판에만 적용되어 있었다.
  - 로컬 모니터는 `AGENTIC_LIVE_STATUS.json`만 읽고 있었기 때문에 Task 상세 설명을 보여줄 데이터가 없었다.
  - 로컬 모니터가 `AGENTIC_STATUS.json`도 함께 읽어 `작업 상세` 패널을 만들고, Task 카드 클릭/Enter/Space로 상세 설명을 열게 했다.
  - 휴대폰 브라우저가 오래된 파일을 계속 쓰는 문제를 줄이기 위해 로컬 dev 서버 응답에 `Cache-Control: no-store`를 추가했다.
- Verification:
  - `npm test` passed: 15 tests.
  - Local dev server returned HTTP 200 for `agent-monitor.js`.
  - Local dev server response included `Cache-Control: no-store`.
  - Local dev server served the new `작업 상세` panel and Task click handler code.
- Next:
  - 휴대폰에서 `agent-monitor.html`을 새로고침한 뒤 `작업 상세` 섹션의 Task 카드를 눌러 확인한다.

### AG-0011 - 로컬 현황판 Task 펼침 상태 유지

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + QA Agent + 작업 정리 Agent
- Purpose: 휴대폰 로컬 현황판에서 펼쳐둔 작업 상세가 새로고침 후에도 다시 접히지 않게 한다.
- Changed files:
  - `agent-monitor.js`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
  - `tests/paymentSecurity.test.js`
- Notes:
  - Task 상세가 열리거나 닫힐 때 해당 Task id를 브라우저 `localStorage`에 저장한다.
  - 현황판이 다시 렌더링될 때 저장된 Task id에 해당하는 상세 영역은 `open` 상태로 복원한다.
  - 카드 전체 클릭뿐 아니라 `상세 보기` summary를 직접 눌러도 저장되도록 `toggle` 이벤트를 감지한다.
  - 브라우저 저장소를 사용할 수 없는 환경에서도 현황판은 계속 동작하며, 그 경우에만 펼침 상태가 유지되지 않는다.
- Verification:
  - `npm test` passed: 15 tests.
  - Local dev server served `agent-monitor.js` with the open task storage key and toggle handler.
- Next:
  - 휴대폰에서 작업 상세를 펼친 뒤 새로고침해 열린 상태가 유지되는지 확인한다.

### AG-0012 - 수동 하트비트 사이클 2

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 총괄 디렉터 + 실제 subagents
- Purpose: 10분 하트비트 규칙으로 한 사이클을 즉시 실행해 다음 개발 후보를 다시 발굴하고 우선순위를 정리한다.
- Subagents:
  - Planning Agent: Newton
  - UX/UI Agent: Averroes
  - Security Agent: Hubble
  - QA Agent: Rawls
- Changed files:
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - Round 1의 `정원/잔여석/자동 마감` P0 판단은 유지한다.
  - 보안/QA Agent가 `pending` 주문을 좌석 점유로 계산할 경우 결제창 이탈자가 좌석을 계속 붙잡을 수 있다는 리스크를 추가로 확인했다.
  - Round 2에 TD-009 pending 주문 만료 정책, TD-010 정원 P0 구현 패키지 순서, TD-013 Agent status 민감정보 denylist 테스트를 새 후보로 정리했다.
  - 작은 다음 구현 후보는 배포 없이 가능한 TD-013이다.
  - 큰 다음 구현 후보는 Supabase SQL/Edge Function 배포 계획이 필요한 TD-009/TD-010이다.
- Verification:
  - Subagents completed read-only analysis.
  - `npm test` passed: 15 tests.
- Next:
  - 사용자가 작은 안전망 작업을 원하면 TD-013부터 구현한다.
  - 사용자가 핵심 서비스 리스크를 먼저 잡고 싶으면 TD-009/TD-010 설계와 구현을 시작한다.

### AG-0013 - Agent status 민감정보 가드 테스트

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + QA Agent + 보안 Agent
- Purpose: 배포될 수 있는 Agentic 현황 JSON에 토큰, 결제 식별자, service role 같은 민감정보가 실수로 들어가면 테스트에서 막는다.
- Changed files:
  - `tests/paymentSecurity.test.js`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - JSON을 재귀적으로 훑어 민감한 필드명과 실제 값처럼 보이는 문자열 패턴을 검사한다.
  - 설명 문장에 보안 개념을 언급하는 것은 허용하고, 실제 값처럼 보이는 패턴이나 민감한 구조 필드만 실패시킨다.
  - 실패 메시지는 실제 매칭값을 출력하지 않고 JSON 경로와 규칙명만 보여준다.
  - TD-013은 `done_local`로 갱신했다.
- Verification:
  - `npm test` passed: 16 tests.
- Next:
  - 다음 작은 안전망 후보는 TD-014 public localStorage 파싱 복원력이다.
  - 다음 핵심 서비스 후보는 TD-009/TD-010 정원 P0 패키지다.

### AG-0014 - public localStorage 파싱 복원력

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + QA Agent + 보안 Agent
- Purpose: 공개 페이지의 브라우저 저장값이 깨져 있어도 모임 목록과 결제 결과 페이지가 계속 렌더링되게 한다.
- Subagents:
  - QA Agent: Cicero
  - Security Agent: Aquinas
- Changed files:
  - `main.js`
  - `payment-result.js`
  - `tests/paymentSecurity.test.js`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - `momentclub:saved`, `momentclub:notified`, `momentclub:paid`만 TD-014 범위로 처리했다.
  - 관리자 세션, Toss customer key, Toss last auth storage는 건드리지 않았다.
  - invalid JSON, 배열이 아닌 값, storage 읽기/삭제 실패가 있어도 페이지 렌더링을 막지 않는다.
  - 빈 값, 너무 긴 값, 과도하게 많은 값은 저장 상태에서 제외한다.
  - `momentclub:paid`는 UI 표시 보조 상태일 뿐 결제 증명으로 사용하지 않는다.
- Verification:
  - `npm test` passed: 17 tests.
- Next:
  - 다음 작은 안전망 후보는 결제 결과 식별자 노출 최소화 TD-012다.
  - 다음 핵심 서비스 후보는 TD-009/TD-010 정원 P0 패키지다.

### AG-0015 - GitHub Pages workflow runtime 정리

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + QA Agent + 보안 Agent + 작업 정리 Agent
- Purpose: GitHub Pages 배포 자동화가 GitHub Actions의 Node runtime 변화 때문에 갑자기 경고나 실패를 내지 않도록 workflow를 정리한다.
- Changed files:
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
  - `.github/workflows/deploy-pages.yml`
  - `tests/paymentSecurity.test.js`
- Notes:
  - 이 작업은 사용자 화면을 바꾸는 기능 개발이 아니라, 배포 자동화가 앞으로도 안정적으로 돌아가게 하는 운영 정리 작업이다.
  - 개발 방향은 action 버전 정책 확정, test/deploy job 권한 분리, 자동 테스트 가드 추가, 이후 실제 GitHub Actions 배포 로그 확인 순서다.
  - 보안 관점에서는 배포 권한을 test job까지 넓게 주지 않고 deploy job에만 두는 방향이 좋다.
  - QA 관점에서는 workflow에 적힌 action 버전과 테스트가 기대하는 action 버전이 반드시 같아야 한다.
  - 이 사이클에서 push와 deploy는 하지 않았다.
- Risks:
  - action major version을 올리면 GitHub-hosted runner에서는 보통 안전하지만, action별 새 요구 조건과 동작 변경을 확인해야 한다.
  - artifact 업로드 action의 숨김 파일 처리 변화는 향후 `.nojekyll`이나 `.well-known` 배포가 필요해질 때 다시 확인해야 한다.
  - runtime 경고 제거 여부는 로컬 테스트만으로 확정할 수 없고, 실제 GitHub Actions 실행 로그에서 확인해야 한다.
- Verification:
  - Development Agent가 workflow/test 정합성을 맞췄다.
  - `npm test` passed: 18 tests.
  - 실제 GitHub Actions fresh deploy warning 확인은 아직 하지 않았다.
- Next:
  - 사용자가 배포를 선택하면 fresh deploy run에서 runtime warning이 사라졌는지 확인한다.

### AG-0016 - 관리자 세션 저장소 축소

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + QA Agent + 보안 Agent + 작업 정리 Agent
- Purpose: 관리자 로그인 정보를 브라우저에 오래 남기지 않도록 세션 저장 방식을 짧게 줄이고, 쓰지 않는 refresh token 저장을 제거한다.
- Subagents:
  - Security Agent: Arendt
  - QA Agent: Erdos
- Changed files:
  - `supabase-client.js`
  - `admin.js`
  - `tests/paymentSecurity.test.js`
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - 관리자 세션은 `sessionStorage`에만 저장한다.
  - 기존 `localStorage` 세션은 보안을 위해 옮기지 않고 삭제한다.
  - 저장되는 세션에서 refresh token을 제거했다.
  - 깨진 JSON이나 만료된 세션을 읽으면 저장소를 비우고 다시 로그인 안내를 보여준다.
  - 초대/인증 토큰이 URL에 있으면 유효하지 않은 초대 링크라도 주소창에서 제거한다.
  - 배포 후 관리자는 브라우저 탭/창을 닫으면 다시 로그인해야 할 수 있다.
- Verification:
  - Security Agent가 refresh token 저장, legacy localStorage 마이그레이션, 손상/만료 세션 방치를 block 항목으로 확인했다.
  - QA Agent 제안에 따라 소스 가드와 메모리 저장소 기반 행동 테스트를 추가했다.
  - `npm test` passed: 20 tests.
- Next:
  - 사용자가 배포 묶음에 포함하면 live 관리자 페이지에서 Application Storage를 확인한다.

### AG-0017 - 신청/결제 폼 label 접근성 개선

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + UX/UI Agent + QA Agent + 보안/검토 Agent
- Purpose: 공개 신청/결제 폼의 입력칸이 placeholder에만 의존하지 않게 만들어, 입력 후에도 어떤 칸인지 계속 보이고 접근성 도구가 의미를 정확히 읽을 수 있게 한다.
- Subagents:
  - UX/UI Agent: Popper
  - QA Agent: Euler
  - Security/Review Agent: Anscombe
- Changed files:
  - `main.js`
  - `styles.css`
  - `tests/paymentSecurity.test.js`
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - 신청 폼 `이름`, `이 모임에 끌린 이유` 입력에 명시적 label을 추가했다.
  - 결제 폼 이름 입력은 `결제자 이름 (선택)`으로 문구를 구체화했다.
  - 각 입력에 helper text를 화면에 보이게 두고 `aria-describedby`로 연결했다.
  - 동적 id는 `createFieldId()`로 안전한 ASCII 조각으로 정규화하고 `escapeAttribute`를 거쳐 사용한다.
  - 기존 `name="name"`, `name="interest"`, `name="payer"`, `name="method"` 흐름은 유지했다.
- Verification:
  - UX/UI Agent가 label 문구와 모바일 수동 확인 기준을 제안했다.
  - QA Agent가 placeholder-only 회귀 방지 테스트 기준을 제안했다.
  - Security/Review Agent가 동적 id escaping, 개인정보 과수집 문구 금지, 테스트 결제 오해 문구 금지를 확인했다.
  - `npm test` passed: 21 tests.
  - Local dev server returned HTTP 200 for `index.html` and served updated `main.js`/`styles.css`.
- Next:
  - 사용자가 배포 묶음에 포함하면 모바일에서 신청 drawer와 결제 modal의 label 간격을 직접 확인한다.

### AG-0018 - 제품/데모 결제 문구와 설정 문서 정리

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + 기획 Agent + QA Agent + 보안/검토 Agent + 작업 정리 Agent
- Purpose: 토스 테스트 결제와 실제 과금이 헷갈리지 않도록 공개 화면과 설정 문서를 현재 구현 상태에 맞게 정리한다.
- Subagents:
  - Planning/Copy Agent: Pascal
  - QA Agent: Carson
  - Security/Review Agent: Franklin
- Changed files:
  - `README.md`
  - `supabase/README.md`
  - `main.js`
  - `payment-result.html`
  - `payment-result.js`
  - `tests/paymentSecurity.test.js`
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - `결제 완료`처럼 단독으로 보이는 표현을 `테스트 결제 확인`, `데모 결제 표시`, `테스트 결제 승인`처럼 더 구체적인 문구로 바꿨다.
  - 결제 모달은 토스 테스트 결제창과 Supabase Edge Function 승인 흐름을 설명하고, 실제 출금이 없다는 점을 계속 보여준다.
  - 결제 결과 화면은 주문 상태와 결제 기록 업데이트를 설명하되, 내부 서버 설정 이름이나 원문 오류를 사용자에게 그대로 보여주지 않는다.
  - README와 Supabase README는 현재 연결된 Edge Function 흐름과 실제 라이브 결제 전 준비 항목을 분리해 설명한다.
  - 위험한 옛 문구가 다시 들어오면 `npm test`가 실패하도록 문구 회귀 테스트 2개를 추가했다.
  - 이 사이클에서 push와 deploy는 하지 않았다.
- Verification:
  - Planning/Copy Agent가 테스트 결제와 실결제 오해를 줄이는 문구 기준을 승인했다.
  - Security/Review Agent가 `결제가 완료됐어요`, 내부 설정명 노출, 원문 오류 노출을 block으로 잡았고 수정했다.
  - QA Agent 제안에 따라 문서/공개 화면 문구 테스트를 추가했다.
  - `npm test` passed: 23 tests.
- Next:
  - 사용자가 배포 묶음에 포함하면 public checkout modal, 데모 fallback 버튼, payment-result success/fail 화면을 직접 확인한다.

### AG-0019 - 결제 결과 식별자 노출 최소화

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + UX/UI Agent + QA Agent + 보안/검토 Agent + 작업 정리 Agent
- Purpose: 토스 테스트 결제 승인에 필요한 확인값이 화면, 주소창, 브라우저 저장소에 오래 남지 않게 줄인다.
- Subagents:
  - Security/Review Agent: Kuhn
  - QA Agent: Darwin
  - UX/UI Planning Agent: Tesla
- Changed files:
  - `payment-result.html`
  - `payment-result.js`
  - `tests/paymentSecurity.test.js`
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - `paymentKey`는 `confirmTossPayment` 호출에는 계속 사용한다.
  - 결제 결과 화면의 원문 결제키 행은 `테스트 결제 접수 상태`로 바꿨다.
  - `momentclub:toss-last-auth`에는 `paymentKey`를 저장하지 않고 주문번호, 금액, 수신시각 요약만 저장한다.
  - 성공/실패 callback query는 필요한 값을 모두 읽은 뒤 `history.replaceState`로 주소창에서 정리한다.
  - `payment-result.html`에 `meta name="referrer" content="no-referrer"`를 추가했다.
  - 이 작업은 노출을 줄이는 조치이며, 초기 callback URL이 브라우저에 도착하는 순간 자체를 없애는 것은 아니다.
  - URL을 정리하므로 실패 후 새로고침으로 같은 승인 요청을 재시도하는 흐름은 약해질 수 있다.
  - 이 사이클에서 push와 deploy는 하지 않았다.
- Verification:
  - Security/Review Agent가 raw `paymentKey` 화면 표시, sessionStorage 저장, URL query 잔류를 blocker로 확인했다.
  - UX/UI Agent가 원문 값을 숨긴 상태에서도 사용자가 이해할 수 있는 결과 화면 문구를 제안했다.
  - QA Agent 제안에 따라 `paymentKey`가 서버 승인에는 쓰이지만 화면/저장소에는 원문으로 남지 않는 테스트를 추가했다.
  - `npm test` passed: 24 tests.
- Next:
  - 사용자가 배포 묶음에 포함하면 payment-result success/fail callback 화면에서 인증값이 직접 보이지 않는지 확인한다.

### AG-0020 - 정원/잔여석 P0 롤아웃 명세

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 총괄 디렉터 + DB/Backend Agent + 보안 Agent + UX/UI Agent + QA Agent + 작업 정리 Agent
- Purpose: 정원보다 많은 신청/결제가 들어오는 사고를 막기 위한 큰 P0 작업을 안전한 구현 순서로 쪼갠다.
- Subagents:
  - DB/Backend Planning Agent: Russell
  - Security/Review Agent: Kepler
  - UX/UI Planning Agent: Leibniz
  - QA Agent: Ptolemy
- Changed files:
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - 실제 기능 코드, Supabase 원격 DB, Edge Function 배포, push는 하지 않았다.
  - TODO.md에 `Add capacity, remaining spots, and automatic sold-out controls`를 P0 열린 항목으로 추가했다.
  - 현재 `status_label`은 사람이 적는 문구라 신청/결제 가능 여부의 기준으로 쓰면 안 된다.
  - DB migration을 먼저 적용한 뒤에야 `confirm-toss-payment`와 `create-public-submission`이 새 컬럼/상태를 읽어야 한다.
  - `pending` Toss 주문에는 만료 시간이 필요하고, 만료된 pending 주문의 늦은 결제 성공은 과판매를 만들지 않게 막아야 한다.
  - 가장 빠른 기능 롤백은 새 컬럼을 drop하는 것이 아니라 `meetups.capacity = null`로 전체를 무제한 상태처럼 운영하는 방식이다.
- Verification:
  - DB/Backend Agent가 migration 객체, RPC 변경, Edge Function 배포 순서, rollback caution을 제안했다.
  - Security/Review Agent가 pending expiry와 late Toss success를 blocker로 확인했다.
  - UX/UI Agent가 public/admin 좌석 표시와 한국어 카피를 제안했다.
  - QA Agent가 static test 후보와 실제 Supabase 검증 체크리스트를 정리했다.
  - `npm test`는 이 사이클 전에 24개 통과 상태였고, 이번 변경은 문서/현황판 갱신만 포함한다.
- Next:
  - 사용자가 승인하면 다음 구현 사이클은 DB migration 초안부터 시작한다.
  - 원격 적용 전에는 SQL/RPC smoke test 시나리오를 먼저 준비한다.

### AG-0021 - 정원/잔여석 DB 계약 1단계

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + 보안 Agent + QA Agent + 작업 정리 Agent
- Purpose: 정원보다 많은 신청/결제가 들어오는 사고를 막기 위한 DB 기반을 로컬에 먼저 만든다.
- Subagents:
  - Security/Review Agent: Beauvoir
  - UX/UI Planning Agent: Boole
- Changed files:
  - `supabase/migrations/20260607000000_capacity_remaining_spots.sql`
  - `tests/paymentSecurity.test.js`
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - `meetups.capacity`는 정원이고, `NULL`이면 무제한으로 봅니다.
  - `meetups.registration_status`에는 사람이 직접 닫는 `open`/`closed`만 저장합니다. `sold_out`은 실제 주문 수로 계산합니다.
  - `orders.expires_at`은 Toss 결제창을 열고 이탈한 pending 주문이 자리를 계속 붙잡지 않게 하기 위한 만료 시각입니다.
  - 좌석 점유는 `paid`, `demo_paid`, 만료되지 않은 `pending` 주문만 계산합니다.
  - 이번 migration은 아직 기존 public 신청/주문 RPC에 연결하지 않았습니다. 다음 단계에서 `create-public-submission`과 `confirm-toss-payment`를 같이 다뤄야 합니다.
  - 원격 Supabase migration 적용, Edge Function deploy, GitHub Pages deploy, push는 하지 않았습니다.
- Verification:
  - Security/Review Agent가 `status_label`을 상태 기준으로 쓰지 말 것, expired pending과 late Toss success를 조심할 것, anon direct insert lock을 되열지 말 것을 확인했습니다.
  - UX/UI Agent는 live region 작업이 더 작지만, 사용자가 보류했던 항목이므로 이번 사이클에서는 P0 DB 계약을 우선하는 판단을 보조했습니다.
  - `tests/paymentSecurity.test.js`에 migration 계약 테스트를 추가했습니다.
  - `npm test` passed: 25 tests.
- Next:
  - 다음 구현 조각은 `create-public-submission`의 sold-out/closed 409 매핑과 `confirm-toss-payment`의 expired pending 사전 차단입니다.
  - 원격 적용 전에는 DB migration 적용 후 Edge Function deploy 순서를 다시 확인해야 합니다.

### AG-0022 - 정원/마감 public RPC와 Edge guard 연결

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + 보안 Agent + QA Agent + 작업 정리 Agent
- Purpose: 정원이 찼거나 신청이 닫힌 모임에 공개 신청/주문이 들어오지 않도록 서버 쪽 차단선을 연결한다.
- Subagents:
  - Security/Review Agent: Noether
  - QA Agent: Archimedes
- Changed files:
  - `supabase/migrations/20260607010000_capacity_rpc_guards.sql`
  - `supabase/functions/create-public-submission/index.ts`
  - `supabase/functions/confirm-toss-payment/index.ts`
  - `supabase-client.js`
  - `tests/paymentSecurity.test.js`
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - `create_public_application`과 `create_public_order`가 insert 전에 `assert_meetup_can_register`를 호출하게 했습니다.
  - 새 Toss pending 주문에는 30분 만료 시각을 저장합니다.
  - 오래된 pending 주문은 정원 확인 전에 `expire_stale_pending_orders(100)`으로 정리합니다.
  - `create-public-submission`은 정원 마감/신청 종료를 409와 안정적인 code로 반환합니다.
  - `confirm-toss-payment`는 만료된 pending 주문이면 Toss 승인 API를 호출하기 전에 failed로 정리하고 `ORDER_EXPIRED` 409를 반환합니다.
  - SQL `confirm_toss_payment_order`도 row lock 아래에서 만료 pending을 paid로 바꾸지 못하게 막습니다.
  - 원격 Supabase migration 적용, Edge Function deploy, GitHub Pages deploy, push는 하지 않았습니다.
- Verification:
  - Security/Review Agent가 public RPC 미연결, pending expires_at 누락, late Toss success, 409 매핑 누락을 P0 위험으로 확인했습니다.
  - QA Agent가 순서 기반 소스 계약 테스트를 제안했고, 해당 기준을 반영했습니다.
  - `npm test` passed: 26 tests.
- Next:
  - 다음 구현 조각은 공개/관리자 화면에서 `capacity`, `remaining_spots`, `effective_registration_status`를 보여주고 신청/결제 진입을 비활성화하는 UI 작업입니다.
  - 실제 배포 전에는 Supabase migration 2개를 먼저 적용하고 SQL/RPC smoke test를 실행해야 합니다.

### AG-0023 - 정원/잔여석 SQL/RPC smoke-test 준비

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: QA Agent + 보안 Agent + 작업 정리 Agent
- Purpose: 정원/잔여석 backend guard를 실제 Supabase에 적용하기 전에 DB/RPC가 맞게 동작하는지 확인할 수 있게 한다.
- Subagents:
  - Security/Review Agent: Plato
  - QA Agent: Hilbert
- Changed files:
  - `supabase/capacity-smoke-test.sql`
  - `supabase/README.md`
  - `tests/paymentSecurity.test.js`
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - smoke-test SQL은 `BEGIN`/`ROLLBACK`으로 감싸 성공 시 테스트 row가 남지 않게 했습니다.
  - cleanup은 wildcard `LIKE`가 아니라 exact smoke id 목록으로 제한했습니다.
  - 무제한 정원, 정원 1명 sold-out, sold-out 신청 차단, 신청 종료 차단, Toss pending `expires_at`, 정상 pending confirm, expired pending `ORDER_EXPIRED`, stale pending failed 처리를 확인합니다.
  - README에는 선행 migration과 `capacity` migration 적용 순서를 명시했습니다.
  - 원격 Supabase migration 적용, Edge Function deploy, GitHub Pages deploy, push는 하지 않았습니다.
- Verification:
  - Security/Review Agent가 Edge Function 선배포 위험과 wildcard cleanup 위험을 확인했고 수정했습니다.
  - QA Agent가 prerequisite 문서 위치, 전역 stale pending 의존성, sold-out application, 정상 Toss pending confirm 누락을 확인했고 반영했습니다.
  - `npm test` passed: 27 tests.
- Next:
  - 사용자가 원격 적용을 선택하면 migration 2개 적용 후 `supabase/capacity-smoke-test.sql`을 SQL Editor에서 실행합니다.
  - UI 개발은 public/admin이 읽을 구조화된 잔여석 read contract를 먼저 정한 뒤 시작하는 편이 안전합니다.

### AG-0024 - public/admin 정원 상태 read contract

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + 보안 Agent + QA Agent + 작업 정리 Agent
- Purpose: 공개 페이지와 관리자 페이지가 같은 기준으로 정원/잔여석/마감 상태를 읽게 한다.
- Subagents:
  - Security/Review Agent: Sartre
- Changed files:
  - `supabase/migrations/20260607020000_capacity_read_contract.sql`
  - `supabase/capacity-smoke-test.sql`
  - `supabase/README.md`
  - `tests/paymentSecurity.test.js`
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - public RPC는 published meetup의 `meetup_id`, `capacity`, `remaining_spots`, `effective_registration_status`, `can_register`만 반환합니다.
  - public에는 live 주문 수나 종료 사유를 직접 노출하지 않습니다.
  - admin RPC는 `is_admin()`을 통과한 사용자에게만 paid/pending/active order count, remaining spots, 수동 종료 상태와 사유를 반환합니다.
  - `anon` direct `meetups` select는 공개 콘텐츠 컬럼만 허용하도록 좁혔습니다.
  - 원격 Supabase migration 적용, Edge Function deploy, GitHub Pages deploy, push는 하지 않았습니다.
- Verification:
  - Security/Review Agent가 public 주문 수 노출과 direct meetup select 권한을 위험으로 확인했고 수정했습니다.
  - `tests/paymentSecurity.test.js`에 public/admin read contract 노출 범위와 grant 범위 테스트를 추가했습니다.
  - `supabase/capacity-smoke-test.sql`이 public availability RPC 결과를 확인하게 했습니다.
  - `npm test` passed: 28 tests.
- Next:
  - 다음 구현 조각은 public/admin UI가 availability RPC를 별도로 읽고 `meetup_id`로 merge하는 작업입니다.
  - UI 작업 전에 원격 적용 순서와 smoke-test 실행 여부를 사용자가 선택할 수 있게 정리해야 합니다.

### AG-0025 - 공개 페이지 정원/잔여석 UI 1차 연결

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + UX/UI Agent + 보안 Agent + QA Agent + 작업 정리 Agent
- Purpose: 공개 페이지의 신청/결제 가능 여부를 사람이 적은 문구가 아니라 Supabase가 계산한 정원 상태로 판단하게 한다.
- Subagents:
  - UX/UI Agent: Dewey
  - Security/Review Agent: Nash
- Changed files:
  - `supabase-client.js`
  - `main.js`
  - `styles.css`
  - `tests/paymentSecurity.test.js`
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - `supabase-client.js`에 `list_public_meetup_availability()`를 호출하는 helper를 추가했습니다.
  - 공개 페이지는 모임 목록과 availability RPC 결과를 `meetup_id`로 합칩니다.
  - 카드 배지는 `잔여 N석`, `마감`, `신청 종료`, `접수중`, `접수 확인중`처럼 DB 계산 상태에서 나온 짧은 문구를 보여줍니다.
  - 상세 화면은 `can_register`가 `true`일 때만 결제 버튼과 신청 폼을 보여줍니다.
  - Supabase가 설정된 운영 모드에서 DB 목록이나 availability를 확인하지 못하면 fallback 모임도 신청/결제가 닫힌 상태로 보입니다.
  - 원격 Supabase migration 적용, Edge Function deploy, GitHub Pages deploy, push는 하지 않았습니다.
- Verification:
  - UX/UI Agent가 카드/상세/모바일 문구 기준을 제안했습니다.
  - Security/Review Agent가 운영 모드 fail-open fallback과 `status_label` 기준 판단을 위험으로 확인했고, fail-closed 기준으로 반영했습니다.
  - `tests/paymentSecurity.test.js`에 public UI availability RPC merge와 fail-closed guard 테스트를 추가했습니다.
  - `node --check main.js` passed.
  - `node --check supabase-client.js` passed.
  - `npm test` passed: 29 tests.
- Next:
  - 다음 구현 조각은 관리자 화면에서 정원 입력, 잔여석/마감 상태 확인, 수동 신청 종료/재개를 관리하는 UI입니다.
  - 실제 배포 전에는 capacity migration 3개와 smoke-test 적용 순서를 다시 확인해야 합니다.

### AG-0026 - 관리자 정원/잔여석 운영 UI

- Status: `done_local`
- Branch: `codex/overnight-task-discovery`
- Director Agent: main Codex thread
- Owner Agent: 개발 Agent + UX/UI Agent + 보안 Agent + QA Agent + 작업 정리 Agent
- Purpose: 운영자가 관리자 화면에서 정원을 입력하고, 접수를 닫거나 열고, 실제 잔여석 상태를 확인할 수 있게 한다.
- Subagents:
  - UX/UI Agent: Ohm
  - Security/Review Agent: Lovelace
- Changed files:
  - `admin.html`
  - `admin.js`
  - `admin.css`
  - `supabase-client.js`
  - `tests/paymentSecurity.test.js`
  - `TODO.md`
  - `AGENTIC_TASK_DISCOVERY.md`
  - `AGENTIC_STATUS.json`
  - `AGENTIC_LIVE_STATUS.json`
  - `AGENTIC_WORK_LOG.md`
- Notes:
  - 관리자 모임 폼에 정원, 접수 상태, 종료 사유 입력을 추가했습니다.
  - 정원을 비우면 무제한으로 저장합니다.
  - 접수 상태는 `open`/`closed`만 저장하고, `sold_out`은 주문 수로 계산해서 표시합니다.
  - 관리자 모임 목록에는 `좌석` 열을 추가해 접수 가능/마감/신청 종료/확인 지연, 잔여석, 확정/결제중 숫자를 보여줍니다.
  - `list_admin_meetup_availability()`는 관리자 access token으로만 호출합니다.
  - `supabase-client.js`에서 모임 저장 payload를 allow-list로 걸러 `remaining_spots`, 주문 수, `can_register`, `closed_at` 같은 파생/내부 필드는 저장하지 않게 했습니다.
  - 원격 Supabase migration 적용, Edge Function deploy, GitHub Pages deploy, push는 하지 않았습니다.
- Verification:
  - UX/UI Agent가 관리자 폼/목록/모바일 카드 기준을 제안했습니다.
  - Security/Review Agent가 admin RPC token 사용, payload allow-list, availability 실패 시 `확인 지연` 표시를 요구했고 반영했습니다.
  - `node --check admin.js` passed.
  - `node --check supabase-client.js` passed.
  - `git diff --check` passed.
  - `npm test` passed: 30 tests.
- Next:
  - 다음 구현 조각은 live Supabase migration 적용, SQL/RPC smoke-test, Edge Function deploy, GitHub Pages deploy 순서를 사용자가 검토하기 쉽게 체크리스트로 정리하는 작업입니다.
  - 실제 배포 전에는 capacity migration 3개가 원격에 먼저 적용되어야 합니다.
