import {
  confirmTossPayment,
  recordTossPaymentFailure,
} from './supabase-client.js?v=__ASSET_VERSION__';

const params = new URLSearchParams(window.location.search);
const result = params.get('result');
const successView = document.querySelector('[data-success-view]');
const failView = document.querySelector('[data-fail-view]');
const successTitle = document.querySelector('[data-success-title]');
const successDescription = document.querySelector('[data-success-description]');
const confirmStatus = document.querySelector('[data-confirm-status]');
const failSyncStatus = document.querySelector('[data-fail-sync-status]');
const moneyFormatter = new Intl.NumberFormat('ko-KR');
const publicStateMaxItems = 100;
const publicStateMaxValueLength = 120;

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value || '-';
  }
}

function formatAmount(value) {
  const amount = Number(value || 0);
  if (!amount) return '-';
  return `${moneyFormatter.format(amount)}원`;
}

function setConfirmStatus(message, type = 'pending') {
  if (!confirmStatus) return;
  confirmStatus.textContent = message;
  confirmStatus.dataset.status = type;
}

function setFailSyncStatus(message, type = 'pending') {
  if (!failSyncStatus) return;
  failSyncStatus.textContent = message;
  failSyncStatus.dataset.status = type;
}

function readStringSet(key) {
  try {
    const rawValue = localStorage.getItem(key);

    if (!rawValue) {
      return new Set();
    }

    const values = JSON.parse(rawValue);

    if (!Array.isArray(values)) {
      localStorage.removeItem(key);
      return new Set();
    }

    return new Set(
      values
        .map((value) => String(value).trim())
        .filter((value) => value && value.length <= publicStateMaxValueLength)
        .slice(0, publicStateMaxItems),
    );
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures so the result page can keep rendering.
    }

    return new Set();
  }
}

function persistStringSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // Paid-state persistence is best-effort and should not block confirmation.
  }
}

function markMeetupPaid(meetupId) {
  if (!meetupId) return;

  const paid = readStringSet('momentclub:paid');
  paid.add(meetupId);
  persistStringSet('momentclub:paid', paid);
}

function getConfirmErrorMessage(error) {
  const message = error?.message || String(error);

  if (message.includes('network request failed') || message.includes('Load failed')) {
    return 'Supabase Edge Function(confirm-toss-payment) 호출에 실패했습니다. 함수 배포와 CORS 응답을 확인해주세요.';
  }

  if (message.includes('Requested function was not found')) {
    return 'Supabase Edge Function(confirm-toss-payment)을 찾지 못했습니다. 함수 배포 상태를 확인해주세요.';
  }

  if (message.includes('TOSS_SECRET_KEY')) {
    return '결제 승인 서버 설정을 확인해주세요.';
  }

  return '결제 승인 처리에 실패했습니다. 잠시 후 다시 시도하거나 운영자에게 문의해주세요.';
}

function getFailureStatusLabel(status) {
  if (status === 'cancelled') return '취소';
  if (status === 'failed') return '실패';
  return status || '실패';
}

async function handleSuccessResult() {
  const paymentKey = params.get('paymentKey') || '';
  const orderId = params.get('orderId') || '';
  const amount = params.get('amount') || '';

  sessionStorage.setItem(
    'momentclub:toss-last-auth',
    JSON.stringify({
      paymentKey,
      orderId,
      amount,
      receivedAt: new Date().toISOString(),
    }),
  );

  setText('[data-order-id]', orderId);
  setText('[data-payment-key]', paymentKey);
  setText('[data-amount]', formatAmount(amount));
  successView.hidden = false;

  if (!paymentKey || !orderId || !amount) {
    setConfirmStatus('토스 결제 승인에 필요한 값이 부족합니다.', 'fail');
    return;
  }

  setConfirmStatus('토스 결제 승인을 처리하고 있습니다.', 'pending');

  try {
    const resultBody = await confirmTossPayment({ paymentKey, orderId, amount });
    const meetupId = resultBody?.order?.meetup_id;

    markMeetupPaid(meetupId);
    if (successTitle) successTitle.textContent = '테스트 결제 승인이 완료됐어요';
    if (successDescription) successDescription.textContent =
      '토스페이먼츠 테스트 결제 승인과 주문/결제 기록 업데이트가 완료됐습니다.';
    setConfirmStatus('테스트 주문 상태가 결제완료로 변경되었습니다.', 'success');
  } catch (error) {
    console.error(error);
    if (successTitle) successTitle.textContent = '승인 처리가 필요해요';
    if (successDescription) successDescription.textContent =
      '토스 결제 인증은 도착했지만 서버 승인 처리에서 문제가 생겼습니다.';
    setConfirmStatus(getConfirmErrorMessage(error), 'fail');
  }
}

if (result === 'success') {
  await handleSuccessResult();
} else {
  const code = params.get('code') || '';
  const message = params.get('message') || '';
  const orderId = params.get('orderId') || '';
  const checkoutToken = params.get('checkoutToken') || '';

  setText('[data-error-code]', code);
  setText('[data-fail-order-id]', orderId);
  setText('[data-fail-message]', message || '결제창에서 결제가 취소되었거나 테스트 인증에 실패했습니다.');
  failView.hidden = false;

  if (!orderId || !checkoutToken) {
    setFailSyncStatus('주문번호 또는 확인 토큰이 없어 주문 상태를 정리하지 못했습니다.', 'fail');
  } else {
    setFailSyncStatus('주문 상태를 정리하고 있습니다.', 'pending');

    try {
      const resultBody = await recordTossPaymentFailure({ orderId, checkoutToken, code, message });
      const status = resultBody?.order?.status || resultBody?.failure?.status;
      const statusLabel = getFailureStatusLabel(status);

      setFailSyncStatus(`주문 상태가 ${statusLabel}로 정리되었습니다.`, status === 'cancelled' ? 'cancelled' : 'fail');
    } catch (error) {
      console.error(error);
      setFailSyncStatus(getConfirmErrorMessage(error), 'fail');
    }
  }
}
