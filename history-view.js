import { escapeHtml } from './escape-html.js?v=__ASSET_VERSION__';

const applicationStatusLabels = {
  submitted: '검토 중',
  reviewing: '검토 중',
  accepted: '승인',
  rejected: '미선정',
  cancelled: '취소됨',
};

const orderStatusLabels = {
  pending: '결제 대기',
  paid: '결제 완료',
  demo_paid: '데모 결제',
  cancelled: '결제 취소',
  failed: '결제 실패',
  refunded: '환불됨',
};

const moneyFormatter = new Intl.NumberFormat('ko-KR');
const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function getHistoryStatusText(status) {
  return applicationStatusLabels[status] || status || '-';
}

export function getHistoryOrderStatusText(status) {
  return orderStatusLabels[status] || status || '-';
}

function formatHistoryDate(value) {
  if (!value) return '-';

  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return String(value);
  }
}

const refundableOrderStatuses = ['paid', 'demo_paid'];

function buildRefundControl(order) {
  if (!refundableOrderStatuses.includes(order.status)) {
    return '';
  }

  if (order.refund_requested_at) {
    return '<span class="history-refund-requested">환불 요청됨</span>';
  }

  if (!order.id) {
    return '';
  }

  return `<button type="button" class="history-refund-button" data-refund-request="${escapeHtml(order.id)}">환불 요청</button>`;
}

function buildOrderLines(orders) {
  if (!Array.isArray(orders) || !orders.length) {
    return '';
  }

  return `
    <ul class="history-orders">
      ${orders
        .map(
          (order) => `
            <li>
              <span class="history-order-status is-${escapeHtml(order.status)}">${escapeHtml(getHistoryOrderStatusText(order.status))}</span>
              <span>${escapeHtml(moneyFormatter.format(Number(order.amount || 0)))}원</span>
              <span class="history-muted">${escapeHtml(formatHistoryDate(order.created_at))}</span>
              ${buildRefundControl(order)}
            </li>
          `,
        )
        .join('')}
    </ul>
  `;
}

export function buildHistoryItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<p class="history-empty">신청 내역이 없습니다. 신청할 때 적은 이메일이 맞는지 확인해 주세요.</p>';
  }

  return items
    .map((item) => {
      const application = item.application || {};

      return `
        <article class="history-card">
          <header>
            <strong>${escapeHtml(application.meetup_title || '모임')}</strong>
            <span class="history-status is-${escapeHtml(application.status)}">${escapeHtml(getHistoryStatusText(application.status))}</span>
          </header>
          <p class="history-muted">${escapeHtml(application.applicant_name || '')} · ${escapeHtml(formatHistoryDate(application.created_at))} 신청</p>
          ${buildOrderLines(item.orders)}
        </article>
      `;
    })
    .join('');
}
