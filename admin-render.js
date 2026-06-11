import {
  getApplicationStatusOptions,
  getOrderStatusOptions,
  getPaymentStatusLabel,
} from './admin-status.js?v=__ASSET_VERSION__';

const moneyFormatter = new Intl.NumberFormat('ko-KR');
const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatDate(value) {
  if (!value) return '-';
  return dateFormatter.format(new Date(value));
}

export function formatMoney(value) {
  return `${moneyFormatter.format(Number(value || 0))}원`;
}

export function getTypeLabel(type) {
  if (type === 'event') return '원데이';
  if (type === 'social') return '친목';
  return '정기 모임';
}

export function renderApplicationStatusOptions(currentStatus) {
  return getApplicationStatusOptions(currentStatus)
    .map(
      (option) => `
        <option value="${escapeHtml(option.value)}" ${option.selected ? 'selected' : ''}>
          ${escapeHtml(option.label)}
        </option>
      `,
    )
    .join('');
}

export function renderOrderStatusOptions(currentStatus) {
  return getOrderStatusOptions(currentStatus)
    .map(
      (option) => `
        <option value="${escapeHtml(option.value)}" ${option.selected ? 'selected' : ''}>
          ${escapeHtml(option.label)}
        </option>
      `,
    )
    .join('');
}

export function formatPaymentKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export function renderPaymentRecord(order, payment) {
  if (payment) {
    const paidAt = formatDate(payment.paid_at || payment.created_at);
    const key = formatPaymentKey(payment.provider_payment_key);

    return `
      <span class="pill is-paid">${escapeHtml(getPaymentStatusLabel(payment.status))}</span><br />
      <span class="muted">${escapeHtml([paidAt, key].filter(Boolean).join(' · '))}</span>
    `;
  }

  if (order.status === 'paid') {
    return `
      <span class="pill is-failed">기록 없음</span><br />
      <span class="muted">확인 필요</span>
    `;
  }

  if (order.status === 'pending' && order.provider === 'tosspayments') {
    return '<span class="pill is-pending">승인 대기</span>';
  }

  if (order.status === 'demo_paid' || order.provider === 'demo') {
    return '<span class="muted">데모 주문</span>';
  }

  return '<span class="muted">-</span>';
}

export function formatAgenticUpdated(value) {
  if (!value) return '업데이트 정보 없음';

  try {
    return `업데이트 ${dateFormatter.format(new Date(value))}`;
  } catch {
    return `업데이트 ${value}`;
  }
}

export const paidOrderStatuses = ['paid', 'demo_paid'];

export function hasPaidLinkedOrder(application) {
  return Array.isArray(application.orders)
    && application.orders.some((order) => paidOrderStatuses.includes(order?.status));
}
