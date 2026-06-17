import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const smokeTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const diagnostics = [];

function findChrome() {
  const chrome = chromeCandidates.find((candidate) => existsSync(candidate));
  if (!chrome) {
    throw new Error('Chrome executable not found. Set CHROME_BIN to run browser smoke tests.');
  }
  return chrome;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFetch(url, { timeoutMs = smokeTimeoutMs } = {}) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await wait(200);
  }

  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function startServer(port) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[server] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[server] ${chunk}`);
  });

  return child;
}

function startChrome(chromePath, debuggingPort, userDataDir) {
  return spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debuggingPort}`,
    'about:blank',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
      this.ws.addEventListener('message', (event) => this.handleMessage(event.data));
    });
  }

  handleMessage(data) {
    const message = JSON.parse(data);

    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);

      if (message.error) {
        reject(new Error(`${message.error.message}: ${message.error.data || ''}`.trim()));
      } else {
        resolve(message.result || {});
      }

      return;
    }

    this.listeners.forEach((listener) => listener(message));
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    this.ws.send(JSON.stringify(payload));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  onMessage(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  waitForEvent(sessionId, method, { timeoutMs = smokeTimeoutMs, predicate = () => true } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      const off = this.onMessage((message) => {
        if (message.sessionId !== sessionId || message.method !== method) return;
        if (!predicate(message.params || {})) return;
        clearTimeout(timer);
        off();
        resolve(message.params || {});
      });
    });
  }

  close() {
    this.ws?.close();
  }
}

function formatRemoteValue(remoteObject) {
  if (!remoteObject) return '';
  if (remoteObject.value !== undefined) return String(remoteObject.value);
  if (remoteObject.description) return remoteObject.description;
  return remoteObject.type || '';
}

function attachDiagnostics(connection, sessionId, baseUrl, label) {
  const isIgnoredLocalResource = (url) => {
    try {
      return new URL(url).pathname === '/favicon.ico';
    } catch {
      return false;
    }
  };

  return connection.onMessage((message) => {
    if (message.sessionId !== sessionId) return;

    if (message.method === 'Runtime.exceptionThrown') {
      diagnostics.push(`${label}: runtime exception: ${message.params.exceptionDetails?.text || 'unknown error'}`);
    }

    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const text = (message.params.args || []).map(formatRemoteValue).join(' ');
      diagnostics.push(`${label}: console.error: ${text || 'unknown error'}`);
    }

    if (message.method === 'Network.responseReceived') {
      const { response } = message.params;
      if (response?.url?.startsWith(baseUrl) && response.status >= 400 && !isIgnoredLocalResource(response.url)) {
        diagnostics.push(`${label}: local resource ${response.status}: ${response.url}`);
      }
    }

    if (message.method === 'Network.loadingFailed') {
      const url = message.params?.request?.url || '';
      if (url.startsWith(baseUrl) && !isIgnoredLocalResource(url)) {
        diagnostics.push(`${label}: local resource failed: ${url}`);
      }
    }
  });
}

async function createPage(connection, url, label, baseUrl, preloadScript) {
  const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
  const detachDiagnostics = attachDiagnostics(connection, sessionId, baseUrl, label);

  await connection.send('Page.enable', {}, sessionId);
  await connection.send('Runtime.enable', {}, sessionId);
  await connection.send('Log.enable', {}, sessionId);
  await connection.send('Network.enable', {}, sessionId);

  if (preloadScript) {
    await connection.send('Page.addScriptToEvaluateOnNewDocument', { source: preloadScript }, sessionId);
  }

  const load = connection.waitForEvent(sessionId, 'Page.loadEventFired');
  await connection.send('Page.navigate', { url }, sessionId);
  await load;

  return {
    sessionId,
    targetId,
    close: async () => {
      detachDiagnostics();
      await connection.send('Target.closeTarget', { targetId });
    },
  };
}

async function evaluate(connection, sessionId, expression) {
  const result = await connection.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId);

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  }

  return result.result?.value;
}

async function waitForExpression(connection, sessionId, expression, label, { timeoutMs = smokeTimeoutMs } = {}) {
  const startedAt = Date.now();
  let lastValue;

  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await evaluate(connection, sessionId, expression);
    if (lastValue) return lastValue;
    await wait(200);
  }

  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
}

async function smokePublicPage(connection, baseUrl) {
  const page = await createPage(connection, `${baseUrl}/`, 'public page', baseUrl);

  const waitForMeetupCards = () => waitForExpression(
    connection,
    page.sessionId,
    `document.querySelectorAll('[data-meetup-grid] .meetup-card').length > 0`,
    'public meetup cards',
  );

  const waitForSupabaseSource = (timeoutMs) => waitForExpression(
    connection,
    page.sessionId,
    `document.documentElement.dataset.meetupSource === 'supabase'`,
    'public Supabase meetup source',
    { timeoutMs },
  );

  try {
    await waitForMeetupCards();

    let loadedSupabase = false;
    try {
      await waitForSupabaseSource(8000);
      loadedSupabase = true;
    } catch {
      // Fallback rendering still catches static browser regressions when live data is slow.
    }

    // Checkout is gated behind a stored application token. Seed one for the first
    // meetup, then reload: main.js reads the token map once at module load.
    const tokenMeetupId = await evaluate(connection, page.sessionId, `(() => {
      const button = document.querySelector('[data-detail]');
      const id = button?.dataset.detail;
      if (!id) return '';
      localStorage.setItem('momentclub:application-tokens', JSON.stringify({ [id]: 'f'.repeat(64) }));
      return id;
    })()`);

    if (!tokenMeetupId) {
      throw new Error('Could not find a meetup card to seed an application token for.');
    }

    const reloaded = connection.waitForEvent(page.sessionId, 'Page.loadEventFired');
    await connection.send('Page.reload', {}, page.sessionId);
    await reloaded;

    await waitForMeetupCards();
    if (loadedSupabase) {
      // Wait for the same data source so the seeded meetup id still exists.
      await waitForSupabaseSource(smokeTimeoutMs);
    }

    const idLiteral = JSON.stringify(tokenMeetupId);
    await waitForExpression(
      connection,
      page.sessionId,
      `document.querySelector('[data-detail="' + CSS.escape(${idLiteral}) + '"]') !== null`,
      'seeded meetup card after reload',
    );

    const summary = await evaluate(connection, page.sessionId, `(() => {
      const seededDetail = document.querySelector('[data-detail="' + CSS.escape(${idLiteral}) + '"]');
      seededDetail?.click();
      return {
        title: document.title,
        cardCount: document.querySelectorAll('[data-meetup-grid] .meetup-card').length,
        dataSource: document.documentElement.dataset.meetupSource || '',
        hasWaitlist: document.querySelectorAll('[data-waitlist-rail] .rail-card').length > 0,
        hasEvents: document.querySelectorAll('[data-event-list] .event-row').length > 0,
      };
    })()`);

    await waitForExpression(
      connection,
      page.sessionId,
      `document.querySelector('[data-drawer][aria-hidden="false"]') && document.querySelector('.drawer-pay-button')`,
      'public detail drawer',
    );

    const checkout = await evaluate(connection, page.sessionId, `(() => {
      const button = document.querySelector('.drawer-pay-button');
      if (!button || button.disabled) {
        return { opened: false, skipped: true, text: button?.textContent?.trim() || '' };
      }
      button.click();
      return { opened: true, skipped: false, text: button.textContent.trim() };
    })()`);

    if (checkout.opened) {
      await waitForExpression(
        connection,
        page.sessionId,
        `document.querySelector('[data-checkout-modal][aria-hidden="false"]') && document.querySelector('[data-checkout-form]')`,
        'checkout modal',
      );
    }

    console.log(`✓ public page rendered ${summary.cardCount} cards (${summary.dataSource || 'unknown source'})`);
    if (!loadedSupabase) {
      console.log('- Supabase data source was not ready before the smoke timeout; checked fallback UI only');
    }
    console.log('✓ public detail drawer opened');
    console.log(checkout.skipped
      ? `- checkout modal skipped because button is disabled (${checkout.text})`
      : '✓ checkout modal opened');
  } finally {
    await page.close();
  }
}

async function smokeAdminPage(connection, baseUrl) {
  const page = await createPage(connection, `${baseUrl}/admin.html`, 'admin page', baseUrl);

  try {
    const summary = await waitForExpression(
      connection,
      page.sessionId,
      `(() => {
        const login = document.querySelector('[data-login-view]');
        return login && !login.hidden && document.querySelector('[data-login-form]') && document.querySelector('[data-login-title]')?.textContent?.trim();
      })()`,
      'admin login view',
    );

    console.log(`✓ admin login rendered (${summary})`);
  } finally {
    await page.close();
  }
}

// Verifies the authenticated admin dashboard renders WITHOUT real credentials:
// a fake session is seeded into sessionStorage and every Supabase REST/RPC call
// is answered with fixtures. No admin password ever touches CI (the repo is
// public), and no live data is read or written.
const ADMIN_DASHBOARD_PRELOAD = `(() => {
  try {
    sessionStorage.setItem('momentclub:admin-session', JSON.stringify({
      accessToken: 'smoke-mock-token',
      expiresAt: Date.now() + 3600000,
      user: { email: 'smoke@moin.test' },
    }));
  } catch (error) { /* storage unavailable */ }

  const meetup = { id: 'm-smoke', type: 'social', category: '문화', title: '스모크 점검 모임', description: 'CI 점검용', host_name: '운영', host_role: '호스트', status_label: null, date_label: '6월 20일', time_label: '19:00', location: '성수', price_amount: 10000, price_label: '10,000원', tags: ['점검'], image_url: '', schedule: [], capacity: null, registration_status: 'open', closed_at: null, close_reason: null, is_published: true, created_at: '2026-06-15T10:00:00+09:00' };
  const availability = { meetup_id: 'm-smoke', capacity: null, remaining_spots: null, registration_status: 'open', effective_registration_status: 'open', active_order_count: 1, paid_order_count: 1, manual_guest_count: 0, closed_at: null, close_reason: null };
  const application = { id: 'a-smoke', meetup_id: 'm-smoke', applicant_name: '스모크 신청자', interest: '점검', status: 'submitted', source: 'edge-function', created_at: '2026-06-15T10:00:00+09:00', orders: [{ status: 'paid' }] };
  const order = { id: 'o-smoke', meetup_id: 'm-smoke', buyer_name: '스모크 구매자', amount: 10000, currency: 'KRW', status: 'paid', provider: 'tosspayments', payment_method: '카드', source: 'web', created_at: '2026-06-15T10:00:00+09:00', refund_requested_at: '2026-06-15T11:00:00+09:00', refund_request_reason: '점검용 환불 요청', applications: { applicant_name: '스모크 신청자' } };
  const payment = { id: 'p-smoke', order_id: 'o-smoke', meetup_id: 'm-smoke', amount: 10000, currency: 'KRW', status: 'paid', provider: 'tosspayments', payment_method: '카드', provider_payment_key: 'smoke_key_1234567890', paid_at: '2026-06-15T11:00:00+09:00', created_at: '2026-06-15T11:00:00+09:00' };

  function fixtureFor(url) {
    if (url.includes('/rest/v1/rpc/list_admin_meetup_availability')) return [availability];
    if (url.includes('/rest/v1/meetups')) return [meetup];
    if (url.includes('/rest/v1/applications')) return [application];
    if (url.includes('/rest/v1/orders')) return [order];
    if (url.includes('/rest/v1/payments')) return [payment];
    return [];
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes('.supabase.co/rest/v1/')) {
      return Promise.resolve(new Response(JSON.stringify(fixtureFor(url)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    return realFetch(input, init);
  };
})();`;

async function smokeAdminDashboard(connection, baseUrl) {
  const page = await createPage(connection, `${baseUrl}/admin.html`, 'admin dashboard', baseUrl, ADMIN_DASHBOARD_PRELOAD);

  try {
    await waitForExpression(
      connection,
      page.sessionId,
      `(() => {
        const dashboard = document.querySelector('[data-dashboard-view]');
        return dashboard && !dashboard.hidden
          && document.querySelectorAll('[data-orders-body] tr').length > 0
          && document.querySelectorAll('[data-applications-body] tr').length > 0
          && document.querySelectorAll('[data-meetups-body] tr').length > 0;
      })()`,
      'authenticated admin dashboard tables',
    );

    const summary = await evaluate(connection, page.sessionId, `(() => ({
      orders: document.querySelectorAll('[data-orders-body] tr').length,
      applicants: document.body.textContent.includes('스모크 신청자'),
      refundAlert: !document.querySelector('[data-refund-alert]').hidden,
      refundCount: document.querySelector('[data-refund-alert-count]')?.textContent,
      loginHidden: document.querySelector('[data-login-view]').hidden,
    }))()`);

    if (!summary.loginHidden) throw new Error('login view still showing after mock session');
    if (!summary.applicants) throw new Error('applicant row did not render in the dashboard');
    if (!summary.refundAlert || summary.refundCount !== '1') {
      throw new Error(`refund-request alert did not surface (alert=${summary.refundAlert}, count=${summary.refundCount})`);
    }

    console.log(`✓ admin dashboard rendered (${summary.orders} order row, refund alert ${summary.refundCount})`);

    // The meetup editor opens as a right-side drawer overlay; the list stays in place.
    await evaluate(connection, page.sessionId, `document.querySelector('[data-tab-button="meetups"]').click()`);
    await evaluate(connection, page.sessionId, `document.querySelector('[data-edit-meetup]').click()`);
    await waitForExpression(
      connection,
      page.sessionId,
      `(() => {
        const drawer = document.querySelector('[data-meetup-drawer]');
        return drawer && drawer.getAttribute('aria-hidden') === 'false'
          && !drawer.hasAttribute('inert')
          && document.querySelectorAll('[data-meetups-body] tr').length > 0;
      })()`,
      'meetup edit drawer opens while the list stays',
    );
    await evaluate(connection, page.sessionId, `document.querySelector('[data-meetup-drawer-close]').click()`);
    const drawerClosed = await evaluate(
      connection,
      page.sessionId,
      `document.querySelector('[data-meetup-drawer]').getAttribute('aria-hidden') === 'true'`,
    );
    if (!drawerClosed) throw new Error('meetup edit drawer did not close');
    console.log('✓ meetup editor drawer opens and closes (list stays in place)');
  } finally {
    await page.close();
  }
}

async function smokePaymentResultPage(connection, baseUrl) {
  const page = await createPage(connection, `${baseUrl}/payment-result.html`, 'payment result page', baseUrl);

  try {
    const summary = await waitForExpression(
      connection,
      page.sessionId,
      `(() => {
        const fail = document.querySelector('[data-fail-view]');
        return fail && !fail.hidden && document.querySelector('[data-fail-sync-status]')?.textContent?.trim();
      })()`,
      'payment result fallback view',
    );

    console.log(`✓ payment result fallback rendered (${summary})`);
  } finally {
    await page.close();
  }
}

async function main() {
  const chrome = findChrome();
  const appPort = await getFreePort();
  const debuggingPort = await getFreePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const userDataDir = mkdtempSync(join(tmpdir(), 'moin-chrome-'));
  const server = startServer(appPort);
  const browser = startChrome(chrome, debuggingPort, userDataDir);
  let connection;

  try {
    await waitForFetch(`${baseUrl}/`);
    const version = await waitForFetch(`http://127.0.0.1:${debuggingPort}/json/version`).then((response) => response.json());
    connection = new CdpConnection(version.webSocketDebuggerUrl);
    await connection.connect();

    await smokePublicPage(connection, baseUrl);
    await smokeAdminPage(connection, baseUrl);
    await smokeAdminDashboard(connection, baseUrl);
    await smokePaymentResultPage(connection, baseUrl);

    if (diagnostics.length) {
      throw new Error(`Browser smoke diagnostics failed:\n${diagnostics.map((item) => `- ${item}`).join('\n')}`);
    }

    console.log('✓ browser smoke checks passed');
  } finally {
    connection?.close();
    browser.kill('SIGTERM');
    server.kill('SIGTERM');
    await wait(500);
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch (error) {
      console.warn(`Could not remove temporary Chrome profile ${userDataDir}: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
