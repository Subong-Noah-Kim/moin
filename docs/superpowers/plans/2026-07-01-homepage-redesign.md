# 홈페이지 & 사용자 동선 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** moin 공개 사용자 동선을 미니멀/화이트 · 잉크·무채색 · 구조 B로 리디자인하고 데모 흔적을 정리한다.

**Architecture:** `redesign/minimal-ink` 브랜치에서 컴포넌트 단위로 작업(main=라이브 보존). 시각 기준은 `mockups/ia-sections.html`·`mockups/minimal-colors.html`(승인된 시안). 변경되는 마크업/문구의 소스 계약 테스트는 TDD로 갱신, 보안·결제·푸터 불변식 테스트는 계속 통과. 컴포넌트마다 Chrome 헤드리스 스크린샷으로 QA.

**Tech Stack:** 바닐라 JS ESM + 정적 HTML/CSS, GitHub Pages, `node --test`(tests/paymentSecurity.test.js), `npm run smoke:browser`.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-01-homepage-redesign-design.md`
- 시각 기준(=CSS 원본): `mockups/ia-sections.html`, `mockups/minimal-colors.html` — 클래스명만 실제 마크업에 맞춰 이식.
- 토큰: `--bg #fff` / `--bg-2 #f6f7f9` / `--ink #111` / 헤드라인 `#0e1116` / `--muted #6b7280` / `--line #ececf0` / `--accent #111`. 카드 radius 18px, 버튼 999px, 입력 12px, hover shadow `0 18px 40px rgba(15,17,22,.08)`. 헤드라인 `word-break: keep-all`.
- 보존 불변식: ① escape/URL 검증(`escapeHtml` 단일 모듈, `escapeAttribute`, `escapeImageUrl`) ② 결제 test/live/demo 분기 카피·`isTossConfigured`/`isTossLiveMode` 로직 ③ 푸터 사업자정보·정책 링크·서비스 제공기간 안내·"데모" 문구 부재 ④ 모듈 import `?v=__ASSET_VERSION__`, 신규 파일은 cp 목록+`cacheBustedSourceFiles`에 추가.
- 작업은 `redesign/minimal-ink` 브랜치에서만. main 미병합 시 라이브 영향 0. 각 태스크 끝에 브랜치 커밋.
- 검증: 태스크마다 `npm test` 그린 유지 + 스크린샷 QA. 병합 직전 `npm run smoke:browser`.
- 롤백: `pre-redesign-2026-07-01` 태그가 현재 라이브 디자인. 병합 후 문제 시 `git revert -m 1 <merge>` 또는 `git reset --hard pre-redesign-2026-07-01` 후 재배포.

---

### Task 0: 안전장치 (완료)

- [x] 복구 태그 `pre-redesign-2026-07-01`(origin/main) 생성·push
- [x] 작업 브랜치 `redesign/minimal-ink` 생성

---

### Task 1: 디자인 토큰 & 베이스

**Files:** Modify: `styles.css`(`:root` + `body`/버튼/입력 베이스), `index.html`(`<meta name="theme-color">`)

**Interfaces:** Produces: 새 CSS 변수(`--bg/--bg-2/--ink/--muted/--line/--accent` + radius/shadow) — 이후 모든 태스크가 사용.

- [ ] **Step 1:** `styles.css`의 `:root` 웜 토큰(--paper/--green/--coral/--yellow/--soft 등)과 body 그리드 텍스처 배경을 제거하고, Global Constraints의 잉크 토큰으로 교체. `mockups/minimal-colors.html`의 `:root`·`body`·`.btn`·입력 스타일을 이식.
- [ ] **Step 2:** `index.html`의 `theme-color`를 `#ffffff`로 변경.
- [ ] **Step 3:** `npm test` 실행 → 그린 확인(토큰 변경은 핀에 영향 없음).
- [ ] **Step 4:** 홈 스크린샷 QA(과도기 모습 OK): `"$CHROME" --headless --window-size=1280,2000 --virtual-time-budget=7000 --screenshot=... file://.../index.html` (로컬 `npm run dev` 서버 또는 file://).
- [ ] **Step 5:** 커밋 `style: ink/minimal design tokens`.

### Task 2: 헤더 + 모바일 내비

**Files:** Modify: `index.html`(`header.site-header`, `nav.top-nav`, `.mobile-tabs`), `styles.css`(헤더/모바일탭 규칙)

- [ ] **Step 1:** 헤더 마크업을 시안 기준으로 정리 — 워드마크 + 슬림 내비(모임/오픈예정/여는이/후기) + `내 신청`(ghost) + 주 CTA. 내비 링크의 앵커(`#meetups` 등)를 새 섹션 ID와 일치시킴.
- [ ] **Step 2:** `.mobile-tabs` 항목을 새 IA에 맞게(모임/오픈예정/내 신청 등) 갱신.
- [ ] **Step 3:** `styles.css` 헤더/모바일탭을 잉크 톤으로(스티키 + blur, `mockups/ia-sections.html` 헤더 이식).
- [ ] **Step 4:** `npm test` → `main.js delegates modal focus management ...` 등 영향 핀 확인. 내비 변경이 핀을 깨면 새 마크업 기준으로 핀 갱신(RED→수정→GREEN). 깨지지 않으면 그대로.
- [ ] **Step 5:** 데스크톱+모바일(390px) 스크린샷 QA.
- [ ] **Step 6:** 커밋 `style: header + mobile nav`.

### Task 3: 히어로 (하드코딩 카드 제거 + 데모 문구)

**Files:** Modify: `index.html`(`section.hero-shell` → 텍스트 히어로), `styles.css`(`.hero*`), 데모 문구

- [ ] **Step 1(RED):** `tests/paymentSecurity.test.js`에 핀 추가 — `index.html`에 과거 하드코딩 카드 텍스트(`토요일 밤의 취향 살롱`, `6월 13일`) 및 meta의 `데모`가 없어야 함: `assert.doesNotMatch(indexHtml, /6월 13일/)`, `assert.doesNotMatch(indexHtml, /플랫폼 데모/)`. 실행해 실패 확인.
- [ ] **Step 2:** 히어로를 텍스트형으로 교체(eyebrow + 헤드라인 + 한 줄 + 검색). `hero-feature` 하드코딩 카드 삭제. meta description의 "데모" 제거.
- [ ] **Step 3:** `styles.css` `.hero*`를 시안 이식(`word-break: keep-all`).
- [ ] **Step 4:** `npm test` → 추가 핀 GREEN + 기존 그린.
- [ ] **Step 5:** 스크린샷 QA.
- [ ] **Step 6:** 커밋 `feat: text hero, drop hardcoded card + demo wording`.

### Task 4: 모임 카드 컴포넌트

**Files:** Modify: `public-meetup.js`(`createTagMarkup` 등 카드 헬퍼), `main.js`(카드 빌더), `styles.css`(`.card*`), `tests/paymentSecurity.test.js`(카드 핀)

**Interfaces:** Consumes: Task1 토큰. Produces: 새 카드 마크업 구조(이미지 16:10 + 메타 + 제목 + 가격/잔여석) — Task5 그리드가 사용.

- [ ] **Step 1(RED):** 카드 마크업 변경에 맞춰 영향 핀 갱신 — `createTagMarkup(...)` 정확매칭 핀, 이미지/속성 escape 핀(`alt=${escapeAttribute(item.title)}`, `src=${escapeImageUrl(item.image)}`, `data-detail=${escapeAttribute(item.id)}`)을 새 마크업 기대값으로 수정. 실행해 실패 확인.
- [ ] **Step 2:** `public-meetup.js`/`main.js` 카드 마크업을 시안 카드 구조로 교체. **escape/URL 검증 호출은 그대로 유지**(불변식). 가격/잔여석 표기 유지.
- [ ] **Step 3:** `styles.css` `.card*`를 시안 이식(18px radius, hover 떠오름).
- [ ] **Step 4:** `npm test` → 갱신 핀 GREEN, escape 불변식 핀 GREEN.
- [ ] **Step 5:** 스크린샷 QA(카드 그리드).
- [ ] **Step 6:** 커밋 `style: meetup card (ink minimal)`.

### Task 5: 모임 그리드 + 칩 필터 (이벤트/소모임 통합)

**Files:** Modify: `index.html`(섹션 재구성 — `#events`/`#small-groups` 별도 섹션 제거, `quick-nav` 칩 유지), `main.js`(`data-event-list`/`data-small-group-list` 렌더 제거, 단일 필터 그리드로 통합), `styles.css`

- [ ] **Step 1:** 현재 `main.js`의 카테고리 필터 로직(quick-chips `data-filter`)이 정기/원데이/소모임을 단일 그리드에서 거를 수 있는지 확인. 없으면 필터 함수 보강(기존 `matchesSearch`/카테고리 헬퍼 재사용).
- [ ] **Step 2(RED):** 별도 섹션 제거에 따른 핀 확인 — 만약 테스트가 `data-event-list`/`data-small-group-list` 존재를 단언하면 제거 기준으로 수정. 실패 확인.
- [ ] **Step 3:** `index.html`에서 `#events`·`#small-groups` 섹션 삭제, 모임 그리드 + 상단 칩(전체/정기/원데이/소모임/오픈예정) 구조로. `main.js`에서 해당 리스트 렌더 코드 제거하고 그리드 단일화.
- [ ] **Step 4:** `npm test` → 그린. 필터 동작은 스크린샷/수동 확인(칩 클릭 시 그리드 필터).
- [ ] **Step 5:** 스크린샷 QA.
- [ ] **Step 6:** 커밋 `refactor: unify meetup grid with chip filter; drop event/group sections`.

### Task 6: 오픈예정 레일

**Files:** Modify: `index.html`(`#waitlist`/`.rail`), `main.js`(`data-waitlist-rail` 렌더), `styles.css`

- [ ] **Step 1:** 레일 마크업/렌더를 시안(`ia-sections.html`의 `.rail .mini` + 신청률 바)으로. 신청률 = `active_order_count`/`capacity` 기반(가용 데이터 사용; 없으면 표시 생략).
- [ ] **Step 2:** `styles.css` `.rail` 이식(가로 스크롤).
- [ ] **Step 3:** `npm test` → 그린.
- [ ] **Step 4:** 스크린샷 QA.
- [ ] **Step 5:** 커밋 `style: opening-soon rail`.

### Task 7: 여는이 CTA 밴드

**Files:** Modify: `index.html`(`#hosts`/`.host-panel`), `styles.css`

- [ ] **Step 1:** 시안의 블랙 CTA 밴드(`.host`)로 마크업/스타일 교체. 기존 host 카피 유지, `data-open-apply` 동작 유지.
- [ ] **Step 2:** `npm test` → 그린.
- [ ] **Step 3:** 스크린샷 QA.
- [ ] **Step 4:** 커밋 `style: host CTA band`.

### Task 8: 후기 섹션 (더미 정리)

**Files:** Modify: `index.html`(`#reviews`), `styles.css`, `tests/paymentSecurity.test.js`

- [ ] **Step 1(RED):** 핀 추가/수정 — `assert.doesNotMatch(indexHtml, /데모 후기/)`. 큐레이션 후기 기능 연동 가능하면 동적 렌더, 아니면 정적 더미 텍스트 제거하고 실제 후기 입력 전까지 섹션 숨김 또는 일반 카피. 실패 확인.
- [ ] **Step 2:** "데모 후기 3개" 카운트 제거. 더미 익명 후기를 큐레이션 후기 연동(가능 시) 또는 정리.
- [ ] **Step 3:** `styles.css` 후기 카드 잉크 톤.
- [ ] **Step 4:** `npm test` → GREEN.
- [ ] **Step 5:** 스크린샷 QA.
- [ ] **Step 6:** 커밋 `feat: real/clean reviews, drop demo label`.

### Task 9: 푸터 (사업자정보·정책 보존)

**Files:** Modify: `styles.css`(`.site-footer*`/`.business-info`/`.footer-policy`/`.service-period-note`)

- [ ] **Step 1:** 푸터를 잉크 톤으로 재배치하되 **마크업의 사업자정보 `<dl>`·정책 링크·서비스 제공기간 안내·"데모" 부재를 유지**(직전 작업 + `site footer carries business registration info ...` 핀).
- [ ] **Step 2:** `npm test` → 푸터 계약 핀 GREEN.
- [ ] **Step 3:** 스크린샷 QA.
- [ ] **Step 4:** 커밋 `style: footer (ink minimal), keep business info`.

### Task 10: 상세 드로어

**Files:** Modify: `styles.css`(`.detail-drawer`/`.drawer-panel` + 드로어 내부 컴포넌트), 필요 시 `main.js` 드로어 마크업 클래스

- [ ] **Step 1:** 드로어 패널/내부(모임 상세, 신청·결제 진입)를 잉크 톤으로. 포커스 트랩/inert/aria 동작 유지(불변식: modal focus management 핀).
- [ ] **Step 2:** `npm test` → 그린.
- [ ] **Step 3:** 드로어 열린 상태 스크린샷 QA(로컬 서버에서 카드 클릭 후 캡처 또는 수동).
- [ ] **Step 4:** 커밋 `style: detail drawer`.

### Task 11: 결제 모달 (로직·카피 보존)

**Files:** Modify: `styles.css`(`.checkout-modal`/`.checkout-*`)

- [ ] **Step 1:** 결제 모달 시각만 잉크 톤으로. **`main.js`의 test/live/demo 분기 카피·`isTossLiveMode` 로직·escape는 변경 금지.**
- [ ] **Step 2:** `npm test` → 결제 카피 핀(`public payment copy ...`, `checkout copy switches to a real-charge ...`) GREEN 유지.
- [ ] **Step 3:** 결제창 스크린샷 QA(데모 모드).
- [ ] **Step 4:** 커밋 `style: checkout modal`.

### Task 12: my-history / payment-result 톤 정렬

**Files:** Modify: `my-history.html`/`my-history.js`(마크업/클래스 한도 내), `payment-result.html`, `styles.css` 또는 페이지 인라인

- [ ] **Step 1:** 두 페이지를 잉크 토큰에 맞춰 정렬(공용 styles.css 사용분 + 페이지 고유 스타일).
- [ ] **Step 2:** `npm test` → 그린(결제결과 카피 핀 유지).
- [ ] **Step 3:** 각 페이지 스크린샷 QA.
- [ ] **Step 4:** 커밋 `style: my-history + payment-result tone`.

### Task 13: 정책 페이지 톤 미세 정렬 (선택)

**Files:** Modify: `terms.html`/`refund.html`/`privacy.html`(인라인 스타일)

- [ ] **Step 1:** 정책 페이지 인라인 스타일을 홈과 통일감 있게 미세 조정(이미 미니멀이라 소폭).
- [ ] **Step 2:** `npm test` → 그린(refund 무형재화/서비스제공기간 핀 유지).
- [ ] **Step 3:** 커밋 `style: policy pages tone`.

### Task 14: 통합 검증 & 병합/배포

**Files:** 없음(검증·병합)

- [ ] **Step 1:** `npm test` 전체 그린.
- [ ] **Step 2:** `npm run smoke:browser` 그린.
- [ ] **Step 3:** 데스크톱+모바일 전체 페이지 스크린샷 QA → 사용자 승인.
- [ ] **Step 4:** 승인 시 `git checkout main && git merge redesign/minimal-ink` 후 `git push origin main`(=배포 1회).
- [ ] **Step 5:** 배포 워크플로우 통과 확인 + 라이브 스크린샷 검증.
- [ ] **Step 6:** 문제 시 롤백: `git revert -m 1 <merge>` 또는 `git reset --hard pre-redesign-2026-07-01` 후 push.

---

## Self-Review

- **Spec coverage:** 토큰(T1)·헤더/모바일(T2)·히어로+데모문구(T3)·카드(T4)·그리드통합(T5)·레일(T6)·여는이(T7)·후기더미(T8)·푸터보존(T9)·드로어(T10)·결제(T11)·my-history/결제결과(T12)·정책(T13)·검증/배포+롤백(T14) — 스펙 5/6/7/8/12 항목 모두 매핑됨.
- **Placeholder scan:** 시각 CSS는 승인 시안(`mockups/`)을 원본으로 이식하도록 명시 — 추상 지시 아님. 계약 영향 부분은 구체 핀/escape 호출 명시.
- **불변식:** escape(T4/T10), 결제 카피·로직(T11), 푸터 계약(T9), 캐시버스트/cp(신규 파일 없음) — 각 태스크에 GREEN 유지 단계 포함.
- **롤백:** 태그 + 브랜치 전략으로 라이브 보존, T14에 복구 절차 명시.
