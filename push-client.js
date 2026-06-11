export function isPushSupported(env = globalThis) {
  return Boolean(env.navigator?.serviceWorker && env.Notification && env.PushManager);
}

export function getPushOptInState({ supported, hasToken, permission, subscribed }) {
  if (!hasToken) {
    return { mode: 'hidden' };
  }

  if (!supported) {
    return {
      mode: 'install-hint',
      message: '홈 화면에 추가한 moin 앱에서 열면 승인 알림을 받을 수 있어요.',
    };
  }

  if (permission === 'denied') {
    return {
      mode: 'blocked',
      message: '알림이 차단되어 있어요. 기기 설정에서 moin 알림을 허용해주세요.',
    };
  }

  if (subscribed) {
    return { mode: 'done', message: '승인되면 알림으로 알려드릴게요.' };
  }

  return { mode: 'button', label: '승인되면 알림 받기' };
}

export function applicationServerKeyToUint8Array(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);

  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function createPushRegistrationPayload({ meetupId, applicationToken, subscription }) {
  const json = typeof subscription?.toJSON === 'function' ? subscription.toJSON() : subscription || {};
  const keys = json.keys || {};

  if (!meetupId || !applicationToken || !json.endpoint || !keys.p256dh || !keys.auth) {
    return null;
  }

  return {
    meetupId,
    applicationToken,
    endpoint: json.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  };
}
