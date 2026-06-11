# PWA 적용 설계 (2026-06-12)

## 목표

moin 정적 웹앱을 iPhone Safari에서 "홈 화면에 추가"하면 주소창 없는 전체화면 앱처럼
동작하게 만든다. 앱스토어 출시 전 단계에서 앱 수요를 검증하는 가장 싼 경로다.

## 확정된 제품 결정

1. **manifest-only**: 서비스 워커를 넣지 않는다. 결제/신청 기능이 활발히 배포 중이라
   잘못된 캐싱으로 사용자가 옛 버전 JS를 보는 위험을 0으로 유지한다. 푸시 알림이
   필요해지는 시점에 서비스 워커를 별도 작업으로 추가한다.
2. **아이콘은 brand-mark 재현**: 새 로고를 만들지 않고 사이트 헤더의 brand-mark
   (`styles.css`의 코럴/녹색/노랑 대각 분할 둥근 사각형)를 그대로 앱 아이콘으로 쓴다.
3. **설치 대상은 `index.html`만**: `payment-result.html`은 결제 콜백 페이지,
   `admin.html`은 운영자 도구라 설치 진입점이 아니다.

## 핵심 제약 (탐색에서 발견)

- 사이트가 `https://subong-noah-kim.github.io/moin/` **서브패스**에 배포된다.
  manifest의 `start_url`/`scope`는 절대경로(`/`)가 아니라 상대경로(`./`)여야 한다.
- `deploy-pages.yml`이 배포 파일을 **하나씩 명시적으로 `dist/`에 복사**한다.
  manifest와 아이콘을 복사 목록에 추가하지 않으면 로컬에서는 동작하고 운영에서만
  404가 난다. 소스 계약 테스트로 잠근다.
- iOS는 manifest의 `icons`를 무시하고 `apple-touch-icon` 링크만 쓴다. 둘 다 필요하다.

## 산출물

### `manifest.webmanifest` (신규)

- `name`/`short_name`: `moin`
- `description`: 취향 기반 모임 플랫폼
- `lang`: `ko`
- `start_url`: `./`, `scope`: `./`
- `display`: `standalone`
- `background_color`: `#fbf7ef` (사이트 종이색 — 실행 스플래시 배경)
- `theme_color`: `#1f6a53` (브랜드 녹색)
- `icons`: 192px, 512px, maskable 512px (`icons/` 경로)

### `icons/` (신규)

brand-mark SVG 원본 1개 + Playwright(기존 devDependency)로 렌더링한 PNG:

- `icons/app-icon.svg` — 원본 (코럴 135deg 0–46% / 녹색·노랑 315deg 50% 분할,
  둥근 사각형)
- `icons/apple-touch-icon-180.png` — iOS 홈 화면용
- `icons/icon-192.png`, `icons/icon-512.png` — manifest용
- `icons/icon-maskable-512.png` — 안전 영역(중앙 80%)에 마크를 배치한 maskable

렌더링은 일회성 스크립트(`scripts/render-app-icons.mjs`)로 수행하고 PNG를 커밋한다.
스크립트도 커밋해 아이콘 변경 시 재생성 가능하게 한다.

### `index.html` 변경 (head)

```html
<link rel="manifest" href="./manifest.webmanifest" />
<link rel="apple-touch-icon" href="./icons/apple-touch-icon-180.png" />
<meta name="theme-color" content="#1f6a53" />
```

manifest는 자산 버저닝(`?v=__ASSET_VERSION__`) 대상에서 제외한다. manifest 갱신
빈도가 낮고, iOS 설치 시점에만 읽혀 stale 위험이 실질적으로 없다.

### `deploy-pages.yml` 변경

`dist/` 복사 목록에 추가:

- `cp manifest.webmanifest dist/`
- `cp -R icons dist/`

### 테스트 (기존 소스 계약 테스트 패턴, `tests/`)

1. `index.html`에 manifest 링크, apple-touch-icon 링크, theme-color 메타가 존재한다.
2. `manifest.webmanifest`가 JSON으로 파싱되고 필수 필드(`name`, `start_url`,
   `display`, `icons`)를 가지며 `start_url`/`scope`가 상대경로다.
3. manifest와 `index.html`이 참조하는 아이콘 파일이 실제로 존재한다.
4. `deploy-pages.yml`이 `manifest.webmanifest`와 `icons`를 복사한다.

## 작업 격리와 합류

- `worktree-pwa-support` 브랜치, 별도 worktree에서 작업한다. main 체크아웃은 다른
  세션(신청-결제 연결)이 사용 중이다.
- 합류 시 충돌 가능 지점은 `index.html` head 몇 줄과 `deploy-pages.yml` 복사 목록뿐.
- 다른 세션의 미푸시 커밋과 독립적이므로 합류 순서는 자유다.

## 검증

- 로컬 `npm run dev`: manifest와 아이콘이 200으로 응답하고 파싱 오류가 없는지 확인.
- 최종 검증은 main 합류·GitHub Pages 배포 후 실제 iPhone Safari에서
  "홈 화면에 추가" → 전체화면 실행, 아이콘/스플래시 색 확인.

## 범위 밖 (나중에)

- 서비스 워커, 오프라인 캐싱, 웹 푸시 알림 (iOS 16.4+ 홈 화면 PWA에서 가능)
- Capacitor 패키징 및 앱스토어 출시 — 이 작업의 manifest/아이콘을 그대로 재사용한다.
