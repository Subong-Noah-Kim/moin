import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function readProjectFile(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function envFor(ua, { standalone = false, maxTouchPoints = 0, navStandalone = undefined } = {}) {
  return {
    navigator: { userAgent: ua, maxTouchPoints, ...(navStandalone === undefined ? {} : { standalone: navStandalone }) },
    matchMedia: (query) => ({ matches: standalone && query.includes('standalone') }),
  };
}

const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const IOS_KAKAO = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.5.0';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

test('detectInstallEnv distinguishes standalone, iOS, and iOS Safari', async () => {
  const { detectInstallEnv } = await import('../pwa-install.js');

  assert.deepEqual(detectInstallEnv(envFor(IOS_SAFARI)), { standalone: false, isIOS: true, isIOSSafari: true });
  assert.equal(detectInstallEnv(envFor(IOS_CHROME)).isIOSSafari, false, 'CriOS is an in-app browser, not Safari');
  assert.equal(detectInstallEnv(envFor(IOS_KAKAO)).isIOSSafari, false, 'KakaoTalk webview cannot add to home screen');
  assert.equal(detectInstallEnv(envFor(ANDROID_CHROME)).isIOS, false);

  // installed PWA reports standalone via matchMedia or navigator.standalone
  assert.equal(detectInstallEnv(envFor(IOS_SAFARI, { standalone: true })).standalone, true);
  assert.equal(detectInstallEnv(envFor(IOS_SAFARI, { navStandalone: true })).standalone, true);

  // iPadOS reports as Macintosh with touch points
  const ipad = envFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', { maxTouchPoints: 5 });
  assert.equal(detectInstallEnv(ipad).isIOS, true);
});

test('getInstallPromptMode picks the right affordance per platform/state', async () => {
  const { getInstallPromptMode } = await import('../pwa-install.js');

  assert.equal(getInstallPromptMode({ standalone: true }), 'installed');
  assert.equal(getInstallPromptMode({ dismissed: true }), 'dismissed');
  assert.equal(getInstallPromptMode({ hasDeferredPrompt: true }), 'native');
  assert.equal(getInstallPromptMode({ isIOS: true, isIOSSafari: true }), 'ios-guide');
  assert.equal(getInstallPromptMode({ isIOS: true, isIOSSafari: false }), 'ios-browser');
  assert.equal(getInstallPromptMode({}), 'hidden', 'desktop without a native prompt shows nothing');
  // already-installed beats everything
  assert.equal(getInstallPromptMode({ standalone: true, hasDeferredPrompt: true, isIOS: true }), 'installed');
});

test('index.html includes a dismissible install banner and an iOS guide', async () => {
  const html = await readProjectFile('index.html');

  assert.match(html, /data-install-banner/);
  assert.match(html, /data-install-action/);
  assert.match(html, /data-install-dismiss/);
  assert.match(html, /data-install-guide/);
  assert.match(html, /공유/, 'the iOS guide explains the share-sheet step');
  assert.match(html, /홈 화면에 추가/);
});

test('main.js wires the install prompt, dismissal, and push opt-in install action', async () => {
  const main = await readProjectFile('main.js');

  assert.match(main, /from '\.\/pwa-install\.js\?v=__ASSET_VERSION__'/);
  assert.match(main, /addEventListener\('beforeinstallprompt'/);
  assert.match(main, /addEventListener\('appinstalled'/);
  assert.match(main, /deferredInstallPrompt/);
  assert.match(main, /momentclub:install-dismissed/, 'dismissal must persist so the banner stays closed');
  assert.match(main, /data-install-action/);
  // the push opt-in install hint becomes an actionable button
  assert.match(main, /install-hint[\s\S]{0,400}data-install-action/);
});

test('install banner and guide are styled', async () => {
  const styles = await readProjectFile('styles.css');
  assert.match(styles, /\.install-banner/);
  assert.match(styles, /\.install-guide/);
});

test('pages deploy ships the pwa-install module', async () => {
  const workflow = await readProjectFile('.github/workflows/deploy-pages.yml');
  assert.match(workflow, /cp pwa-install\.js dist\//);
});
