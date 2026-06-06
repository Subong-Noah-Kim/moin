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
