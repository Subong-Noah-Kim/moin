import { TOSS_CLIENT_KEY } from './toss-config.js?v=__ASSET_VERSION__';

const tossCustomerKeyStorage = 'momentclub:toss-customer-key';
const tossSdkUrl = 'https://js.tosspayments.com/v2/standard';
let tossSdkScriptPromise;
let tossPaymentPromise;

function getTossClientKey() {
  return String(TOSS_CLIENT_KEY || '').trim();
}

export function isTossConfigured() {
  return getTossClientKey().startsWith('test_');
}

export function createSafeRandomId(prefix) {
  const randomPart = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replaceAll('-', '')
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`.slice(0, 64);
}

function getTossCustomerKey() {
  const stored = localStorage.getItem(tossCustomerKeyStorage);
  if (stored) return stored;

  const customerKey = createSafeRandomId('mc_customer').slice(0, 50);
  localStorage.setItem(tossCustomerKeyStorage, customerKey);
  return customerKey;
}

export function getPaymentResultUrl(result) {
  const url = new URL('./payment-result.html', window.location.href);
  url.searchParams.set('result', result);
  return url.toString();
}

export function getPaymentFailUrl(checkoutToken) {
  const url = new URL(getPaymentResultUrl('fail'));
  url.searchParams.set('checkoutToken', checkoutToken);
  return url.toString();
}

export function getTossMethod(paymentMethod) {
  if (paymentMethod === '계좌이체') {
    return {
      method: 'TRANSFER',
    };
  }

  return {
    method: 'CARD',
    card: {
      flowMode: 'DEFAULT',
    },
  };
}

export function getPaymentErrorCode(error) {
  return String(error?.code || error?.name || 'PAYMENT_WINDOW_ERROR');
}

export function ensureTossSdkScript() {
  if (window.TossPayments) {
    return Promise.resolve();
  }

  if (tossSdkScriptPromise) {
    return tossSdkScriptPromise;
  }

  let script = document.querySelector(`script[src="${tossSdkUrl}"]`);

  if (!script) {
    script = document.createElement('script');
    script.src = tossSdkUrl;
    script.async = true;
    document.head.append(script);
  }

  tossSdkScriptPromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('토스페이먼츠 SDK를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'));
    }, 12000);

    function cleanup() {
      clearTimeout(timeoutId);
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    }

    function handleLoad() {
      cleanup();
      resolve();
    }

    function handleError() {
      cleanup();
      reject(new Error('토스페이먼츠 SDK 로드에 실패했습니다.'));
    }

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
  })
    .then(() => {
      if (!window.TossPayments) {
        throw new Error('토스페이먼츠 SDK가 준비되지 않았습니다.');
      }
    })
    .catch((error) => {
      tossSdkScriptPromise = null;
      throw error;
    });

  return tossSdkScriptPromise;
}

export async function getTossPayment() {
  if (!isTossConfigured()) {
    throw new Error('토스 테스트 클라이언트 키가 설정되지 않았습니다.');
  }

  await ensureTossSdkScript();

  if (!tossPaymentPromise) {
    const tossPayments = window.TossPayments(getTossClientKey());
    tossPaymentPromise = tossPayments.payment({ customerKey: getTossCustomerKey() });
  }

  return tossPaymentPromise;
}
