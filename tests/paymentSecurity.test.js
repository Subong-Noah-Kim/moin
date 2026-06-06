import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clearAdminSession, getAmountFromMeetup, getStoredAdminSession } from '../supabase-client.js';

const assetVersionPlaceholder = '__ASSET_VERSION__';
const cacheBustedSourceFiles = [
  '../index.html',
  '../admin.html',
  '../payment-result.html',
  '../main.js',
  '../admin.js',
  '../payment-result.js',
  '../supabase-client.js',
];

async function readProjectFile(pathname) {
  return readFile(new URL(pathname, import.meta.url), 'utf8');
}

function getAssetVersions(source) {
  return [...source.matchAll(/\?v=([^"'`\s)]+)/g)].map((match) => match[1]);
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, String(value));
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

const sensitiveAgentStatusKeys = [
  { name: 'access token field', pattern: /^(access[_-]?token|accessToken)$/i },
  { name: 'refresh token field', pattern: /^(refresh[_-]?token|refreshToken)$/i },
  { name: 'payment key field', pattern: /^paymentKey$/i },
  { name: 'checkout token field', pattern: /^checkoutToken$/i },
  { name: 'service role field', pattern: /^(service[_-]?role|serviceRole|serviceRoleKey)$/i },
];

const sensitiveAgentStatusValues = [
  {
    name: 'jwt-like token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: 'bearer token',
    pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i,
  },
  {
    name: 'toss secret key',
    pattern: /\b(?:test|live)_sk_[A-Za-z0-9_=-]{12,}\b/i,
  },
  {
    name: 'checkout token value',
    pattern: /\bmc_checkout_[A-Za-z0-9_-]{12,}\b/,
  },
  {
    name: 'payment key assignment',
    pattern: /\bpaymentKey\s*[:=]\s*["']?[A-Za-z0-9_-]{12,}\b/,
  },
  {
    name: 'checkout token assignment',
    pattern: /\bcheckoutToken\s*[:=]\s*["']?[A-Za-z0-9_-]{12,}\b/,
  },
  {
    name: 'service role assignment',
    pattern: /\b(?:service[_-]?role|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}\b/i,
  },
];

function collectSensitiveAgentStatusFindings(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSensitiveAgentStatusFindings(item, `${path}[${index}]`, findings));
    return findings;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      const keyRule = sensitiveAgentStatusKeys.find((rule) => rule.pattern.test(key));
      const nextPath = `${path}.${key}`;

      if (keyRule) {
        findings.push(`${nextPath}: ${keyRule.name}`);
      }

      collectSensitiveAgentStatusFindings(nested, nextPath, findings);
    });
    return findings;
  }

  if (typeof value === 'string') {
    sensitiveAgentStatusValues.forEach((rule) => {
      if (rule.pattern.test(value)) {
        findings.push(`${path}: ${rule.name}`);
      }
    });
  }

  return findings;
}

test('getAmountFromMeetup prefers numeric price_amount over display price text', () => {
  assert.equal(
    getAmountFromMeetup({
      price_amount: 39000,
      price: '1원',
    }),
    39000,
  );
});

test('getAmountFromMeetup supports normalized camelCase priceAmount', () => {
  assert.equal(
    getAmountFromMeetup({
      priceAmount: 49000,
      price: '무료',
    }),
    49000,
  );
});

test('getAmountFromMeetup falls back to display price for static demo meetups', () => {
  assert.equal(
    getAmountFromMeetup({
      price: '148,000원',
    }),
    148000,
  );
});

test('payment hardening migration locks anonymous Toss orders to meetup price and checkout token', async () => {
  const migration = await readProjectFile('../supabase/migrations/20260606070000_harden_toss_payment_security.sql');

  assert.match(migration, /amount = coalesce/);
  assert.match(migration, /price_amount/);
  assert.match(migration, /checkout_token is not null/);
  assert.match(migration, /confirm_toss_payment_order/);
});

test('Toss confirmation function validates server amount and failure checkout token', async () => {
  const edgeFunction = await readProjectFile('../supabase/functions/confirm-toss-payment/index.ts');

  assert.match(edgeFunction, /assertServerAmount/);
  assert.match(edgeFunction, /findMeetupForOrder/);
  assert.match(edgeFunction, /checkoutToken is required/);
  assert.match(edgeFunction, /confirm_toss_payment_order/);
});

test('public meetup rendering escapes dynamic content before writing HTML templates', async () => {
  const mainScript = await readProjectFile('../main.js');

  assert.match(mainScript, /function escapeHtml/);
  assert.match(mainScript, /function escapeAttribute/);
  assert.match(mainScript, /function escapeImageUrl/);
  assert.match(mainScript, /createTagMarkup\(tags\) {\s+return tags\.map\(\(tag\) => `<span>\$\{escapeHtml\(tag\)\}<\/span>`\)/);
  assert.match(mainScript, /alt="\$\{escapeAttribute\(item\.title\)\}"/);
  assert.match(mainScript, /src="\$\{escapeImageUrl\(item\.image\)\}"/);
  assert.match(mainScript, /data-detail="\$\{escapeAttribute\(item\.id\)\}"/);
});

test('checkout waits for Toss SDK loading and prevents duplicate pending orders', async () => {
  const mainScript = await readProjectFile('../main.js');

  assert.match(mainScript, /let tossSdkScriptPromise/);
  assert.match(mainScript, /await ensureTossSdkScript\(\)/);
  assert.match(mainScript, /script\.addEventListener\('load', handleLoad/);
  assert.match(mainScript, /script\.addEventListener\('error', handleError/);
  assert.match(mainScript, /let checkoutInProgress = false/);
  assert.match(mainScript, /if \(checkoutInProgress\)/);
  assert.match(mainScript, /shouldUnlockForm = false/);
});

test('docs distinguish wired test integration from remaining production setup', async () => {
  const [readme, supabaseReadme] = await Promise.all([
    readProjectFile('../README.md'),
    readProjectFile('../supabase/README.md'),
  ]);
  const docs = `${readme}\n${supabaseReadme}`;

  assert.match(readme, /create-public-submission/);
  assert.match(readme, /confirm-toss-payment/);
  assert.match(readme, /토스페이먼츠 테스트/);
  assert.match(readme, /실제 과금 전환/);
  assert.match(readme, /토스 라이브 키/);

  assert.match(supabaseReadme, /Supabase migrations and Edge Function setup notes/);
  assert.match(supabaseReadme, /create-public-submission/);
  assert.match(supabaseReadme, /confirm-toss-payment/);
  assert.match(supabaseReadme, /Toss Payments test flow only/);
  assert.match(supabaseReadme, /Toss Payments test confirm API/);

  assert.doesNotMatch(docs, /연동 준비|연결 준비|실제 결제 연동 전|서버 함수 연결 후/);
  assert.doesNotMatch(supabaseReadme, /Payment confirmation should be handled by a server endpoint or Supabase Edge Function/);
});

test('public payment copy separates Toss test mode from live payments', async () => {
  const [mainScript, resultHtml, resultScript] = await Promise.all([
    readProjectFile('../main.js'),
    readProjectFile('../payment-result.html'),
    readProjectFile('../payment-result.js'),
  ]);

  assert.match(mainScript, /토스 테스트 결제와 서버 승인 흐름/);
  assert.match(mainScript, /실제 출금은 없습니다/);
  assert.match(mainScript, /Supabase Edge Function이 승인 API를 호출/);
  assert.match(mainScript, /데모 결제 표시하기/);
  assert.match(mainScript, /데모 결제 표시를 저장했어요/);
  assert.match(mainScript, /테스트 결제 확인 표시가 있는 모임입니다/);
  assert.doesNotMatch(mainScript, /결제가 완료된 모임입니다/);
  assert.doesNotMatch(mainScript, /데모 결제 완료/);
  assert.doesNotMatch(mainScript, /서버 함수 연결 후 완료됩니다/);

  assert.match(resultHtml, /TOSS TEST RESULT/);
  assert.match(resultHtml, /토스페이먼츠 테스트/);
  assert.match(resultHtml, /결제 인증값을 서버에서 확인/);
  assert.match(resultHtml, /브라우저 저장소에\s+남기지 않습니다/);
  assert.match(resultHtml, /주문 상태와 결제\s+기록/);

  assert.match(resultScript, /테스트 결제 승인이 완료됐어요/);
  assert.match(resultScript, /테스트 주문 상태가 결제완료로 변경되었습니다/);
  assert.match(resultScript, /message\.includes\('TOSS_SECRET_KEY'\)[\s\S]*return '결제 승인 서버 설정을 확인해주세요\.'/);
  assert.doesNotMatch(resultScript, /결제가 완료됐어요/);
  assert.doesNotMatch(resultScript, /아직 배포되지 않았|아직 설정되지 않았/);
  assert.doesNotMatch(resultScript, /return message \|\| '결제 승인 처리에 실패했습니다\.'/);
});

test('payment result uses paymentKey for confirmation without exposing the raw identifier', async () => {
  const [resultHtml, resultScript] = await Promise.all([
    readProjectFile('../payment-result.html'),
    readProjectFile('../payment-result.js'),
  ]);
  const successFlow = resultScript.slice(
    resultScript.indexOf('async function handleSuccessResult'),
    resultScript.indexOf("if (result === 'success')"),
  );
  const failureFlow = resultScript.slice(resultScript.indexOf("const code = params.get('code')"));
  const sessionStorageWrites = [...resultScript.matchAll(/sessionStorage\.setItem\(([\s\S]*?)\);/g)]
    .map((match) => match[0]);
  const captureIndex = successFlow.indexOf("const paymentKey = params.get('paymentKey') || '';");
  const cleanIndex = successFlow.indexOf('clearPaymentResultQuery();');
  const confirmIndex = successFlow.indexOf('confirmTossPayment({ paymentKey, orderId, amount })');
  const checkoutTokenIndex = failureFlow.indexOf("const checkoutToken = params.get('checkoutToken') || '';");
  const failureCleanIndex = failureFlow.indexOf('clearPaymentResultQuery();');
  const recordFailureIndex = failureFlow.indexOf('recordTossPaymentFailure({ orderId, checkoutToken, code, message })');

  assert.match(resultHtml, /<meta name="referrer" content="no-referrer" \/>/);
  assert.match(resultHtml, /테스트 결제 접수 상태/);
  assert.match(resultHtml, /인증 정보가 도착했어요/);
  assert.doesNotMatch(resultHtml, /data-payment-key|테스트 결제키/);

  assert.match(resultScript, /const paymentKey = params\.get\('paymentKey'\) \|\| '';/);
  assert.match(resultScript, /function clearPaymentResultQuery\(\)/);
  assert.match(resultScript, /window\.history\.replaceState\(\{\}, document\.title, `\$\{window\.location\.pathname\}\$\{window\.location\.hash \|\| ''\}`\)/);
  assert.match(resultScript, /function rememberTossAuthSummary\(\{ orderId, amount \}\)/);
  assert.match(resultScript, /confirmTossPayment\(\{ paymentKey, orderId, amount \}\)/);
  assert.doesNotMatch(resultScript, /setText\(\s*['"]\[data-payment-key\]['"]\s*,\s*paymentKey\s*\)/);
  assert.doesNotMatch(resultScript, /(?:textContent|innerText|innerHTML)\s*=\s*paymentKey\b/);
  assert.deepEqual(sessionStorageWrites.filter((write) => /\bpaymentKey\b/.test(write)), []);

  assert.ok(captureIndex >= 0);
  assert.ok(cleanIndex > captureIndex);
  assert.ok(confirmIndex > cleanIndex);
  assert.ok(checkoutTokenIndex >= 0);
  assert.ok(failureCleanIndex > checkoutTokenIndex);
  assert.ok(recordFailureIndex > failureCleanIndex);
});

test('public localStorage sets recover from corrupted saved state', async () => {
  const [mainScript, paymentResultScript] = await Promise.all([
    readProjectFile('../main.js'),
    readProjectFile('../payment-result.js'),
  ]);

  assert.match(mainScript, /function readStringSet\(key\)/);
  assert.match(mainScript, /const saved = readStringSet\('momentclub:saved'\)/);
  assert.match(mainScript, /const notified = readStringSet\('momentclub:notified'\)/);
  assert.match(mainScript, /const paid = readStringSet\('momentclub:paid'\)/);
  assert.match(mainScript, /const publicStateMaxItems = 100/);
  assert.match(mainScript, /const publicStateMaxValueLength = 120/);
  assert.match(mainScript, /\.filter\(\(value\) => value && value\.length <= publicStateMaxValueLength\)/);
  assert.match(mainScript, /\.slice\(0, publicStateMaxItems\)/);
  assert.match(mainScript, /localStorage\.removeItem\(key\)/);
  assert.match(mainScript, /function persist\(key, set\) \{\s+try \{/);
  assert.doesNotMatch(mainScript, /const (?:saved|notified|paid) = new Set\(JSON\.parse/);

  assert.match(paymentResultScript, /function readStringSet\(key\)/);
  assert.match(paymentResultScript, /function persistStringSet\(key, set\)/);
  assert.match(paymentResultScript, /const paid = readStringSet\('momentclub:paid'\)/);
  assert.match(paymentResultScript, /const publicStateMaxItems = 100/);
  assert.match(paymentResultScript, /const publicStateMaxValueLength = 120/);
  assert.match(paymentResultScript, /persistStringSet\('momentclub:paid', paid\)/);
  assert.match(paymentResultScript, /localStorage\.removeItem\(key\)/);
  assert.doesNotMatch(paymentResultScript, /new Set\(JSON\.parse\(localStorage\.getItem\('momentclub:paid'\)/);
});

test('static asset cache-busting uses one deploy version placeholder', async () => {
  const [workflow, ...sources] = await Promise.all([
    readProjectFile('../.github/workflows/deploy-pages.yml'),
    ...cacheBustedSourceFiles.map(readProjectFile),
  ]);
  const versions = sources.flatMap(getAssetVersions);
  const uniqueVersions = new Set(versions);

  assert.ok(versions.length > 0);
  assert.deepEqual([...uniqueVersions], [assetVersionPlaceholder]);
  assert.match(workflow, /ASSET_VERSION="\$\{GITHUB_SHA::12\}"/);
  assert.match(workflow, /cp AGENTIC_STATUS\.json dist\//);
  assert.match(workflow, /s\/__ASSET_VERSION__\/\$\{ASSET_VERSION\}\/g/);
});

test('GitHub Pages workflow uses Node 24 compatible action versions', async () => {
  const workflow = await readProjectFile('../.github/workflows/deploy-pages.yml');
  const actionUses = [...workflow.matchAll(/^\s*uses:\s*(actions\/[^\s#]+)/gm)].map((match) => match[1]);

  assert.deepEqual(actionUses, [
    'actions/checkout@v6',
    'actions/setup-node@v6',
    'actions/checkout@v6',
    'actions/configure-pages@v6',
    'actions/upload-pages-artifact@v5',
    'actions/deploy-pages@v5',
  ]);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /package-manager-cache: false/);
  assert.match(workflow, /permissions:\s+contents: read\s+[\s\S]*?deploy:\s+needs: test\s+runs-on: ubuntu-latest\s+permissions:\s+contents: read\s+pages: write\s+id-token: write/);

  assert.doesNotMatch(workflow, /uses: actions\/checkout@v4/);
  assert.doesNotMatch(workflow, /uses: actions\/checkout@v5/);
  assert.doesNotMatch(workflow, /uses: actions\/setup-node@v4/);
  assert.doesNotMatch(workflow, /uses: actions\/setup-node@v5/);
  assert.doesNotMatch(workflow, /node-version: 20/);
  assert.doesNotMatch(workflow, /uses: actions\/configure-pages@v5/);
  assert.doesNotMatch(workflow, /uses: actions\/upload-pages-artifact@v3/);
  assert.doesNotMatch(workflow, /uses: actions\/upload-pages-artifact@v4/);
  assert.doesNotMatch(workflow, /uses: actions\/deploy-pages@v4/);
  assert.doesNotMatch(workflow, /actions: read/);
  assert.doesNotMatch(workflow, /enablement: true/);
});

test('admin orders include payment record reconciliation', async () => {
  const [adminHtml, adminScript, supabaseClient] = await Promise.all([
    readProjectFile('../admin.html'),
    readProjectFile('../admin.js'),
    readProjectFile('../supabase-client.js'),
  ]);

  assert.match(supabaseClient, /const adminPaymentFields = \[/);
  assert.match(supabaseClient, /selectRowsWithToken\(\s*'payments'/);
  assert.match(supabaseClient, /payments: resolveAdminRows\('결제', paymentsResult, warnings\)/);
  assert.doesNotMatch(supabaseClient, /실제 결제 연동 전/);
  assert.match(adminHtml, /<th>결제 기록<\/th>/);
  assert.match(adminScript, /function renderPaymentRecord/);
  assert.match(adminScript, /getPaymentForOrder\(order\.id\)/);
  assert.match(adminScript, /data-label="결제 기록"/);
  assert.match(adminScript, /기록 없음/);
});

test('admin sessions use short-lived storage without refresh token persistence', async () => {
  const [adminScript, supabaseClient] = await Promise.all([
    readProjectFile('../admin.js'),
    readProjectFile('../supabase-client.js'),
  ]);

  assert.match(supabaseClient, /function getAdminSessionStorage\(\) \{\s+try \{\s+return window\.sessionStorage;/);
  assert.match(supabaseClient, /function getLegacyAdminSessionStorage\(\) \{\s+try \{\s+return window\.localStorage;/);
  assert.match(supabaseClient, /function normalizeAdminSession\(session\)/);
  assert.match(supabaseClient, /expiresAt && expiresAt <= Date\.now\(\)/);
  assert.match(supabaseClient, /function createStoredAdminSession\(session\)[\s\S]*accessToken: session\.accessToken,[\s\S]*expiresAt: session\.expiresAt,[\s\S]*user: session\.user/);
  assert.match(supabaseClient, /clearAdminSession\(\);\s+if \(!storage \|\| !storedSession\)/);
  assert.match(supabaseClient, /removeStoredAdminSession\(getAdminSessionStorage\(\)\)/);
  assert.match(supabaseClient, /removeStoredAdminSession\(getLegacyAdminSessionStorage\(\)\)/);
  assert.match(supabaseClient, /catch \{\s+clearAdminSession\(\);\s+return null;/);
  assert.doesNotMatch(supabaseClient, /localStorage\.setItem\(adminSessionKey/);
  assert.doesNotMatch(supabaseClient, /localStorage\.getItem\(adminSessionKey/);
  assert.doesNotMatch(supabaseClient, /refreshToken/);

  assert.match(adminScript, /clearAdminSession,/);
  assert.match(adminScript, /const shouldClearAuthParams = hasAuthTokenParams\(\)/);
  assert.match(adminScript, /if \(shouldClearAuthParams\) \{\s+clearAuthParamsFromUrl\(\);/);
  assert.match(adminScript, /function hasAuthTokenParams\(\)/);
  assert.match(adminScript, /'refresh_token'/);
  assert.match(adminScript, /function getSessionUnavailableMessage\(session/);
  assert.match(adminScript, /관리자 세션이 만료되었습니다\. 다시 로그인해주세요\./);
  assert.match(adminScript, /function requireActiveSession\(statusElement/);
  assert.match(adminScript, /clearUnavailableActiveSession\(\)/);
  assert.doesNotMatch(adminScript, /refreshToken:/);
  assert.doesNotMatch(adminScript, /pendingInvite\.refreshToken/);
});

test('admin stored sessions clean up legacy, corrupted, and expired state', () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const originalWindow = globalThis.window;
  const key = 'momentclub:admin-session';
  const sessionStorage = createMemoryStorage();
  const localStorage = createMemoryStorage({
    [key]: JSON.stringify({
      accessToken: 'legacy-access-token',
      expiresAt: Date.now() + 60_000,
    }),
  });

  globalThis.window = { sessionStorage, localStorage };

  try {
    sessionStorage.setItem(key, JSON.stringify({
      accessToken: 'tab-access-token',
      refreshToken: 'must-not-survive',
      expiresAt: Date.now() + 60_000,
      user: { email: 'admin@example.com' },
    }));

    const storedSession = getStoredAdminSession();

    assert.equal(storedSession.accessToken, 'tab-access-token');
    assert.equal(storedSession.refreshToken, undefined);
    assert.deepEqual(storedSession.user, { email: 'admin@example.com' });
    assert.equal(localStorage.getItem(key), null);

    sessionStorage.setItem(key, '{bad json');
    assert.equal(getStoredAdminSession(), null);
    assert.equal(sessionStorage.getItem(key), null);

    sessionStorage.setItem(key, JSON.stringify({
      accessToken: 'expired-access-token',
      expiresAt: Date.now() - 1,
    }));
    assert.equal(getStoredAdminSession(), null);
    assert.equal(sessionStorage.getItem(key), null);

    localStorage.setItem(key, JSON.stringify({
      accessToken: 'stale-legacy-token',
      expiresAt: Date.now() + 60_000,
    }));
    clearAdminSession();
    assert.equal(sessionStorage.getItem(key), null);
    assert.equal(localStorage.getItem(key), null);
  } finally {
    if (hadWindow) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('admin dashboard renders agentic status from a static JSON board', async () => {
  const [adminHtml, adminStyles, adminScript, agenticStatus] = await Promise.all([
    readProjectFile('../admin.html'),
    readProjectFile('../admin.css'),
    readProjectFile('../admin.js'),
    readProjectFile('../AGENTIC_STATUS.json'),
  ]);
  const status = JSON.parse(agenticStatus);

  assert.match(adminHtml, /data-agentic-board/);
  assert.match(adminHtml, /data-tab-button="agentic"/);
  assert.match(adminHtml, /data-tab-panel="agentic"[\s\S]*data-agentic-board[\s\S]*hidden/);
  assert.match(adminHtml, /data-agentic-summary/);
  assert.match(adminHtml, /data-agentic-agents/);
  assert.match(adminHtml, /data-agentic-tasks/);
  assert.match(adminHtml, /data-agentic-refresh/);
  assert.match(adminStyles, /\.agentic-board/);
  assert.match(adminStyles, /\.agent-grid/);
  assert.match(adminStyles, /\.task-list/);
  assert.match(adminStyles, /\.task-detail/);
  assert.match(adminStyles, /\.task-item\.has-detail/);
  assert.match(adminStyles, /\.task-item\.has-detail:focus-visible/);
  assert.match(adminScript, /AGENTIC_STATUS\.json\?v=__ASSET_VERSION__/);
  assert.match(adminScript, /function renderAgenticStatus/);
  assert.match(adminScript, /function loadAgenticStatus/);
  assert.match(adminScript, /function renderTaskDetails/);
  assert.match(adminScript, /const detailsMarkup = renderTaskDetails\(task\)/);
  assert.match(adminScript, /function toggleTaskDetail/);
  assert.match(adminScript, /agenticTasks\.addEventListener\('click', handleTaskItemClick\)/);
  assert.match(adminScript, /agenticTasks\.addEventListener\('keydown', handleTaskItemKeydown\)/);
  assert.match(adminScript, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(adminScript, /상세 보기/);
  assert.match(adminScript, /무슨 작업인가요\?/);
  assert.match(adminScript, /왜 필요한가요\?/);
  assert.match(adminScript, /간단한 개발 방향/);
  assert.match(adminScript, /if \(getActiveTab\(\) === 'agentic'\)/);
  assert.match(adminScript, /if \(target === 'agentic'\)/);
  assert.doesNotMatch(adminScript, /showDashboard\(\);\s+void loadAgenticStatus\(\);/);
  assert.match(adminScript, /agenticRefreshButton\.addEventListener\('click', loadAgenticStatus\)/);
  assert.match(status.branch, /^(main|codex\/[a-z0-9-]+)$/);
  assert.equal(status.summary.deployNeeded, status.tasks.filter((task) => task.deployNeeded).length);
  assert.ok(Array.isArray(status.agents));
  assert.ok(Array.isArray(status.tasks));
  assert.ok(status.agents.some((agent) => agent.name === 'UX/UI Agent'));
  assert.ok(status.tasks.some((task) => task.id === 'AG-0004' && task.status === 'deployed'));
  assert.ok(
    status.tasks.some(
      (task) =>
        task.id === 'AG-0007' &&
        task.details?.summary &&
        task.details?.what &&
        task.details?.why &&
        task.details?.developmentDirection &&
        Array.isArray(task.details?.notes),
    ),
  );
});

test('local agent monitor polls live status without publishing it to Pages', async () => {
  const [workflow, server, monitorHtml, monitorStyles, monitorScript, liveStatus] = await Promise.all([
    readProjectFile('../.github/workflows/deploy-pages.yml'),
    readProjectFile('../server.js'),
    readProjectFile('../agent-monitor.html'),
    readProjectFile('../agent-monitor.css'),
    readProjectFile('../agent-monitor.js'),
    readProjectFile('../AGENTIC_LIVE_STATUS.json'),
  ]);
  const status = JSON.parse(liveStatus);

  assert.match(server, /\.json': 'application\/json; charset=utf-8'/);
  assert.match(server, /Cache-Control', 'no-store'/);
  assert.match(monitorHtml, /data-monitor-root/);
  assert.match(monitorHtml, /data-agent-list/);
  assert.match(monitorHtml, /data-event-list/);
  assert.match(monitorHtml, /data-task-list/);
  assert.match(monitorHtml, /data-task-count/);
  assert.match(monitorHtml, /agent-monitor\.js/);
  assert.match(monitorStyles, /\.monitor-layout/);
  assert.match(monitorStyles, /\.task-panel/);
  assert.match(monitorStyles, /\.task-item\.has-detail/);
  assert.match(monitorStyles, /\.task-detail/);
  assert.match(monitorScript, /AGENTIC_LIVE_STATUS\.json/);
  assert.match(monitorScript, /AGENTIC_STATUS\.json/);
  assert.match(monitorScript, /moin:agent-monitor:open-task-ids/);
  assert.match(monitorScript, /window\.localStorage\?\.getItem\(openTaskStorageKey\)/);
  assert.match(monitorScript, /window\.localStorage\?\.setItem\(openTaskStorageKey/);
  assert.match(monitorScript, /function renderTaskDetails/);
  assert.match(monitorScript, /function toggleTaskDetail/);
  assert.match(monitorScript, /data-task-id="\$\{escapeHtml\(taskId\)\}"/);
  assert.match(monitorScript, /<details class="task-detail"\$\{isOpen \? ' open' : ''\}>/);
  assert.match(monitorScript, /taskList\.addEventListener\('click', handleTaskItemClick\)/);
  assert.match(monitorScript, /taskList\.addEventListener\('keydown', handleTaskItemKeydown\)/);
  assert.match(monitorScript, /taskList\.addEventListener\('toggle', handleTaskDetailToggle, true\)/);
  assert.match(monitorScript, /document\.visibilityState !== 'visible'/);
  assert.match(monitorScript, /window\.setTimeout\(loadLiveStatus, state\.pollIntervalMs\)/);
  assert.doesNotMatch(workflow, /cp agent-monitor\./);
  assert.doesNotMatch(workflow, /cp AGENTIC_LIVE_STATUS\.json/);
  assert.equal(status.monitor.mode, 'local');
  assert.ok(status.monitor.pollIntervalMs >= 5000);
  assert.ok(Array.isArray(status.agents));
  assert.ok(Array.isArray(status.events));
});

test('agent status artifacts do not contain sensitive tokens or payment identifiers', async () => {
  const statusFiles = [
    '../AGENTIC_STATUS.json',
    '../AGENTIC_LIVE_STATUS.json',
  ];
  const syntheticFindings = collectSensitiveAgentStatusFindings({
    accessToken: 'stored-by-mistake',
    nested: {
      note: 'Bearer eyJaaaaaaaaaaaa.bbbbbbbbbbbbbbbb.cccccccccccccccc',
    },
  });
  const findings = [];

  assert.ok(syntheticFindings.some((finding) => finding.includes('access token field')));
  assert.ok(syntheticFindings.some((finding) => finding.includes('bearer token')));

  for (const pathname of statusFiles) {
    const parsed = JSON.parse(await readProjectFile(pathname));
    collectSensitiveAgentStatusFindings(parsed).forEach((finding) => {
      findings.push(`${pathname} ${finding}`);
    });
  }

  assert.deepEqual(findings, []);
});

test('public submissions route through an abuse-controlled Edge Function', async () => {
  const [config, supabaseClient, edgeFunction, setupMigration, lockMigration] = await Promise.all([
    readProjectFile('../supabase/config.toml'),
    readProjectFile('../supabase-client.js'),
    readProjectFile('../supabase/functions/create-public-submission/index.ts'),
    readProjectFile('../supabase/migrations/20260606080000_public_submission_abuse_controls.sql'),
    readProjectFile('../supabase/migrations/20260606090000_lock_public_direct_inserts.sql'),
  ]);

  assert.match(config, /\[functions\.create-public-submission\]\s+verify_jwt = false/);
  assert.match(supabaseClient, /functions\/v1\/create-public-submission/);
  assert.match(supabaseClient, /callPublicSubmission\('application'/);
  assert.match(supabaseClient, /callPublicSubmission\('demo_order'/);
  assert.match(supabaseClient, /callPublicSubmission\('toss_order'/);
  assert.doesNotMatch(supabaseClient, /insertRow\('applications'/);
  assert.doesNotMatch(supabaseClient, /insertRow\('orders'/);
  assert.match(edgeFunction, /getVisitorHash/);
  assert.match(edgeFunction, /PUBLIC_SUBMISSION_HASH_SALT/);
  assert.match(edgeFunction, /rpc\/create_public_application/);
  assert.match(edgeFunction, /rpc\/create_public_order/);
  assert.match(edgeFunction, /PUBLIC_SUBMISSION_RATE_LIMITED/);
  assert.match(setupMigration, /create table if not exists public\.public_submission_attempts/);
  assert.match(setupMigration, /create or replace function public\.create_public_application/);
  assert.match(setupMigration, /create or replace function public\.create_public_order/);
  assert.match(setupMigration, /v_meetup\.price_amount/);
  assert.match(lockMigration, /revoke insert on public\.applications from anon/);
  assert.match(lockMigration, /revoke insert on public\.orders from anon/);
});

test('capacity controls migration defines remaining spot and pending expiry contract', async () => {
  const migration = await readProjectFile('../supabase/migrations/20260607000000_capacity_remaining_spots.sql');

  assert.match(migration, /add column if not exists capacity integer/);
  assert.match(migration, /meetups_capacity_positive/);
  assert.match(migration, /add column if not exists registration_status text not null default 'open'/);
  assert.match(migration, /registration_status in \('open', 'closed'\)/);
  assert.match(migration, /add column if not exists expires_at timestamptz/);
  assert.match(migration, /created_at \+ interval '30 minutes'/);
  assert.match(migration, /orders_active_seat_holds_idx/);
  assert.match(migration, /create or replace function public\.get_meetup_seat_snapshot/);
  assert.match(migration, /remaining_spots/);
  assert.match(migration, /effective_registration_status/);
  assert.match(migration, /status in \('paid', 'demo_paid'\)/);
  assert.match(migration, /status = 'pending'[\s\S]*expires_at > now\(\)/);
  assert.match(migration, /create or replace function public\.assert_meetup_can_register/);
  assert.match(migration, /for update/);
  assert.match(migration, /MEETUP_REGISTRATION_CLOSED/);
  assert.match(migration, /MEETUP_SOLD_OUT/);
  assert.match(migration, /create or replace function public\.expire_stale_pending_orders/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /grant execute on function public\.get_meetup_seat_snapshot\(text\) to service_role/);
  assert.match(migration, /grant execute on function public\.assert_meetup_can_register\(text\) to service_role/);
  assert.doesNotMatch(migration, /status_label/);
  assert.doesNotMatch(migration, /grant execute on function public\.get_meetup_seat_snapshot\(text\) to authenticated/);
  assert.doesNotMatch(migration, /registration_status in \('open', 'sold_out', 'closed'\)/);
});

test('capacity guards wire public submissions and Toss confirmation expiry checks', async () => {
  const [guardMigration, publicSubmissionFunction, tossConfirmFunction, supabaseClient] = await Promise.all([
    readProjectFile('../supabase/migrations/20260607010000_capacity_rpc_guards.sql'),
    readProjectFile('../supabase/functions/create-public-submission/index.ts'),
    readProjectFile('../supabase/functions/confirm-toss-payment/index.ts'),
    readProjectFile('../supabase-client.js'),
  ]);
  const applicationBody = guardMigration.slice(
    guardMigration.indexOf('create or replace function public.create_public_application'),
    guardMigration.indexOf('create or replace function public.create_public_order'),
  );
  const orderBody = guardMigration.slice(
    guardMigration.indexOf('create or replace function public.create_public_order'),
    guardMigration.indexOf('create or replace function public.confirm_toss_payment_order'),
  );
  const confirmBody = guardMigration.slice(
    guardMigration.indexOf('create or replace function public.confirm_toss_payment_order'),
  );
  const tossConfirmFlow = tossConfirmFunction.slice(
    tossConfirmFunction.indexOf('const { paymentKey, orderId, amount } = assertPaymentPayload(payload);'),
  );
  const applicationGuardIndex = applicationBody.indexOf('v_meetup := public.assert_meetup_can_register(p_meetup_id);');
  const applicationInsertIndex = applicationBody.indexOf('insert into public.applications');
  const orderGuardIndex = orderBody.indexOf('v_meetup := public.assert_meetup_can_register(p_meetup_id);');
  const orderInsertIndex = orderBody.indexOf('insert into public.orders');
  const sqlExpiryGuardIndex = confirmBody.indexOf("if v_order.status = 'pending' and v_order.expires_at <= now() then");
  const sqlPaidUpdateIndex = confirmBody.indexOf('update public.orders');
  const expiredCheckIndex = tossConfirmFlow.indexOf('isExpiredPendingOrder(order)');
  const markExpiredIndex = tossConfirmFlow.indexOf("markOrderFinalStatus(order, 'failed')");
  const expiredResponseIndex = tossConfirmFlow.indexOf("code: 'ORDER_EXPIRED'");
  const tossConfirmIndex = tossConfirmFlow.indexOf('const tossPayment = await confirmWithToss(paymentKey, orderId, amount)');
  const sqlConfirmIndex = tossConfirmFlow.indexOf('const result = await confirmOrderAndPayment(order, tossPayment)');

  assert.match(guardMigration, /create or replace function public\.create_public_application/);
  assert.match(guardMigration, /v_meetup := public\.assert_meetup_can_register\(p_meetup_id\)/);
  assert.match(guardMigration, /perform public\.expire_stale_pending_orders\(100\)/);
  assert.ok(applicationGuardIndex >= 0 && applicationGuardIndex < applicationInsertIndex);
  assert.match(guardMigration, /create or replace function public\.create_public_order/);
  assert.ok(orderGuardIndex >= 0 && orderGuardIndex < orderInsertIndex);
  assert.match(guardMigration, /expires_at/);
  assert.match(guardMigration, /expires_at,\s+source/);
  assert.match(guardMigration, /case when v_action = 'toss_order' then now\(\) \+ interval '30 minutes' else null end/);
  assert.match(guardMigration, /v_meetup\.price_amount/);
  assert.match(guardMigration, /to_jsonb\(v_order\) - 'checkout_token'/);
  assert.match(guardMigration, /create or replace function public\.confirm_toss_payment_order/);
  assert.match(guardMigration, /for update/);
  assert.match(guardMigration, /v_order\.status = 'pending' and v_order\.expires_at <= now\(\)/);
  assert.match(guardMigration, /ORDER_EXPIRED/);
  assert.ok(sqlExpiryGuardIndex >= 0 && sqlExpiryGuardIndex < sqlPaidUpdateIndex);
  assert.match(guardMigration, /grant execute on function public\.confirm_toss_payment_order\(uuid, text, text, timestamptz, jsonb\) to service_role/);

  assert.match(publicSubmissionFunction, /MEETUP_SOLD_OUT/);
  assert.match(publicSubmissionFunction, /MEETUP_REGISTRATION_CLOSED/);
  assert.match(publicSubmissionFunction, /return 409/);
  assert.match(publicSubmissionFunction, /function getErrorCode\(error: unknown\)/);
  assert.match(publicSubmissionFunction, /code: getErrorCode\(error\)/);
  assert.match(publicSubmissionFunction, /모임 정원이 마감되었습니다/);
  assert.match(publicSubmissionFunction, /이 모임은 지금 신청을 받지 않습니다/);
  assert.match(publicSubmissionFunction, /신청 가능한 모임을 찾지 못했습니다/);

  assert.match(tossConfirmFunction, /expires_at: string \| null/);
  assert.match(tossConfirmFunction, /checkout_token,expires_at/);
  assert.match(tossConfirmFunction, /function isExpiredPendingOrder\(order: OrderRow\)/);
  assert.match(tossConfirmFunction, /Date\.parse\(order\.expires_at\)/);
  assert.match(tossConfirmFunction, /expiresAt <= Date\.now\(\)/);
  assert.match(tossConfirmFunction, /결제 가능 시간이 만료되었습니다\. 다시 신청해 주세요\./);
  assert.match(tossConfirmFunction, /code: 'ORDER_EXPIRED'/);
  assert.ok(expiredCheckIndex >= 0 && expiredCheckIndex < tossConfirmIndex);
  assert.ok(expiredCheckIndex < sqlConfirmIndex);
  assert.ok(markExpiredIndex > expiredCheckIndex);
  assert.ok(expiredResponseIndex > markExpiredIndex);

  assert.match(supabaseClient, /const message = await parseErrorMessage\(response\)/);
  assert.match(supabaseClient, /error\.status = response\.status/);
  assert.match(supabaseClient, /error\.code = message\.code/);
});

test('capacity read contract exposes safe public and admin availability fields', async () => {
  const migration = await readProjectFile('../supabase/migrations/20260607020000_capacity_read_contract.sql');
  const publicContract = migration.slice(
    migration.indexOf('create or replace function public.list_public_meetup_availability'),
    migration.indexOf('create or replace function public.list_admin_meetup_availability'),
  );
  const publicReturnSignature = publicContract.slice(
    publicContract.indexOf('returns table'),
    publicContract.indexOf('language sql'),
  );
  const publicProjection = publicContract.slice(
    publicContract.indexOf('select\n    availability.meetup_id'),
    publicContract.indexOf('from availability;'),
  );
  const adminContract = migration.slice(
    migration.indexOf('create or replace function public.list_admin_meetup_availability'),
  );

  assert.match(migration, /create or replace function public\.list_public_meetup_availability\(\)/);
  assert.match(publicReturnSignature, /returns table \(\s+meetup_id text,\s+capacity integer,\s+remaining_spots integer,\s+effective_registration_status text,\s+can_register boolean/s);
  assert.match(publicContract, /where meetups\.is_published = true/);
  assert.match(publicContract, /orders\.status in \('paid', 'demo_paid'\)/);
  assert.match(publicContract, /orders\.status = 'pending'[\s\S]*orders\.expires_at > now\(\)/);
  assert.match(publicContract, /grant execute on function public\.list_public_meetup_availability\(\) to anon/);
  assert.match(publicContract, /grant execute on function public\.list_public_meetup_availability\(\) to authenticated/);
  assert.match(publicContract, /revoke select on public\.meetups from anon/);
  assert.match(publicContract, /grant select \([\s\S]*status_label[\s\S]*schedule[\s\S]*\) on public\.meetups to anon/);
  assert.doesNotMatch(publicReturnSignature, /active_order_count|^\s+registration_status text|closed_at|close_reason|buyer_name|provider_payment_key|checkout_token/m);
  assert.doesNotMatch(publicProjection, /active_order_count|availability\.registration_status|closed_at|close_reason|buyer_name|provider_payment_key|checkout_token/);
  assert.doesNotMatch(publicContract, /grant select on public\.meetups to anon/);

  assert.match(migration, /create or replace function public\.list_admin_meetup_availability\(\)/);
  assert.match(adminContract, /if not public\.is_admin\(\) then\s+raise exception 'ADMIN_REQUIRED';\s+end if;/);
  assert.match(adminContract, /paid_order_count/);
  assert.match(adminContract, /pending_order_count/);
  assert.match(adminContract, /closed_at/);
  assert.match(adminContract, /close_reason/);
  assert.match(adminContract, /grant execute on function public\.list_admin_meetup_availability\(\) to authenticated/);
  assert.doesNotMatch(adminContract, /grant execute on function public\.list_admin_meetup_availability\(\) to anon/);
});

test('capacity smoke test SQL covers safe live migration verification paths', async () => {
  const [smokeTest, supabaseReadme] = await Promise.all([
    readProjectFile('../supabase/capacity-smoke-test.sql'),
    readProjectFile('../supabase/README.md'),
  ]);

  assert.match(smokeTest, /begin;/);
  assert.match(smokeTest, /rollback;/);
  assert.match(smokeTest, /20260607000000_capacity_remaining_spots\.sql/);
  assert.match(smokeTest, /20260607010000_capacity_rpc_guards\.sql/);
  assert.match(smokeTest, /20260607020000_capacity_read_contract\.sql/);
  assert.match(smokeTest, /__capacity_smoke_/);
  assert.match(smokeTest, /where meetup_id in \(/);
  assert.match(smokeTest, /where id in \(/);
  assert.match(smokeTest, /public\.create_public_application/);
  assert.match(smokeTest, /public\.create_public_order/);
  assert.match(smokeTest, /provider_order_id = 'capacity-smoke-unlimited-order'[\s\S]*expires_at > now\(\)/);
  assert.match(smokeTest, /expected no pending Toss smoke orders with null expires_at/);
  assert.match(smokeTest, /capacity-smoke-active-payment-key/);
  assert.match(smokeTest, /expected non-expired Toss pending order to become paid/);
  assert.match(smokeTest, /expected payment row for confirmed non-expired Toss order/);
  assert.match(smokeTest, /public\.get_meetup_seat_snapshot\('__capacity_smoke_one__'\)/);
  assert.match(smokeTest, /public\.list_public_meetup_availability\(\)/);
  assert.match(smokeTest, /expected public availability read contract to return sold_out/);
  assert.match(smokeTest, /effective_registration_status' <> 'sold_out'/);
  assert.match(smokeTest, /expected MEETUP_SOLD_OUT/);
  assert.match(smokeTest, /expected MEETUP_SOLD_OUT for application/);
  assert.match(smokeTest, /expected MEETUP_REGISTRATION_CLOSED/);
  assert.match(smokeTest, /public\.confirm_toss_payment_order/);
  assert.match(smokeTest, /expected ORDER_EXPIRED/);
  assert.match(smokeTest, /public\.expire_stale_pending_orders\(10000\)/);
  assert.match(smokeTest, /expected the smoke expired pending order to be marked failed/);
  assert.doesNotMatch(smokeTest, /commit;/i);
  assert.doesNotMatch(smokeTest, /like '__capacity_smoke_%'/i);

  assert.match(supabaseReadme, /## 12\. Capacity and Sold-Out Guard Rollout/);
  assert.match(supabaseReadme, /20260606070000_harden_toss_payment_security\.sql/);
  assert.match(supabaseReadme, /20260606080000_public_submission_abuse_controls\.sql/);
  assert.match(supabaseReadme, /20260606090000_lock_public_direct_inserts\.sql/);
  assert.match(supabaseReadme, /20260607000000_capacity_remaining_spots\.sql[\s\S]*20260607010000_capacity_rpc_guards\.sql[\s\S]*20260607020000_capacity_read_contract\.sql/);
  assert.match(supabaseReadme, /Do not deploy `functions\/create-public-submission` or `functions\/confirm-toss-payment`/);
});

test('drawer and checkout modal use inert focus traps with opener restoration', async () => {
  const [indexHtml, mainScript] = await Promise.all([
    readProjectFile('../index.html'),
    readProjectFile('../main.js'),
  ]);

  assert.match(indexHtml, /data-drawer hidden inert/);
  assert.match(indexHtml, /data-checkout-modal hidden inert/);
  assert.match(indexHtml, /class="drawer-panel"[^>]*tabindex="-1"/);
  assert.match(indexHtml, /class="checkout-panel"[^>]*tabindex="-1"/);
  assert.match(mainScript, /function trapFocus/);
  assert.match(mainScript, /function getTopOpenModal/);
  assert.match(mainScript, /drawerRestoreFocusElement/);
  assert.match(mainScript, /checkoutRestoreFocusElement/);
  assert.match(mainScript, /event\.key === 'Tab'/);
  assert.match(mainScript, /closeModal\(drawer, 'drawer-open', drawerRestoreFocusElement/);
  assert.match(mainScript, /closeModal\(checkoutModal, 'checkout-open', checkoutRestoreFocusElement/);
});

test('public application and checkout forms have explicit labels', async () => {
  const [mainScript, styles] = await Promise.all([
    readProjectFile('../main.js'),
    readProjectFile('../styles.css'),
  ]);

  assert.match(mainScript, /function createFieldId\(\.\.\.parts\)/);
  assert.match(mainScript, /const applicationNameId = createFieldId\('application', item\.id, 'name'\)/);
  assert.match(mainScript, /const applicationNameHelpId = createFieldId\(applicationNameId, 'help'\)/);
  assert.match(mainScript, /const applicationInterestId = createFieldId\('application', item\.id, 'interest'\)/);
  assert.match(mainScript, /const applicationInterestHelpId = createFieldId\(applicationInterestId, 'help'\)/);
  assert.match(mainScript, /<label class="field-group" for="\$\{escapeAttribute\(applicationNameId\)\}">[\s\S]*<span>이름<\/span>[\s\S]*id="\$\{escapeAttribute\(applicationNameId\)\}"[\s\S]*name="name"[\s\S]*aria-describedby="\$\{escapeAttribute\(applicationNameHelpId\)\}"/);
  assert.match(mainScript, /id="\$\{escapeAttribute\(applicationNameHelpId\)\}">신청 확인에 사용할 이름을 적어주세요\./);
  assert.match(mainScript, /<label class="field-group" for="\$\{escapeAttribute\(applicationInterestId\)\}">[\s\S]*<span>이 모임에 끌린 이유<\/span>[\s\S]*id="\$\{escapeAttribute\(applicationInterestId\)\}"[\s\S]*name="interest"[\s\S]*aria-describedby="\$\{escapeAttribute\(applicationInterestHelpId\)\}"/);
  assert.match(mainScript, /id="\$\{escapeAttribute\(applicationInterestHelpId\)\}">모임에 끌린 이유를 한 줄로 적어주세요\./);
  assert.doesNotMatch(mainScript, /<input name="name" type="text" placeholder="이름"/);
  assert.doesNotMatch(mainScript, /<input name="interest" type="text" placeholder=/);

  assert.match(mainScript, /const checkoutPayerId = createFieldId\('checkout', item\.id, 'payer'\)/);
  assert.match(mainScript, /const checkoutPayerHelpId = createFieldId\(checkoutPayerId, 'help'\)/);
  assert.match(mainScript, /<label class="field-group" for="\$\{escapeAttribute\(checkoutPayerId\)\}">[\s\S]*<span>결제자 이름 \(선택\)<\/span>[\s\S]*id="\$\{escapeAttribute\(checkoutPayerId\)\}"[\s\S]*name="payer"[\s\S]*aria-describedby="\$\{escapeAttribute\(checkoutPayerHelpId\)\}"/);
  assert.match(mainScript, /id="\$\{escapeAttribute\(checkoutPayerHelpId\)\}">비워두어도 결제를 진행할 수 있습니다\./);
  assert.match(mainScript, /<fieldset>[\s\S]*<legend>결제 수단<\/legend>[\s\S]*name="method"/);
  assert.doesNotMatch(mainScript, /<label>\s+이름 \(선택\)/);

  assert.match(styles, /\.field-group\s*\{/);
  assert.match(styles, /\.form-helper\s*\{/);
  assert.match(styles, /\.checkout-form \.field-group input\[type="text"\]/);
});

test('mobile bottom navigation is visible and tracks active sections', async () => {
  const [indexHtml, styles, mainScript] = await Promise.all([
    readProjectFile('../index.html'),
    readProjectFile('../styles.css'),
    readProjectFile('../main.js'),
  ]);

  assert.match(indexHtml, /styles\.css\?v=__ASSET_VERSION__/);
  assert.match(indexHtml, /main\.js\?v=__ASSET_VERSION__/);
  assert.match(indexHtml, /data-mobile-tabs/);
  assert.doesNotMatch(indexHtml, /data-mobile-apply/);
  assert.match(indexHtml, /data-mobile-nav="meetups"/);
  assert.match(indexHtml, /data-mobile-nav="events"/);
  assert.match(indexHtml, /data-mobile-nav="waitlist"/);
  assert.match(styles, /bottom: calc\(10px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /\.mobile-tabs a\[aria-current='page'\]/);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(mainScript, /const mobileNavLinks = document\.querySelectorAll/);
  assert.match(mainScript, /function updateMobileNavActiveSection/);
  assert.match(mainScript, /function syncMobileNavFromHash/);
  assert.match(mainScript, /syncMobileNavFromHash\(\)/);
  assert.match(mainScript, /event\.preventDefault\(\)/);
  assert.match(mainScript, /section\.scrollIntoView\(\{ block: 'start' \}\)/);
  assert.doesNotMatch(mainScript, /data-mobile-apply/);
});

test('admin tables collapse into labeled mobile cards', async () => {
  const [adminHtml, adminStyles, adminScript] = await Promise.all([
    readProjectFile('../admin.html'),
    readProjectFile('../admin.css'),
    readProjectFile('../admin.js'),
  ]);

  assert.match(adminHtml, /admin\.css\?v=__ASSET_VERSION__/);
  assert.match(adminHtml, /admin\.js\?v=__ASSET_VERSION__/);
  assert.match(adminScript, /<td data-label="접수">/);
  assert.match(adminScript, /<td data-label="관심 이유">/);
  assert.match(adminScript, /<td data-label="일시">/);
  assert.match(adminScript, /<td data-label="구매자">/);
  assert.match(adminScript, /<td data-label="수단">/);
  assert.match(adminScript, /<td data-label="결제 기록">/);
  assert.match(adminScript, /<td data-label="관리">/);
  assert.match(adminStyles, /\.table-section thead\s*\{\s*display: none;/);
  assert.match(adminStyles, /\.table-section tbody\s*\{\s*display: grid;/);
  assert.match(adminStyles, /\.table-section td::before\s*\{\s*content: attr\(data-label\);/);
  assert.match(adminStyles, /\.row-actions\s*\{\s*width: 100%;/);
  assert.doesNotMatch(adminStyles, /position: sticky;\s*right: 0;/);
});
