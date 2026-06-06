import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getAmountFromMeetup } from '../supabase-client.js';

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
  assert.match(adminScript, /AGENTIC_STATUS\.json\?v=__ASSET_VERSION__/);
  assert.match(adminScript, /function renderAgenticStatus/);
  assert.match(adminScript, /function loadAgenticStatus/);
  assert.match(adminScript, /function renderTaskDetails/);
  assert.match(adminScript, /상세 보기/);
  assert.match(adminScript, /무슨 작업인가요\?/);
  assert.match(adminScript, /왜 필요한가요\?/);
  assert.match(adminScript, /간단한 개발 방향/);
  assert.match(adminScript, /if \(getActiveTab\(\) === 'agentic'\)/);
  assert.match(adminScript, /if \(target === 'agentic'\)/);
  assert.doesNotMatch(adminScript, /showDashboard\(\);\s+void loadAgenticStatus\(\);/);
  assert.match(adminScript, /agenticRefreshButton\.addEventListener\('click', loadAgenticStatus\)/);
  assert.match(status.branch, /^(main|codex\/[a-z0-9-]+)$/);
  assert.equal(status.summary.deployNeeded, 0);
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
  assert.match(monitorHtml, /data-monitor-root/);
  assert.match(monitorHtml, /data-agent-list/);
  assert.match(monitorHtml, /data-event-list/);
  assert.match(monitorHtml, /agent-monitor\.js/);
  assert.match(monitorStyles, /\.monitor-layout/);
  assert.match(monitorScript, /AGENTIC_LIVE_STATUS\.json/);
  assert.match(monitorScript, /document\.visibilityState !== 'visible'/);
  assert.match(monitorScript, /window\.setTimeout\(loadLiveStatus, state\.pollIntervalMs\)/);
  assert.doesNotMatch(workflow, /cp agent-monitor\./);
  assert.doesNotMatch(workflow, /cp AGENTIC_LIVE_STATUS\.json/);
  assert.equal(status.monitor.mode, 'local');
  assert.ok(status.monitor.pollIntervalMs >= 5000);
  assert.ok(Array.isArray(status.agents));
  assert.ok(Array.isArray(status.events));
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
