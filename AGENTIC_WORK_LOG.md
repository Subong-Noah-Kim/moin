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
