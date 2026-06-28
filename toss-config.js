export const TOSS_CLIENT_KEY = 'test_ck_jExPeJWYVQ40GNd76jLQ349R5gvN';

// Classify a Toss client key into the checkout mode it should drive.
// `live_` keys must be recognized so the real payment window opens; the old
// `startsWith('test_')` check silently routed live keys to the demo path.
export function getTossKeyMode(clientKey) {
  const key = String(clientKey || '').trim();

  if (key.startsWith('live_')) {
    return 'live';
  }

  if (key.startsWith('test_')) {
    return 'test';
  }

  return 'demo';
}

export function isTossClientKeyConfigured(clientKey) {
  return getTossKeyMode(clientKey) !== 'demo';
}

export function isTossLiveKey(clientKey) {
  return getTossKeyMode(clientKey) === 'live';
}
