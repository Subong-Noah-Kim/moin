# PWA Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** moin 정적 웹앱을 iPhone "홈 화면에 추가"로 전체화면 앱처럼 설치 가능하게 만든다 (manifest-only PWA, 서비스 워커 없음).

**Architecture:** `manifest.webmanifest` + brand-mark 재현 아이콘(`icons/`) + `index.html` head 링크 3줄. 배포는 `deploy-pages.yml`의 명시적 복사 목록에 추가해야 하며, 소스 계약 테스트(`tests/pwa.test.js`)로 모든 연결 지점을 잠근다.

**Tech Stack:** 바닐라 정적 파일, node:test 소스 계약 테스트, 아이콘 렌더링은 시스템 헤드리스 Chrome (`scripts/browser-smoke.mjs`와 같은 탐색 패턴).

**Worktree:** `/Users/subong/Documents/moin/.claude/worktrees/pwa-support`, 브랜치 `worktree-pwa-support`. 설계 문서: `docs/plans/2026-06-12-pwa-design.md`.

---

### Task 1: manifest.webmanifest + 계약 테스트

**Files:**
- Create: `tests/pwa.test.js`
- Create: `manifest.webmanifest`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pwa.test.js` 생성 (기존 `tests/paymentSecurity.test.js`와 같은 node:test 스타일):

```js
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function readProjectFile(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('manifest declares an installable standalone app with relative scope', async () => {
  const manifest = JSON.parse(await readProjectFile('manifest.webmanifest'));
  assert.equal(manifest.name, 'moin');
  assert.equal(manifest.short_name, 'moin');
  assert.equal(manifest.lang, 'ko');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.background_color, '#fbf7ef');
  assert.equal(manifest.theme_color, '#1f6a53');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\.\/icons\//, 'icon src must be relative for subpath deploys');
  }
  const purposes = manifest.icons.map((icon) => icon.purpose || 'any');
  assert.ok(purposes.includes('maskable'));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test 2>&1 | grep -A2 "manifest declares"`
Expected: FAIL (`ENOENT ... manifest.webmanifest`)

- [ ] **Step 3: manifest 구현**

`manifest.webmanifest` 생성:

```json
{
  "name": "moin",
  "short_name": "moin",
  "description": "취향 기반 모임과 원데이 이벤트를 탐색하고 신청하는 커뮤니티 플랫폼",
  "lang": "ko",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#fbf7ef",
  "theme_color": "#1f6a53",
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "./icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 61 pass, 0 fail

- [ ] **Step 5: 커밋**

```bash
git add tests/pwa.test.js manifest.webmanifest
git commit -m "Add web app manifest with source contract test"
```

---

### Task 2: brand-mark 아이콘 (SVG + 렌더 스크립트 + PNG)

**Files:**
- Create: `icons/app-icon.svg`
- Create: `icons/app-icon-fullbleed.svg`
- Create: `scripts/render-app-icons.mjs`
- Create: `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `icons/apple-touch-icon-180.png` (스크립트 산출물)
- Modify: `tests/pwa.test.js` (테스트 추가)

**배경:** 헤더 brand-mark는 `styles.css:90`의 CSS 그라데이션이다 — 135deg 코럴(#c94b35) 0–46% 위에, 315deg 녹색(#1f6a53) 0–50% / 노랑(#e7b93f) 50–100%. 모서리 반경은 28px 중 7px = 25%. iOS 홈 화면과 maskable은 플랫폼이 모서리를 직접 깎으므로 fullbleed(투명 모서리 없음) 변형이 따로 필요하다.

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/pwa.test.js`에 추가:

```js
test('manifest and apple touch icons exist as PNG files', async () => {
  const manifest = JSON.parse(await readProjectFile('manifest.webmanifest'));
  const iconPaths = manifest.icons.map((icon) => icon.src.replace(/^\.\//, ''));
  iconPaths.push('icons/apple-touch-icon-180.png');
  for (const iconPath of iconPaths) {
    const file = await readFile(new URL(`../${iconPath}`, import.meta.url));
    assert.ok(file.length > 0, `${iconPath} should not be empty`);
    assert.equal(file.subarray(1, 4).toString(), 'PNG', `${iconPath} should be a PNG file`);
  }
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test 2>&1 | grep -B1 -A3 "exist as PNG"`
Expected: FAIL (`ENOENT ... icons/icon-192.png`)

- [ ] **Step 3: SVG 원본 2종 작성**

`icons/app-icon.svg` (둥근 사각형 — manifest 192/512용):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="base" x1="1" y1="1" x2="0" y2="0">
      <stop offset="0.5" stop-color="#1f6a53"/>
      <stop offset="0.5" stop-color="#e7b93f"/>
    </linearGradient>
    <linearGradient id="top" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.46" stop-color="#c94b35"/>
      <stop offset="0.46" stop-color="#c94b35" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="round"><rect width="512" height="512" rx="128"/></clipPath>
  </defs>
  <g clip-path="url(#round)">
    <rect width="512" height="512" fill="url(#base)"/>
    <rect width="512" height="512" fill="url(#top)"/>
  </g>
</svg>
```

`icons/app-icon-fullbleed.svg` (전체 채움 — apple-touch-icon/maskable용, clip 없음):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="base" x1="1" y1="1" x2="0" y2="0">
      <stop offset="0.5" stop-color="#1f6a53"/>
      <stop offset="0.5" stop-color="#e7b93f"/>
    </linearGradient>
    <linearGradient id="top" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.46" stop-color="#c94b35"/>
      <stop offset="0.46" stop-color="#c94b35" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#base)"/>
  <rect width="512" height="512" fill="url(#top)"/>
</svg>
```

- [ ] **Step 4: 렌더 스크립트 작성**

`scripts/render-app-icons.mjs` 생성 (Chrome 탐색은 `scripts/browser-smoke.mjs`와 동일 패턴):

```js
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chrome = chromeCandidates.find((candidate) => existsSync(candidate));
if (!chrome) {
  console.error('Chrome executable not found. Set CHROME_BIN to render app icons.');
  process.exit(1);
}

const renders = [
  { svg: 'icons/app-icon.svg', size: 192, out: 'icons/icon-192.png' },
  { svg: 'icons/app-icon.svg', size: 512, out: 'icons/icon-512.png' },
  { svg: 'icons/app-icon-fullbleed.svg', size: 512, out: 'icons/icon-maskable-512.png' },
  { svg: 'icons/app-icon-fullbleed.svg', size: 180, out: 'icons/apple-touch-icon-180.png' },
];

for (const { svg, size, out } of renders) {
  const result = spawnSync(chrome, [
    '--headless=new',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--screenshot=${path.join(root, out)}`,
    `--window-size=${size},${size}`,
    `file://${path.join(root, svg)}`,
  ], { stdio: 'pipe' });

  if (result.status !== 0) {
    console.error(`Failed to render ${out}`);
    console.error(String(result.stderr));
    process.exit(1);
  }
  console.log(`Rendered ${out}`);
}
```

(viewBox만 있는 SVG는 Chrome 뷰포트를 100% 채우므로 `--window-size`가 곧 출력 해상도다.)

- [ ] **Step 5: PNG 렌더링 실행**

Run: `node scripts/render-app-icons.mjs`
Expected: `Rendered icons/...` 4줄, `icons/`에 PNG 4개 생성

- [ ] **Step 6: PNG 눈으로 확인**

Read 도구로 `icons/icon-512.png`를 열어 brand-mark(좌상단 코럴, 우하단 녹색, 사이 노랑 띠, 둥근 모서리)가 맞는지, `icons/icon-maskable-512.png`가 모서리까지 채워졌는지 확인한다.

- [ ] **Step 7: 테스트 통과 확인**

Run: `npm test`
Expected: 62 pass, 0 fail

- [ ] **Step 8: 커밋**

```bash
git add icons scripts/render-app-icons.mjs tests/pwa.test.js
git commit -m "Add brand-mark app icons and Chrome render script"
```

---

### Task 3: index.html 링크 + server.js MIME

**Files:**
- Modify: `index.html` (head, `styles.css` link 다음)
- Modify: `server.js:10-15` (types 테이블)
- Modify: `tests/pwa.test.js` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/pwa.test.js`에 추가:

```js
test('index.html links the manifest, apple touch icon, and theme color', async () => {
  const html = await readProjectFile('index.html');
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest" \/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon-180\.png" \/>/);
  assert.match(html, /<meta name="theme-color" content="#1f6a53" \/>/);
});

test('local dev server declares manifest and icon content types', async () => {
  const server = await readProjectFile('server.js');
  assert.match(server, /'\.webmanifest': 'application\/manifest\+json; charset=utf-8'/);
  assert.match(server, /'\.svg': 'image\/svg\+xml'/);
  assert.match(server, /'\.png': 'image\/png'/);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test 2>&1 | grep -c "fail [0-9]"`
Expected: 새 테스트 2개 FAIL

- [ ] **Step 3: index.html head 수정**

`index.html`의 `<link rel="stylesheet" ...>` 줄 다음에 추가:

```html
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="apple-touch-icon" href="./icons/apple-touch-icon-180.png" />
    <meta name="theme-color" content="#1f6a53" />
```

(manifest는 설계대로 `?v=__ASSET_VERSION__` 버저닝 대상이 아니다.)

- [ ] **Step 4: server.js types 테이블 수정**

```js
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: 64 pass, 0 fail

- [ ] **Step 6: 커밋**

```bash
git add index.html server.js tests/pwa.test.js
git commit -m "Link manifest and icons from index.html and dev server"
```

---

### Task 4: 배포 워크플로 복사 목록

**Files:**
- Modify: `.github/workflows/deploy-pages.yml` (dist 복사 목록)
- Modify: `tests/pwa.test.js` (테스트 추가)

**배경:** 워크플로는 배포 파일을 하나씩 `dist/`로 복사한다. 여기 빠지면 로컬은 되고 운영만 404가 나므로 계약 테스트로 잠근다.

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/pwa.test.js`에 추가:

```js
test('pages deploy copies the manifest and icons', async () => {
  const workflow = await readProjectFile('.github/workflows/deploy-pages.yml');
  assert.match(workflow, /cp manifest\.webmanifest dist\//);
  assert.match(workflow, /cp -R icons dist\//);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test 2>&1 | grep -A3 "pages deploy copies"`
Expected: FAIL

- [ ] **Step 3: 워크플로 수정**

`.github/workflows/deploy-pages.yml`의 `cp toss-config.js dist/` 줄 다음에 추가:

```yaml
          cp manifest.webmanifest dist/
          cp -R icons dist/
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 65 pass, 0 fail

- [ ] **Step 5: 커밋**

```bash
git add .github/workflows/deploy-pages.yml tests/pwa.test.js
git commit -m "Ship manifest and icons in pages deploy"
```

---

### Task 5: 로컬 동작 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: dev 서버에서 manifest/아이콘 응답 확인**

```bash
PORT=5180 node server.js &
sleep 1
curl -sI http://localhost:5180/manifest.webmanifest | head -3
curl -sI http://localhost:5180/icons/apple-touch-icon-180.png | head -3
curl -s http://localhost:5180/manifest.webmanifest | node -e "JSON.parse(require('fs').readFileSync(0)); console.log('manifest JSON OK')"
kill %1
```

Expected: 둘 다 `HTTP/1.1 200`, Content-Type 각각 `application/manifest+json`/`image/png`, `manifest JSON OK`

- [ ] **Step 2: 전체 테스트 + 브라우저 스모크**

```bash
npm test
npm run smoke:browser
```

Expected: 65 pass 0 fail, 스모크 통과 (Chrome 미설치 환경이면 스모크는 CHROME_BIN 안내 후 실패 — 보고만 하고 진행)

- [ ] **Step 3: README 기능 목록에 한 줄 추가**

`README.md`의 "## 포함된 기능" 목록 끝에 추가:

```markdown
- 홈 화면 설치(PWA manifest)
```

- [ ] **Step 4: 커밋**

```bash
git add README.md
git commit -m "Document PWA install support"
```

---

## 합류 (참고)

`worktree-pwa-support` → main 병합은 다른 세션의 신청-결제 작업과 독립적이며 순서 무관. 충돌 가능 지점: `index.html` head, `deploy-pages.yml` 복사 목록. 운영 검증: 배포 후 iPhone Safari "홈 화면에 추가" → 전체화면 실행/아이콘/스플래시 확인.
