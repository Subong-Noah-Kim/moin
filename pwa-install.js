// Pure helpers for the "add to home screen" recommendation. The runtime
// affordance differs by platform: Android/desktop Chromium fire
// `beforeinstallprompt` and can trigger the native dialog, while iOS has no
// such API — there a button can only guide the user through the Safari share
// sheet. iOS in-app browsers (Chrome/KakaoTalk/etc.) cannot add to the home
// screen at all, so they are steered to open the page in Safari.

export function detectInstallEnv(env = globalThis) {
  const nav = env.navigator || {};
  const ua = String(nav.userAgent || '');

  const standalone = Boolean(
    env.matchMedia?.('(display-mode: standalone)')?.matches || nav.standalone,
  );

  // iPadOS 13+ reports a desktop "Macintosh" UA but exposes touch points.
  const isIOS = /iphone|ipad|ipod/i.test(ua)
    || (/Macintosh/.test(ua) && Number(nav.maxTouchPoints || 0) > 1);

  const isInAppBrowser = /crios|fxios|edgios|naver|kakaotalk|fban|fbav|instagram|line|whale|daum/i.test(ua);
  const isIOSSafari = isIOS && /safari/i.test(ua) && !isInAppBrowser;

  return { standalone, isIOS, isIOSSafari };
}

export function getInstallPromptMode({
  standalone = false,
  isIOS = false,
  isIOSSafari = false,
  dismissed = false,
  hasDeferredPrompt = false,
} = {}) {
  if (standalone) return 'installed';
  if (dismissed) return 'dismissed';
  if (hasDeferredPrompt) return 'native';
  if (isIOS) return isIOSSafari ? 'ios-guide' : 'ios-browser';
  return 'hidden';
}
