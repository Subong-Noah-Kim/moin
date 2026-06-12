import {
  canManuallyUpdateOrderStatus,
  getAgentStatusLabel,
  getApplicationStatusOptions,
  getOrderStatusLabel,
  getOrderStatusOptions,
  getPaymentStatusLabel,
  getStatusClass,
  getTaskStatusLabel,
} from './admin-status.js?v=__ASSET_VERSION__';
import {
  getSeatBreakdownText,
  getSeatStatusClass,
  getSeatStatusLabel,
  getSeatSummaryText,
} from './admin-availability.js?v=__ASSET_VERSION__';
import { normalizeAdminMeetupPriceLabel } from './admin-meetup-form.js?v=__ASSET_VERSION__';
import { escapeHtml } from './escape-html.js?v=__ASSET_VERSION__';

const moneyFormatter = new Intl.NumberFormat('ko-KR');
const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

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

const paidOrderStatuses = ['paid', 'demo_paid'];

export function hasPaidLinkedOrder(application) {
  return Array.isArray(application.orders)
    && application.orders.some((order) => paidOrderStatuses.includes(order?.status));
}

export function buildEmptyRow(colSpan, message) {
  return `<tr class="empty-row"><td colspan="${colSpan}">${escapeHtml(message)}</td></tr>`;
}

export function buildApplicationRows(applications, { getMeetupTitle }) {
  return applications
    .map(
      (application) => `
        <tr>
          <td data-label="접수">${formatDate(application.created_at)}</td>
          <td data-label="모임">${escapeHtml(getMeetupTitle(application.meetup_id))}</td>
          <td data-label="이름">${escapeHtml(application.applicant_name)}</td>
          <td data-label="관심 이유">${escapeHtml(application.interest)}</td>
          <td data-label="상태">
            <select
              class="status-select is-${escapeHtml(application.status)}"
              data-application-status="${escapeHtml(application.id)}"
              data-current-status="${escapeHtml(application.status)}"
              aria-label="${escapeHtml(application.applicant_name)} 신청 상태"
            >
              ${renderApplicationStatusOptions(application.status)}
            </select>
            ${hasPaidLinkedOrder(application) ? '<span class="pill is-paid">결제완료</span>' : ''}
          </td>
        </tr>
      `,
    )
    .join('') || buildEmptyRow(5, '신청 내역이 없습니다.');
}

export function buildOrderRows(orders, { getMeetupTitle, getPaymentForOrder }) {
  return orders
    .map(
      (order) => `
        <tr>
          <td data-label="일시">${formatDate(order.created_at)}</td>
          <td data-label="모임">${escapeHtml(getMeetupTitle(order.meetup_id))}</td>
          <td data-label="구매자">${escapeHtml(order.buyer_name || '미입력')}</td>
          <td data-label="신청자">${escapeHtml(order.applications?.applicant_name || '-')}</td>
          <td data-label="금액">${formatMoney(order.amount)}</td>
          <td data-label="상태">
            ${
              canManuallyUpdateOrderStatus(order.status)
                ? `<select
                    class="status-select is-${escapeHtml(order.status)}"
                    data-order-status="${escapeHtml(order.id)}"
                    data-current-status="${escapeHtml(order.status)}"
                    aria-label="${escapeHtml(order.buyer_name || '미입력')} 주문 상태"
                  >
                    ${renderOrderStatusOptions(order.status)}
                  </select>`
                : `<span class="pill is-${escapeHtml(order.status)}">${escapeHtml(getOrderStatusLabel(order.status))}</span>`
            }
          </td>
          <td data-label="수단">${escapeHtml(order.payment_method || order.provider || '-')}</td>
          <td data-label="결제 기록">${renderPaymentRecord(order, getPaymentForOrder(order.id))}</td>
        </tr>
      `,
    )
    .join('') || buildEmptyRow(8, '주문 내역이 없습니다.');
}

export function buildSeatSummary(meetup) {
  return `
    <div class="seat-summary">
      <span class="pill ${getSeatStatusClass(meetup)}">${escapeHtml(getSeatStatusLabel(meetup))}</span>
      <strong>${escapeHtml(getSeatSummaryText(meetup))}</strong>
      <span>${escapeHtml(getSeatBreakdownText(meetup))}</span>
    </div>
  `;
}

export function buildMeetupRows(meetups) {
  return meetups
    .map(
      (meetup) => `
        <tr>
          <td data-label="모임">
            <strong>${escapeHtml(meetup.title)}</strong><br />
            <span class="muted">${escapeHtml(meetup.id)}</span>
          </td>
          <td data-label="분류">${escapeHtml(meetup.category)} · ${escapeHtml(getTypeLabel(meetup.type))}</td>
          <td data-label="일정">${escapeHtml(meetup.date_label)}<br /><span class="muted">${escapeHtml(meetup.time_label)}</span></td>
          <td data-label="장소">${escapeHtml(meetup.location)}</td>
          <td data-label="가격">${escapeHtml(normalizeAdminMeetupPriceLabel(meetup.price_label, meetup.price_amount))}</td>
          <td data-label="좌석">${buildSeatSummary(meetup)}</td>
          <td data-label="상태">
            <span class="pill ${meetup.is_published ? 'is-published' : ''}">
              ${meetup.is_published ? '공개' : '숨김'}
            </span>
          </td>
          <td data-label="관리">
            <div class="row-actions">
              <button type="button" data-edit-meetup="${escapeHtml(meetup.id)}">수정</button>
              <button
                class="ghost-button"
                type="button"
                data-toggle-meetup="${escapeHtml(meetup.id)}"
                data-published="${meetup.is_published ? 'true' : 'false'}"
              >
                ${meetup.is_published ? '숨김' : '공개'}
              </button>
            </div>
          </td>
        </tr>
      `,
    )
    .join('') || buildEmptyRow(8, '모임 데이터가 없습니다.');
}

export function buildTaskDetailSection(label, value) {
  if (!value) {
    return '';
  }

  if (Array.isArray(value)) {
    const items = value
      .filter(Boolean)
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');

    if (!items) {
      return '';
    }

    return `
      <section>
        <h4>${escapeHtml(label)}</h4>
        <ul>${items}</ul>
      </section>
    `;
  }

  return `
    <section>
      <h4>${escapeHtml(label)}</h4>
      <p>${escapeHtml(value)}</p>
    </section>
  `;
}

export function buildTaskDetails(task) {
  const details = task.details || {};
  const sections = [
    buildTaskDetailSection('요약', details.summary),
    buildTaskDetailSection('무슨 작업인가요?', details.what),
    buildTaskDetailSection('왜 필요한가요?', details.why),
    buildTaskDetailSection('간단한 개발 방향', details.developmentDirection),
    buildTaskDetailSection('알아둘 점', details.notes),
  ].join('');

  if (!sections) {
    return '';
  }

  return `
    <details class="task-detail">
      <summary>상세 보기</summary>
      <div>${sections}</div>
    </details>
  `;
}

export function buildAgenticSummaryCards(summary, agents, tasks) {
  return [
    ['진행 Agent', summary.active ?? agents.filter((agent) => agent.status === 'running').length],
    ['막힘', summary.blocked ?? agents.filter((agent) => agent.status === 'blocked').length],
    ['로컬 완료', summary.doneLocal ?? tasks.filter((task) => task.status === 'done_local').length],
    ['배포 필요', summary.deployNeeded ?? tasks.filter((task) => task.deployNeeded).length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `,
    )
    .join('');
}

export function buildAgentCards(agents, emptyMessage = 'Agent 상태가 없습니다.') {
  return agents
    .map(
      (agent) => `
        <article class="agent-card">
          <header>
            <div>
              <strong>${escapeHtml(agent.name)}</strong>
              <small>${escapeHtml(agent.role || '-')} · ${escapeHtml(agent.lastUpdate || '-')}</small>
            </div>
            <span class="pill is-${escapeHtml(getStatusClass(agent.status))}">
              ${escapeHtml(getAgentStatusLabel(agent.status))}
            </span>
          </header>
          <p>${escapeHtml(agent.currentTask || '미할당')}</p>
          <p><span class="muted">Next</span> ${escapeHtml(agent.next || '-')}</p>
          ${agent.blocker ? `<p><span class="muted">Blocker</span> ${escapeHtml(agent.blocker)}</p>` : ''}
        </article>
      `,
    )
    .join('') || `<article class="agent-card"><p>${escapeHtml(emptyMessage)}</p></article>`;
}

export function buildTaskItems(tasks, emptyMessage = 'Task 상태가 없습니다.') {
  return tasks
    .map((task) => {
      const detailsMarkup = buildTaskDetails(task);
      const detailClass = detailsMarkup ? ' has-detail' : '';
      const detailTabIndex = detailsMarkup ? ' tabindex="0"' : '';

      return `
        <article class="task-item${detailClass}"${detailTabIndex}>
          <header>
            <div>
              <strong>${escapeHtml(task.id)} · ${escapeHtml(task.title)}</strong>
              <small>${escapeHtml(task.owner || '-')}</small>
            </div>
            <span class="pill is-${escapeHtml(getStatusClass(task.status))}">
              ${escapeHtml(getTaskStatusLabel(task.status))}
            </span>
          </header>
          <div class="task-meta">
            <span class="pill">${escapeHtml(task.priority || '-')}</span>
            <span class="pill">${task.deployNeeded ? '배포 필요' : task.status === 'deployed' ? '배포 완료' : '로컬'}</span>
            ${task.commit ? `<span class="pill">${escapeHtml(task.commit)}</span>` : ''}
          </div>
          <p>${escapeHtml(task.next || '-')}</p>
          ${detailsMarkup}
        </article>
      `;
    })
    .join('') || `<article class="task-item"><p>${escapeHtml(emptyMessage)}</p></article>`;
}
