import {
  clearAdminSession,
  completeAdminInvite,
  createAdminMeetup,
  fetchAdminOperationalData,
  fetchAdminOverview,
  fetchAdminOrders,
  getStoredAdminSession,
  isSupabaseConfigured,
  setAdminMeetupVisibility,
  signInAdmin,
  signOutAdmin,
  updateAdminApplicationStatus,
  updateAdminMeetup,
  updateAdminOrderStatus,
  uploadMeetupImage,
} from './supabase-client.js?v=__ASSET_VERSION__';

const loginView = document.querySelector('[data-login-view]');
const dashboardView = document.querySelector('[data-dashboard-view]');
const loginTitle = document.querySelector('[data-login-title]');
const loginForm = document.querySelector('[data-login-form]');
const inviteForm = document.querySelector('[data-invite-form]');
const loginStatus = document.querySelector('[data-login-status]');
const syncStatus = document.querySelector('[data-sync-status]');
const sessionEmail = document.querySelector('[data-session-email]');
const refreshButton = document.querySelector('[data-refresh]');
const signOutButton = document.querySelector('[data-sign-out]');
const tabButtons = document.querySelectorAll('[data-tab-button]');
const tabPanels = document.querySelectorAll('[data-tab-panel]');
const newMeetupButton = document.querySelector('[data-new-meetup]');
const meetupForm = document.querySelector('[data-meetup-form]');
const meetupFormTitle = document.querySelector('[data-meetup-form-title]');
const meetupFormStatus = document.querySelector('[data-meetup-form-status]');
const cancelMeetupButton = document.querySelector('[data-cancel-meetup]');
const meetupsBody = document.querySelector('[data-meetups-body]');
const applicationsBody = document.querySelector('[data-applications-body]');
const ordersBody = document.querySelector('[data-orders-body]');
const agenticSummary = document.querySelector('[data-agentic-summary]');
const agenticAgents = document.querySelector('[data-agentic-agents]');
const agenticTasks = document.querySelector('[data-agentic-tasks]');
const agenticUpdated = document.querySelector('[data-agentic-updated]');
const agenticStatus = document.querySelector('[data-agentic-status]');
const agenticAgentCount = document.querySelector('[data-agentic-agent-count]');
const agenticTaskCount = document.querySelector('[data-agentic-task-count]');
const agenticRefreshButton = document.querySelector('[data-agentic-refresh]');
const meetupImagePreviewImg = document.querySelector('[data-image-preview-img]');
const meetupImagePreviewEmpty = document.querySelector('[data-image-preview-empty]');
const meetupImageFileName = document.querySelector('[data-image-file-name]');

const moneyFormatter = new Intl.NumberFormat('ko-KR');
const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const applicationStatuses = ['submitted', 'reviewing', 'accepted', 'rejected', 'cancelled'];
const applicationStatusLabels = {
  submitted: '접수',
  reviewing: '검토중',
  accepted: '승인',
  rejected: '거절',
  cancelled: '취소',
};
const orderStatuses = ['pending', 'cancelled', 'failed'];
const orderStatusLabels = {
  pending: '입금대기',
  demo_paid: '데모결제',
  paid: '결제완료',
  cancelled: '취소',
  failed: '실패',
};
const paymentStatusLabels = {
  paid: '기록 있음',
  cancelled: '취소 기록',
  failed: '실패 기록',
  refunded: '환불',
  partial_refunded: '부분 환불',
};
const agentStatusLabels = {
  running: '진행중',
  idle: '대기',
  blocked: '막힘',
  done: '완료',
};
const taskStatusLabels = {
  proposed: '제안',
  approved: '승인',
  assigned: '할당',
  in_progress: '진행중',
  needs_review: '검토 필요',
  rejected: '반려',
  deferred: '보류',
  done_local: '로컬 완료',
  deployed: '배포 완료',
};

let activeSession = getStoredAdminSession();
let overview = {
  meetups: [],
  meetupAvailability: [],
  applications: [],
  orders: [],
  payments: [],
};
let operationsRequestId = 0;
let ordersRequestId = 0;
let agenticRequestId = 0;
let editingMeetupId = null;
const shouldClearAuthParams = hasAuthTokenParams();
let pendingInvite = getInviteParams();
let meetupImagePreviewObjectUrl = null;

if (shouldClearAuthParams) {
  clearAuthParamsFromUrl();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '-';
  return dateFormatter.format(new Date(value));
}

function formatMoney(value) {
  return `${moneyFormatter.format(Number(value || 0))}원`;
}

function normalizePriceLabel(priceLabel, amount) {
  const trimmed = String(priceLabel || '').trim();

  if (!trimmed) {
    return formatMoney(amount);
  }

  if (/^\d+$/.test(trimmed)) {
    return formatMoney(trimmed);
  }

  return trimmed;
}

function normalizeOptionalInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function getCapacityPayloadValue(value) {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    return null;
  }

  const capacity = Number(trimmed);

  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error('정원은 비워두거나 1명 이상의 정수로 입력해주세요.');
  }

  return capacity;
}

function getRegistrationStatusPayloadValue(value) {
  return value === 'closed' ? 'closed' : 'open';
}

function normalizeAdminAvailability(row) {
  return {
    meetup_id: String(row.meetup_id || ''),
    capacity: normalizeOptionalInteger(row.capacity),
    paid_order_count: Number(row.paid_order_count || 0),
    pending_order_count: Number(row.pending_order_count || 0),
    active_order_count: Number(row.active_order_count || 0),
    remaining_spots: row.remaining_spots === null ? null : Number(row.remaining_spots),
    registration_status: String(row.registration_status || 'open'),
    effective_registration_status: String(row.effective_registration_status || 'open'),
    can_register: row.can_register === true,
    closed_at: row.closed_at || null,
    close_reason: row.close_reason || '',
    availability_known: true,
  };
}

function mergeAdminMeetupAvailability(meetups, availabilityRows = []) {
  const availabilityByMeetupId = new Map(
    availabilityRows
      .map(normalizeAdminAvailability)
      .filter((availability) => availability.meetup_id)
      .map((availability) => [availability.meetup_id, availability]),
  );

  return meetups.map((meetup) => {
    const availability = availabilityByMeetupId.get(meetup.id);

    if (availability) {
      return { ...meetup, ...availability };
    }

    return {
      ...meetup,
      availability_known: false,
      effective_registration_status: 'unknown',
      can_register: false,
      paid_order_count: null,
      pending_order_count: null,
      active_order_count: null,
      remaining_spots: null,
    };
  });
}

function getTypeLabel(type) {
  if (type === 'event') return '원데이';
  if (type === 'social') return '친목';
  return '정기 모임';
}

function getApplicationStatusLabel(status) {
  return applicationStatusLabels[status] || status || '-';
}

function renderApplicationStatusOptions(currentStatus) {
  return applicationStatuses
    .map(
      (status) => `
        <option value="${status}" ${status === currentStatus ? 'selected' : ''}>
          ${getApplicationStatusLabel(status)}
        </option>
      `,
    )
    .join('');
}

function getOrderStatusLabel(status) {
  return orderStatusLabels[status] || status || '-';
}

function getPaymentStatusLabel(status) {
  return paymentStatusLabels[status] || status || '결제 기록';
}

function getAgentStatusLabel(status) {
  return agentStatusLabels[status] || status || '-';
}

function getTaskStatusLabel(status) {
  return taskStatusLabels[status] || status || '-';
}

function getStatusClass(status) {
  return String(status || 'idle').replace(/[^a-z0-9_-]/gi, '_');
}

function renderOrderStatusOptions(currentStatus) {
  return orderStatuses
    .map(
      (status) => `
        <option value="${status}" ${status === currentStatus ? 'selected' : ''}>
          ${getOrderStatusLabel(status)}
        </option>
      `,
    )
    .join('');
}

function canManuallyUpdateOrderStatus(status) {
  return orderStatuses.includes(status);
}

function getPaymentForOrder(orderId) {
  return overview.payments.find((payment) => payment.order_id === orderId);
}

function formatPaymentKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function renderPaymentRecord(order) {
  const payment = getPaymentForOrder(order.id);

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

function formatAgenticUpdated(value) {
  if (!value) return '업데이트 정보 없음';

  try {
    return `업데이트 ${dateFormatter.format(new Date(value))}`;
  } catch {
    return `업데이트 ${value}`;
  }
}

function renderAgenticMessage(message) {
  agenticSummary.innerHTML = '';
  agenticAgents.innerHTML = `
    <article class="agent-card">
      <p>${escapeHtml(message)}</p>
    </article>
  `;
  agenticTasks.innerHTML = '';
  agenticUpdated.textContent = '확인 지연';
  agenticAgentCount.textContent = '0명';
  agenticTaskCount.textContent = '0개';
}

function renderTaskDetailSection(label, value) {
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

function renderTaskDetails(task) {
  const details = task.details || {};
  const sections = [
    renderTaskDetailSection('요약', details.summary),
    renderTaskDetailSection('무슨 작업인가요?', details.what),
    renderTaskDetailSection('왜 필요한가요?', details.why),
    renderTaskDetailSection('간단한 개발 방향', details.developmentDirection),
    renderTaskDetailSection('알아둘 점', details.notes),
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

function renderAgenticStatus(data) {
  const summary = data.summary || {};
  const agents = Array.isArray(data.agents) ? data.agents : [];
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];

  agenticUpdated.textContent = formatAgenticUpdated(data.updatedAt);
  agenticAgentCount.textContent = `${agents.length}명`;
  agenticTaskCount.textContent = `${tasks.length}개`;
  agenticSummary.innerHTML = [
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
  agenticAgents.innerHTML =
    agents
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
      .join('') || '<article class="agent-card"><p>Agent 상태가 없습니다.</p></article>';
  agenticTasks.innerHTML =
    tasks
      .map((task) => {
        const detailsMarkup = renderTaskDetails(task);
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
      .join('') || '<article class="task-item"><p>Task 상태가 없습니다.</p></article>';
  agenticStatus.textContent = `작업판 확인 완료 · ${escapeHtml(data.branch || '-')}`;
}

function toggleTaskDetail(taskItem) {
  const detail = taskItem?.querySelector('.task-detail');

  if (!detail) {
    return;
  }

  detail.open = !detail.open;
}

function isTaskDetailInteractiveTarget(target) {
  return Boolean(target.closest('.task-detail, button, a, input, select, textarea, label'));
}

function handleTaskItemClick(event) {
  if (isTaskDetailInteractiveTarget(event.target)) {
    return;
  }

  const taskItem = event.target.closest('.task-item.has-detail');

  if (!taskItem) {
    return;
  }

  toggleTaskDetail(taskItem);
}

function handleTaskItemKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  const taskItem = event.target.closest('.task-item.has-detail');

  if (!taskItem || event.target !== taskItem) {
    return;
  }

  event.preventDefault();
  toggleTaskDetail(taskItem);
}

function splitList(value) {
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createMeetupId(title) {
  const slug = String(title || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);

  return `${slug || 'meetup'}-${Date.now().toString(36)}`;
}

function getAuthParams() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace(/^#/, '');
  const hashParams = new URLSearchParams(hash);

  hashParams.forEach((value, key) => {
    if (!params.has(key)) {
      params.set(key, value);
    }
  });

  return params;
}

function getInviteParams() {
  const params = getAuthParams();
  const accessToken = params.get('access_token');
  const type = params.get('type');

  if (!accessToken || type !== 'invite') {
    return null;
  }

  const expiresAt = Number(params.get('expires_at') || 0);
  const expiresIn = Number(params.get('expires_in') || 0);

  return {
    accessToken,
    email: params.get('email') || '',
    expiresAt: expiresAt
      ? expiresAt * 1000
      : Date.now() + (expiresIn || 3600) * 1000,
  };
}

function hasAuthTokenParams() {
  const params = getAuthParams();

  return [
    'access_token',
    'refresh_token',
    'type',
    'expires_at',
    'expires_in',
    'token_type',
  ].some((key) => params.has(key));
}

function clearAuthParamsFromUrl() {
  window.history.replaceState(null, '', window.location.pathname);
}

function getMeetupFormPayload(includeId) {
  const formData = new FormData(meetupForm);
  const priceAmount = Number(formData.get('price_amount') || 0);
  const title = String(formData.get('title') || '').trim();
  const registrationStatus = getRegistrationStatusPayloadValue(formData.get('registration_status'));
  const closeReason = String(formData.get('close_reason') || '').trim();
  const payload = {
    type: String(formData.get('type') || 'regular'),
    category: String(formData.get('category') || '').trim(),
    title,
    description: String(formData.get('description') || '').trim(),
    host_name: String(formData.get('host_name') || '').trim(),
    host_role: String(formData.get('host_role') || '').trim(),
    status_label: String(formData.get('status_label') || '').trim(),
    date_label: String(formData.get('date_label') || '').trim(),
    time_label: String(formData.get('time_label') || '').trim(),
    location: String(formData.get('location') || '').trim(),
    price_amount: priceAmount,
    price_label: normalizePriceLabel(formData.get('price_label'), priceAmount),
    capacity: getCapacityPayloadValue(formData.get('capacity')),
    registration_status: registrationStatus,
    close_reason: registrationStatus === 'closed' && closeReason ? closeReason : null,
    tags: splitList(formData.get('tags')),
    image_url: String(formData.get('image_url') || '').trim(),
    schedule: splitList(formData.get('schedule')),
    is_published: formData.has('is_published'),
  };

  if (includeId) {
    payload.id = String(formData.get('id') || '').trim() || createMeetupId(title);
  }

  return payload;
}

function syncRegistrationStatusFields({ clearReason = false } = {}) {
  const statusField = meetupForm.elements.registration_status;
  const reasonField = meetupForm.elements.close_reason;
  if (!statusField || !reasonField) return;

  const isClosed = statusField.value === 'closed';
  reasonField.disabled = !isClosed;

  if (!isClosed && clearReason) {
    reasonField.value = '';
  }
}

function getSelectedMeetupImageFile() {
  return meetupForm.elements.image_file?.files?.[0] || null;
}

function clearMeetupImagePreviewObjectUrl() {
  if (meetupImagePreviewObjectUrl) {
    URL.revokeObjectURL(meetupImagePreviewObjectUrl);
    meetupImagePreviewObjectUrl = null;
  }
}

function isHttpImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function setMeetupImagePreview(src = '') {
  const hasImage = Boolean(src);

  if (hasImage) {
    meetupImagePreviewImg.src = src;
  } else {
    meetupImagePreviewImg.removeAttribute('src');
  }

  meetupImagePreviewImg.hidden = !hasImage;
  meetupImagePreviewEmpty.hidden = hasImage;
}

function resetMeetupImagePicker(imageUrl = '') {
  clearMeetupImagePreviewObjectUrl();
  meetupImageFileName.textContent = 'PNG, JPG, WebP, GIF 지원';
  setMeetupImagePreview(isHttpImageUrl(imageUrl) ? imageUrl : '');
}

function setMeetupImagePreviewFromFile(file) {
  clearMeetupImagePreviewObjectUrl();

  if (!file) {
    resetMeetupImagePicker(meetupForm.elements.image_url.value);
    return;
  }

  meetupImagePreviewObjectUrl = URL.createObjectURL(file);
  meetupImageFileName.textContent = file.name;
  setMeetupImagePreview(meetupImagePreviewObjectUrl);
}

function getMeetupTitle(meetupId) {
  return overview.meetups.find((meetup) => meetup.id === meetupId)?.title || meetupId || '-';
}

function setPending(isPending) {
  refreshButton.disabled = isPending;
  loginForm.querySelectorAll('input, button').forEach((element) => {
    element.disabled = isPending;
  });
  inviteForm.querySelectorAll('input, button').forEach((element) => {
    element.disabled = isPending;
  });
}

function showLogin(message = '') {
  loginView.hidden = false;
  dashboardView.hidden = true;
  loginTitle.textContent = '관리자';
  loginForm.hidden = false;
  inviteForm.hidden = true;
  loginStatus.textContent = message;
}

function showInvite(message = '초대 링크가 확인되었습니다.') {
  loginView.hidden = false;
  dashboardView.hidden = true;
  loginTitle.textContent = '관리자 초대 수락';
  loginForm.hidden = true;
  inviteForm.hidden = false;
  inviteForm.elements.email.value = pendingInvite?.email || '';
  loginStatus.textContent = message;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  sessionEmail.textContent = activeSession?.user?.email || '';
}

function isSessionUsable(session) {
  if (!session?.accessToken) return false;
  return !session.expiresAt || session.expiresAt > Date.now();
}

function getSessionUnavailableMessage(session, fallback = '관리자 로그인이 필요합니다.') {
  if (session?.expiresAt && session.expiresAt <= Date.now()) {
    return '관리자 세션이 만료되었습니다. 다시 로그인해주세요.';
  }

  return fallback;
}

function clearUnavailableActiveSession() {
  if (activeSession) {
    clearAdminSession();
    activeSession = null;
  }
}

function requireActiveSession(statusElement, fallbackMessage = '다시 로그인한 뒤 진행해주세요.') {
  if (isSessionUsable(activeSession)) {
    return true;
  }

  const message = getSessionUnavailableMessage(activeSession, fallbackMessage);
  clearUnavailableActiveSession();

  if (statusElement) {
    statusElement.textContent = message;
  }

  return false;
}

function getLoginErrorMessage(error) {
  if (error.message.includes('timed out')) {
    return '로그인 요청 시간이 초과됐습니다.';
  }

  if (error.message.includes('network request failed') || error.message.includes('Load failed')) {
    return '로그인 요청이 브라우저에서 실패했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.';
  }

  if (error.code === 'invalid_credentials' || error.message.toLowerCase().includes('invalid login')) {
    return '이메일 또는 비밀번호가 맞지 않습니다. Supabase Authentication에 만든 이메일 계정으로 로그인해주세요.';
  }

  if (error.message.toLowerCase().includes('email not confirmed')) {
    return '이메일 확인이 필요합니다. Supabase Authentication에서 해당 유저를 Confirm 처리해주세요.';
  }

  return `로그인 실패: ${error.message}`;
}

function renderStats() {
  const paidOrders = overview.orders.filter((order) => order.status === 'paid');
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);

  document.querySelector('[data-stat-meetups]').textContent = overview.meetups.length;
  document.querySelector('[data-stat-applications]').textContent = overview.applications.length;
  document.querySelector('[data-stat-orders]').textContent = overview.orders.length;
  document.querySelector('[data-stat-revenue]').textContent = formatMoney(revenue);
}

function renderApplications() {
  document.querySelector('[data-applications-count]').textContent = `${overview.applications.length}건`;
  document.querySelector('[data-applications-body]').innerHTML =
    overview.applications
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
            </td>
          </tr>
        `,
      )
      .join('') || '<tr class="empty-row"><td colspan="5">신청 내역이 없습니다.</td></tr>';
}

function renderApplicationsMessage(message, countLabel = '0건') {
  document.querySelector('[data-applications-count]').textContent = countLabel;
  document.querySelector('[data-applications-body]').innerHTML = `
    <tr class="empty-row">
      <td colspan="5">${escapeHtml(message)}</td>
    </tr>
  `;
}

function renderOrders() {
  document.querySelector('[data-orders-count]').textContent = `${overview.orders.length}건`;
  document.querySelector('[data-orders-body]').innerHTML =
    overview.orders
      .map(
        (order) => `
          <tr>
            <td data-label="일시">${formatDate(order.created_at)}</td>
            <td data-label="모임">${escapeHtml(getMeetupTitle(order.meetup_id))}</td>
            <td data-label="구매자">${escapeHtml(order.buyer_name || '미입력')}</td>
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
            <td data-label="결제 기록">${renderPaymentRecord(order)}</td>
          </tr>
        `,
      )
      .join('') || '<tr class="empty-row"><td colspan="7">주문 내역이 없습니다.</td></tr>';
}

function renderOrdersMessage(message, countLabel = '0건') {
  document.querySelector('[data-orders-count]').textContent = countLabel;
  document.querySelector('[data-orders-body]').innerHTML = `
    <tr class="empty-row">
      <td colspan="7">${escapeHtml(message)}</td>
    </tr>
  `;
}

function getSeatStatusLabel(meetup) {
  if (meetup.availability_known === false) return '확인 지연';
  if (meetup.effective_registration_status === 'closed') return '신청 종료';
  if (meetup.effective_registration_status === 'sold_out') return '마감';
  return '접수 가능';
}

function getSeatStatusClass(meetup) {
  if (meetup.availability_known === false) return 'is-deferred';
  if (meetup.effective_registration_status === 'closed' || meetup.effective_registration_status === 'sold_out') {
    return 'is-failed';
  }
  if (Number.isFinite(meetup.remaining_spots) && meetup.remaining_spots <= 2) return 'is-pending';
  return 'is-published';
}

function getSeatSummaryText(meetup) {
  if (meetup.availability_known === false) {
    return meetup.capacity ? `정원 ${meetup.capacity}명 · 잔여 확인 지연` : '잔여 확인 지연';
  }

  if (!meetup.capacity) {
    return '무제한';
  }

  return `잔여 ${meetup.remaining_spots}/${meetup.capacity}`;
}

function getSeatBreakdownText(meetup) {
  if (meetup.availability_known === false) {
    return '정원 상태를 다시 불러와야 합니다.';
  }

  return `확정 ${meetup.paid_order_count || 0} · 결제중 ${meetup.pending_order_count || 0}`;
}

function renderSeatSummary(meetup) {
  return `
    <div class="seat-summary">
      <span class="pill ${getSeatStatusClass(meetup)}">${escapeHtml(getSeatStatusLabel(meetup))}</span>
      <strong>${escapeHtml(getSeatSummaryText(meetup))}</strong>
      <span>${escapeHtml(getSeatBreakdownText(meetup))}</span>
    </div>
  `;
}

function renderMeetups() {
  document.querySelector('[data-meetups-count]').textContent = `${overview.meetups.length}개`;
  document.querySelector('[data-meetups-body]').innerHTML =
    overview.meetups
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
            <td data-label="가격">${escapeHtml(normalizePriceLabel(meetup.price_label, meetup.price_amount))}</td>
            <td data-label="좌석">${renderSeatSummary(meetup)}</td>
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
      .join('') || '<tr class="empty-row"><td colspan="8">모임 데이터가 없습니다.</td></tr>';
}

function renderMeetupsMessage(message, countLabel = '0개') {
  document.querySelector('[data-meetups-count]').textContent = countLabel;
  document.querySelector('[data-meetups-body]').innerHTML = `
    <tr class="empty-row">
      <td colspan="8">${escapeHtml(message)}</td>
    </tr>
  `;
}

function setMeetupFormPending(isPending) {
  meetupForm.querySelectorAll('input, select, textarea, button').forEach((element) => {
    element.disabled = isPending;
  });
}

function setMeetupFormValues(meetup) {
  meetupForm.elements.id.value = meetup?.id || '';
  meetupForm.elements.id.readOnly = Boolean(meetup);
  meetupForm.elements.type.value = meetup?.type || 'regular';
  meetupForm.elements.category.value = meetup?.category || '';
  meetupForm.elements.title.value = meetup?.title || '';
  meetupForm.elements.description.value = meetup?.description || '';
  meetupForm.elements.host_name.value = meetup?.host_name || '';
  meetupForm.elements.host_role.value = meetup?.host_role || '';
  meetupForm.elements.status_label.value = meetup?.status_label || '';
  meetupForm.elements.date_label.value = meetup?.date_label || '';
  meetupForm.elements.time_label.value = meetup?.time_label || '';
  meetupForm.elements.location.value = meetup?.location || '';
  meetupForm.elements.price_amount.value = meetup?.price_amount ?? '';
  meetupForm.elements.price_label.value = meetup?.price_label || '';
  meetupForm.elements.capacity.value = meetup?.capacity ?? '';
  meetupForm.elements.registration_status.value = meetup?.registration_status === 'closed' ? 'closed' : 'open';
  meetupForm.elements.close_reason.value = meetup?.close_reason || '';
  meetupForm.elements.image_url.value = meetup?.image_url || '';
  meetupForm.elements.image_file.value = '';
  resetMeetupImagePicker(meetup?.image_url || '');
  meetupForm.elements.tags.value = Array.isArray(meetup?.tags) ? meetup.tags.join(', ') : '';
  meetupForm.elements.schedule.value = Array.isArray(meetup?.schedule) ? meetup.schedule.join('\n') : '';
  meetupForm.elements.is_published.checked = meetup?.is_published ?? true;
  syncRegistrationStatusFields();
}

function openMeetupForm(meetup = null) {
  editingMeetupId = meetup?.id || null;
  meetupForm.reset();
  setMeetupFormValues(meetup);
  meetupFormTitle.textContent = meetup ? '모임 수정' : '새 모임 추가';
  meetupFormStatus.textContent = meetup
    ? '수정 후 저장하면 메인 사이트에도 반영됩니다.'
    : '관리 ID를 비워두면 자동으로 생성됩니다.';
  meetupForm.hidden = false;
  meetupForm.querySelector('input[name="title"]')?.focus({ preventScroll: true });
}

function closeMeetupForm() {
  editingMeetupId = null;
  meetupForm.hidden = true;
  meetupFormStatus.textContent = '';
  resetMeetupImagePicker();
  meetupForm.reset();
}

function upsertMeetupInOverview(meetup) {
  const meetupWithUnknownAvailability = mergeAdminMeetupAvailability([meetup], [])[0];
  const index = overview.meetups.findIndex((item) => item.id === meetup.id);

  if (index >= 0) {
    overview.meetups = overview.meetups.map((item) => (
      item.id === meetup.id ? meetupWithUnknownAvailability : item
    ));
  } else {
    overview.meetups = [meetupWithUnknownAvailability, ...overview.meetups];
  }

  renderStats();
  renderMeetups();
}

function getAdminWriteErrorMessage(error) {
  const message = error.message || String(error);

  if (message.includes('401') || message.includes('403') || message.includes('row-level security')) {
    return '관리자 수정 권한이 아직 열리지 않았습니다. 추가 SQL을 Supabase에서 실행해야 합니다.';
  }

  if (message.includes('storage upload failed') || message.includes('Bucket not found')) {
    return '이미지 업로드 권한이 아직 열리지 않았습니다. Supabase Storage SQL을 실행해야 합니다.';
  }

  if (message.includes('duplicate key')) {
    return '이미 같은 관리 ID가 있습니다. ID를 바꾸거나 기존 모임을 수정해주세요.';
  }

  return `저장 실패: ${message}`;
}

function updateApplicationInOverview(updatedApplication) {
  overview.applications = overview.applications.map((application) =>
    application.id === updatedApplication.id ? updatedApplication : application,
  );
  renderApplications();
}

function updateOrderInOverview(updatedOrder) {
  overview.orders = overview.orders.map((order) => (order.id === updatedOrder.id ? updatedOrder : order));
  renderStats();
  renderOrders();
}

function hasWarningFor(label, warnings = []) {
  return warnings.some((warning) => warning.includes(label));
}

function renderOverview() {
  renderStats();
  renderApplications();
  renderOrders();
  renderMeetups();
}

function getActiveTab() {
  return document.querySelector('[data-tab-button].is-active')?.dataset.tabButton || 'applications';
}

async function fetchAgenticStatus() {
  const response = await fetch(`./AGENTIC_STATUS.json?v=__ASSET_VERSION__`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Agentic status fetch failed: ${response.status}`);
  }

  return response.json();
}

async function loadAgenticStatus() {
  if (!requireActiveSession(agenticStatus, '다시 로그인한 뒤 작업판을 확인해주세요.')) {
    return;
  }

  const requestId = ++agenticRequestId;
  agenticRefreshButton.disabled = true;
  agenticStatus.textContent = '작업판 확인 중';

  try {
    const data = await fetchAgenticStatus();

    if (requestId !== agenticRequestId) {
      return;
    }

    renderAgenticStatus(data);
  } catch (error) {
    console.error(error);

    if (requestId !== agenticRequestId) {
      return;
    }

    renderAgenticMessage('작업판을 불러오지 못했습니다.');
    agenticStatus.textContent = '작업판 확인 실패';
  } finally {
    if (requestId === agenticRequestId) {
      agenticRefreshButton.disabled = false;
    }
  }
}

async function loadOperationalData() {
  if (!requireActiveSession(syncStatus, '다시 로그인한 뒤 운영 데이터를 확인해주세요.')) {
    return;
  }

  const requestId = ++operationsRequestId;
  syncStatus.textContent = '운영 데이터 확인 중';
  renderApplicationsMessage('신청 데이터를 따로 확인하고 있습니다.', '확인 중');
  renderMeetupsMessage('모임 데이터를 따로 확인하고 있습니다.', '확인 중');

  try {
    const data = await fetchAdminOperationalData(activeSession.accessToken);

    if (requestId !== operationsRequestId) {
      return;
    }

    overview = {
      ...overview,
      meetups: mergeAdminMeetupAvailability(data.meetups, data.meetupAvailability),
      meetupAvailability: data.meetupAvailability,
      applications: data.applications,
    };
    renderStats();
    renderApplications();
    if (!overview.meetups.length && hasWarningFor('모임', data.warnings)) {
      renderMeetupsMessage('모임 데이터 조회가 지연되었습니다. 새로고침을 눌러 다시 확인해주세요.', '조회 지연');
    } else {
      renderMeetups();
    }
    renderOrders();
    syncStatus.textContent = data.warnings?.length
      ? `${data.warnings.join(' ')} 운영 데이터 확인 완료`
      : `운영 데이터 업데이트 ${dateFormatter.format(new Date())}`;
  } catch (error) {
    console.error(error);

    if (requestId !== operationsRequestId) {
      return;
    }

    overview = { ...overview, meetups: [], meetupAvailability: [], applications: [] };
    renderStats();
    renderApplicationsMessage('신청 데이터 조회가 지연되어 이번 화면에서는 건너뛰었습니다.', '확인 지연');
    renderMeetupsMessage('모임 데이터 조회가 지연되어 이번 화면에서는 건너뛰었습니다.', '확인 지연');
    syncStatus.textContent = '운영 데이터 조회 지연';
  }
}

async function loadOrders() {
  if (!requireActiveSession(syncStatus, '다시 로그인한 뒤 주문 데이터를 확인해주세요.')) {
    return;
  }

  const requestId = ++ordersRequestId;
  syncStatus.textContent = '주문 데이터 확인 중';
  renderOrdersMessage('주문 데이터를 따로 확인하고 있습니다.', '확인 중');

  try {
    const data = await fetchAdminOrders(activeSession.accessToken);

    if (requestId !== ordersRequestId) {
      return;
    }

    overview = { ...overview, orders: data.orders, payments: data.payments };
    renderStats();
    if (!overview.orders.length && hasWarningFor('주문', data.warnings)) {
      renderOrdersMessage('주문 데이터 조회가 지연되었습니다. 새로고침을 눌러 다시 확인해주세요.', '조회 지연');
    } else {
      renderOrders();
    }
    syncStatus.textContent = data.warnings?.length
      ? `${data.warnings.join(' ')} 주문 데이터 확인 완료`
      : `주문 업데이트 ${dateFormatter.format(new Date())}`;
  } catch (error) {
    console.error(error);

    if (requestId !== ordersRequestId) {
      return;
    }

    overview = { ...overview, orders: [], payments: [] };
    renderStats();
    renderOrdersMessage(
      error.message.includes('timed out')
        ? '주문 데이터 조회가 지연되어 이번 화면에서는 건너뛰었습니다. 새로고침으로 다시 확인할 수 있습니다.'
        : `주문 데이터 조회 실패: ${error.message}`,
      '확인 지연',
    );
    syncStatus.textContent = '주문 데이터 조회 지연';
  }
}

async function loadOverview() {
  if (!isSupabaseConfigured()) {
    showLogin('Supabase 설정값이 없습니다.');
    return;
  }

  if (!isSessionUsable(activeSession)) {
    const message = getSessionUnavailableMessage(activeSession);
    clearUnavailableActiveSession();
    showLogin(message);
    return;
  }

  setPending(true);
  syncStatus.textContent = '불러오는 중';
  loginStatus.textContent = '관리자 화면을 여는 중';

  try {
    overview = await fetchAdminOverview();
    renderOverview();
    showDashboard();
    if (getActiveTab() === 'agentic') {
      void loadAgenticStatus();
    }
    syncStatus.textContent = overview.warnings?.length
      ? `${overview.warnings.join(' ')} 업데이트 ${dateFormatter.format(new Date())}`
      : `업데이트 ${dateFormatter.format(new Date())}`;
    void loadOperationalData();
    void loadOrders();
  } catch (error) {
    console.error(error);
    const currentStep = syncStatus.textContent || '관리자 데이터 확인';
    const message = error.message.includes('timed out')
      ? `${currentStep} 단계에서 요청 시간이 초과됐습니다.`
      : `관리자 데이터 조회 실패: ${error.message}`;
    showLogin(message);
  } finally {
    setPending(false);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');

  setPending(true);
  loginStatus.textContent = '로그인 중';

  try {
    activeSession = await signInAdmin({ email, password });
    loginStatus.textContent = '로그인 성공. 관리자 화면 여는 중';
    await loadOverview();
  } catch (error) {
    console.error(error);
    loginStatus.textContent = getLoginErrorMessage(error);
  } finally {
    setPending(false);
  }
});

inviteForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!pendingInvite) {
    showLogin('초대 정보가 없습니다. 초대 메일의 링크를 다시 열어주세요.');
    return;
  }

  const formData = new FormData(inviteForm);
  const password = String(formData.get('password') || '');
  const passwordConfirm = String(formData.get('passwordConfirm') || '');

  if (password.length < 8) {
    loginStatus.textContent = '비밀번호는 8자 이상으로 설정해주세요.';
    return;
  }

  if (password !== passwordConfirm) {
    loginStatus.textContent = '비밀번호 확인이 일치하지 않습니다.';
    return;
  }

  setPending(true);
  loginStatus.textContent = '비밀번호 설정 중';

  try {
    activeSession = await completeAdminInvite({
      accessToken: pendingInvite.accessToken,
      password,
      expiresAt: pendingInvite.expiresAt,
    });
    pendingInvite = null;
    loginStatus.textContent = '비밀번호 설정 완료. 관리자 화면 여는 중';
    await loadOverview();
  } catch (error) {
    console.error(error);
    loginStatus.textContent = `초대 수락 실패: ${error.message}`;
  } finally {
    setPending(false);
  }
});

refreshButton.addEventListener('click', loadOverview);

agenticRefreshButton.addEventListener('click', loadAgenticStatus);

agenticTasks.addEventListener('click', handleTaskItemClick);

agenticTasks.addEventListener('keydown', handleTaskItemKeydown);

signOutButton.addEventListener('click', async () => {
  await signOutAdmin();
  activeSession = null;
  operationsRequestId += 1;
  ordersRequestId += 1;
  agenticRequestId += 1;
  overview = { meetups: [], meetupAvailability: [], applications: [], orders: [], payments: [] };
  closeMeetupForm();
  showLogin('로그아웃했습니다.');
});

applicationsBody.addEventListener('change', async (event) => {
  const select = event.target.closest('[data-application-status]');

  if (!select) {
    return;
  }

  const applicationId = select.dataset.applicationStatus;
  const previousStatus = select.dataset.currentStatus;
  const nextStatus = select.value;

  if (nextStatus === previousStatus) {
    return;
  }

  if (!requireActiveSession(syncStatus, '다시 로그인한 뒤 변경해주세요.')) {
    select.value = previousStatus;
    return;
  }

  select.disabled = true;
  syncStatus.textContent = `신청 상태 ${getApplicationStatusLabel(nextStatus)} 저장 중`;

  try {
    const updatedApplication = await updateAdminApplicationStatus(
      activeSession.accessToken,
      applicationId,
      nextStatus,
    );
    updateApplicationInOverview(updatedApplication);
    syncStatus.textContent = `신청 상태 ${getApplicationStatusLabel(nextStatus)} 저장 완료`;
  } catch (error) {
    console.error(error);
    select.value = previousStatus;
    select.dataset.currentStatus = previousStatus;
    syncStatus.textContent = getAdminWriteErrorMessage(error);
  } finally {
    select.disabled = false;
  }
});

ordersBody.addEventListener('change', async (event) => {
  const select = event.target.closest('[data-order-status]');

  if (!select) {
    return;
  }

  const orderId = select.dataset.orderStatus;
  const previousStatus = select.dataset.currentStatus;
  const nextStatus = select.value;

  if (nextStatus === previousStatus) {
    return;
  }

  if (!requireActiveSession(syncStatus, '다시 로그인한 뒤 변경해주세요.')) {
    select.value = previousStatus;
    return;
  }

  select.disabled = true;
  syncStatus.textContent = `주문 상태 ${getOrderStatusLabel(nextStatus)} 저장 중`;

  try {
    const updatedOrder = await updateAdminOrderStatus(activeSession.accessToken, orderId, nextStatus);
    updateOrderInOverview(updatedOrder);
    syncStatus.textContent = `주문 상태 ${getOrderStatusLabel(nextStatus)} 저장 완료`;
  } catch (error) {
    console.error(error);
    select.value = previousStatus;
    select.dataset.currentStatus = previousStatus;
    syncStatus.textContent = getAdminWriteErrorMessage(error);
  } finally {
    select.disabled = false;
  }
});

newMeetupButton.addEventListener('click', () => {
  openMeetupForm();
});

cancelMeetupButton.addEventListener('click', () => {
  closeMeetupForm();
});

meetupForm.elements.image_file.addEventListener('change', () => {
  setMeetupImagePreviewFromFile(getSelectedMeetupImageFile());
});

meetupForm.elements.image_url.addEventListener('input', (event) => {
  if (getSelectedMeetupImageFile()) {
    return;
  }

  clearMeetupImagePreviewObjectUrl();
  setMeetupImagePreview(isHttpImageUrl(event.target.value) ? event.target.value : '');
});

meetupForm.elements.registration_status.addEventListener('change', () => {
  syncRegistrationStatusFields({ clearReason: true });
});

meetupForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!requireActiveSession(meetupFormStatus, '다시 로그인한 뒤 저장해주세요.')) {
    return;
  }

  const isEditing = Boolean(editingMeetupId);
  let payload;

  try {
    payload = getMeetupFormPayload(!isEditing);
  } catch (error) {
    meetupFormStatus.textContent = error.message;
    return;
  }

  const imageFile = getSelectedMeetupImageFile();

  if (!payload.image_url && !imageFile) {
    meetupFormStatus.textContent = '대표 이미지를 선택하거나 이미지 주소를 입력해주세요.';
    return;
  }

  setMeetupFormPending(true);
  meetupFormStatus.textContent = isEditing ? '모임 수정 중' : '새 모임 저장 중';

  try {
    if (imageFile) {
      const meetupId = isEditing ? editingMeetupId : payload.id;
      meetupFormStatus.textContent = '이미지 업로드 중';
      payload.image_url = await uploadMeetupImage(activeSession.accessToken, imageFile, meetupId);
      meetupForm.elements.image_url.value = payload.image_url;
      meetupImageFileName.textContent = '업로드 완료';
      clearMeetupImagePreviewObjectUrl();
      setMeetupImagePreview(payload.image_url);
    }

    meetupFormStatus.textContent = isEditing ? '모임 수정 중' : '새 모임 저장 중';
    const savedMeetup = isEditing
      ? await updateAdminMeetup(activeSession.accessToken, editingMeetupId, payload)
      : await createAdminMeetup(activeSession.accessToken, payload);

    upsertMeetupInOverview(savedMeetup);
    closeMeetupForm();
    syncStatus.textContent = `모임 저장 완료 ${dateFormatter.format(new Date())}`;
  } catch (error) {
    console.error(error);
    meetupFormStatus.textContent = getAdminWriteErrorMessage(error);
  } finally {
    setMeetupFormPending(false);
    syncRegistrationStatusFields();
  }
});

meetupsBody.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-meetup]');
  const toggleButton = event.target.closest('[data-toggle-meetup]');

  if (editButton) {
    const meetup = overview.meetups.find((item) => item.id === editButton.dataset.editMeetup);
    if (meetup) {
      openMeetupForm(meetup);
    }
    return;
  }

  if (!toggleButton) {
    return;
  }

  if (!requireActiveSession(syncStatus, '다시 로그인한 뒤 변경해주세요.')) {
    return;
  }

  const meetupId = toggleButton.dataset.toggleMeetup;
  const nextVisibility = toggleButton.dataset.published !== 'true';
  toggleButton.disabled = true;
  syncStatus.textContent = nextVisibility ? '모임 공개 중' : '모임 숨김 처리 중';

  try {
    const updatedMeetup = await setAdminMeetupVisibility(activeSession.accessToken, meetupId, nextVisibility);
    upsertMeetupInOverview(updatedMeetup);
    syncStatus.textContent = `${nextVisibility ? '공개' : '숨김'} 완료 ${dateFormatter.format(new Date())}`;
  } catch (error) {
    console.error(error);
    syncStatus.textContent = getAdminWriteErrorMessage(error);
  } finally {
    toggleButton.disabled = false;
  }
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.tabButton;

    tabButtons.forEach((tabButton) => {
      tabButton.classList.toggle('is-active', tabButton === button);
    });

    tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== target;
    });

    if (target === 'agentic') {
      void loadAgenticStatus();
    }
  });
});

if (pendingInvite) {
  showInvite();
} else {
  loadOverview();
}
