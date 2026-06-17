import {
  clearAdminSession,
  completeAdminInvite,
  createAdminMeetup,
  deleteMeetupImage,
  fetchAdminOperationalData,
  fetchAdminOverview,
  fetchAdminOrders,
  getStoredAdminSession,
  isSupabaseConfigured,
  listMeetupGuests,
  addMeetupGuest,
  deleteMeetupGuest,
  refundAdminOrder,
  sendApprovalPush,
  sendRejectionNotice,
  setAdminMeetupVisibility,
  signInAdmin,
  signOutAdmin,
  updateAdminApplicationStatus,
  updateAdminMeetup,
  updateAdminOrderStatus,
  uploadMeetupImage,
} from './supabase-client.js?v=__ASSET_VERSION__';
import {
  closeModal,
  isModalOpen,
  openModal,
  trapFocus,
} from './modal-manager.js?v=__ASSET_VERSION__';
import { createAdminMeetupPayload } from './admin-meetup-form.js?v=__ASSET_VERSION__';
import { mergeAdminMeetupAvailability } from './admin-availability.js?v=__ASSET_VERSION__';
import {
  getApplicationStatusLabel,
  getApprovalPushSummaryMessage,
  getOrderStatusLabel,
  getRejectionNoticeSummaryMessage,
} from './admin-status.js?v=__ASSET_VERSION__';
import {
  buildAgentCards,
  buildAgenticSummaryCards,
  buildApplicationRows,
  buildEmptyRow,
  buildGuestListHtml,
  buildMeetupRows,
  buildOrderRows,
  buildTaskItems,
  countPendingRefundRequests,
  formatAgenticUpdated,
  formatDate,
  formatMoney,
} from './admin-render.js?v=__ASSET_VERSION__';

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
const meetupDrawer = document.querySelector('[data-meetup-drawer]');
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
const guestModal = document.querySelector('[data-guest-modal]');
const guestModalMeetup = document.querySelector('[data-guest-modal-meetup]');
const guestList = document.querySelector('[data-guest-list]');
const guestAddForm = document.querySelector('[data-guest-add-form]');
const guestModalStatus = document.querySelector('[data-guest-modal-status]');
let guestModalMeetupId = null;
let guestModalRestoreFocus = null;

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
let meetupDrawerRestoreFocus = null;
const shouldClearAuthParams = hasAuthTokenParams();
let pendingInvite = getInviteParams();
let meetupImagePreviewObjectUrl = null;

if (shouldClearAuthParams) {
  clearAuthParamsFromUrl();
}

function getPaymentForOrder(orderId) {
  return overview.payments.find((payment) => payment.order_id === orderId);
}

function renderAgenticMessage(message) {
  agenticSummary.innerHTML = '';
  agenticAgents.innerHTML = buildAgentCards([], message);
  agenticTasks.innerHTML = '';
  agenticUpdated.textContent = '확인 지연';
  agenticAgentCount.textContent = '0명';
  agenticTaskCount.textContent = '0개';
}

function renderAgenticStatus(data) {
  const summary = data.summary || {};
  const agents = Array.isArray(data.agents) ? data.agents : [];
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];

  agenticUpdated.textContent = formatAgenticUpdated(data.updatedAt);
  agenticAgentCount.textContent = `${agents.length}명`;
  agenticTaskCount.textContent = `${tasks.length}개`;
  agenticSummary.innerHTML = buildAgenticSummaryCards(summary, agents, tasks);
  agenticAgents.innerHTML = buildAgentCards(agents);
  agenticTasks.innerHTML = buildTaskItems(tasks);
  agenticStatus.textContent = `작업판 확인 완료 · ${data.branch || '-'}`;
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
  return createAdminMeetupPayload(formData, { includeId });
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
    buildApplicationRows(overview.applications, { getMeetupTitle });
}

function renderApplicationsMessage(message, countLabel = '0건') {
  document.querySelector('[data-applications-count]').textContent = countLabel;
  document.querySelector('[data-applications-body]').innerHTML = buildEmptyRow(5, message);
}

function renderRefundAlert() {
  const alert = document.querySelector('[data-refund-alert]');
  if (!alert) return;

  const count = countPendingRefundRequests(overview.orders);
  const countEl = alert.querySelector('[data-refund-alert-count]');
  if (countEl) countEl.textContent = count;
  alert.hidden = count === 0;
}

function renderOrders() {
  document.querySelector('[data-orders-count]').textContent = `${overview.orders.length}건`;
  document.querySelector('[data-orders-body]').innerHTML =
    buildOrderRows(overview.orders, { getMeetupTitle, getPaymentForOrder });
  renderRefundAlert();
}

function renderOrdersMessage(message, countLabel = '0건') {
  document.querySelector('[data-orders-count]').textContent = countLabel;
  document.querySelector('[data-orders-body]').innerHTML = buildEmptyRow(8, message);
}

function renderMeetups() {
  document.querySelector('[data-meetups-count]').textContent = `${overview.meetups.length}개`;
  document.querySelector('[data-meetups-body]').innerHTML = buildMeetupRows(overview.meetups);
}

function renderMeetupsMessage(message, countLabel = '0개') {
  document.querySelector('[data-meetups-count]').textContent = countLabel;
  document.querySelector('[data-meetups-body]').innerHTML = buildEmptyRow(8, message);
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
  meetupDrawerRestoreFocus = openModal(meetupDrawer, 'meetup-drawer-open', document.activeElement, 'input[name="title"]');
}

function closeMeetupForm() {
  editingMeetupId = null;
  closeModal(meetupDrawer, 'meetup-drawer-open', meetupDrawerRestoreFocus);
  meetupDrawerRestoreFocus = null;
  meetupFormStatus.textContent = '';
  resetMeetupImagePicker();
  meetupForm.reset();
}

function renderGuestList(guests) {
  guestList.innerHTML = buildGuestListHtml(Array.isArray(guests) ? guests : []);
}

async function refreshGuestList() {
  const guests = await listMeetupGuests(activeSession.accessToken, guestModalMeetupId);
  renderGuestList(Array.isArray(guests) ? guests : []);
  guestModalStatus.textContent = `게스트 ${Array.isArray(guests) ? guests.length : 0}명`;
}

async function openGuestModal(meetup) {
  if (!requireActiveSession(syncStatus, '다시 로그인한 뒤 진행해주세요.')) return;
  guestModalMeetupId = meetup.id;
  guestModalMeetup.textContent = meetup.title;
  guestList.innerHTML = '';
  guestModalStatus.textContent = '불러오는 중…';
  guestModalRestoreFocus = openModal(guestModal, 'guest-modal-open', document.activeElement, 'input[name="name"]');

  try {
    await refreshGuestList();
  } catch (error) {
    console.error(error);
    guestModalStatus.textContent = '게스트를 불러오지 못했습니다.';
  }
}

function closeGuestModal() {
  if (!isModalOpen(guestModal)) return;
  closeModal(guestModal, 'guest-modal-open', guestModalRestoreFocus);
  guestModalRestoreFocus = null;
  guestModalMeetupId = null;
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
  const publicResponse = await fetch(`./PUBLIC_AGENTIC_STATUS.json?v=__ASSET_VERSION__`, {
    cache: 'no-store',
  });
  const response = publicResponse.ok
    ? publicResponse
    : await fetch(`./AGENTIC_STATUS.json?v=__ASSET_VERSION__`, {
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
      : `운영 데이터 업데이트 ${formatDate(new Date())}`;
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
      : `주문 업데이트 ${formatDate(new Date())}`;
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
      ? `${overview.warnings.join(' ')} 업데이트 ${formatDate(new Date())}`
      : `업데이트 ${formatDate(new Date())}`;
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

    if (nextStatus === 'accepted') {
      syncStatus.textContent = '신청 상태 승인 저장 완료 · 알림 확인 중';

      try {
        const pushSummary = await sendApprovalPush(applicationId);
        syncStatus.textContent = getApprovalPushSummaryMessage(pushSummary);
      } catch (pushError) {
        console.error(pushError);
        syncStatus.textContent = '신청 상태 승인 저장 완료 · 알림 발송 확인 실패';
      }
    } else if (nextStatus === 'rejected') {
      syncStatus.textContent = '신청 상태 미선정 저장 완료 · 안내 확인 중';

      try {
        const noticeSummary = await sendRejectionNotice(applicationId);
        syncStatus.textContent = getRejectionNoticeSummaryMessage(noticeSummary);
      } catch (noticeError) {
        console.error(noticeError);
        syncStatus.textContent = '신청 상태 미선정 저장 완료 · 안내 발송 확인 실패';
      }
    } else {
      syncStatus.textContent = `신청 상태 ${getApplicationStatusLabel(nextStatus)} 저장 완료`;
    }
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

ordersBody.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-refund-order]');

  if (!button) {
    return;
  }

  const orderId = button.dataset.refundOrder;
  const order = overview.orders.find((candidate) => candidate.id === orderId);

  if (!order) {
    return;
  }

  if (!requireActiveSession(syncStatus, '다시 로그인한 뒤 환불해주세요.')) {
    return;
  }

  const confirmed = window.confirm(
    `${getMeetupTitle(order.meetup_id)} 주문 ${formatMoney(order.amount)}을 환불할까요?\n토스 결제 취소는 되돌릴 수 없고, 좌석은 다시 열립니다.`,
  );

  if (!confirmed) {
    return;
  }

  const reason = window.prompt('환불 사유를 입력해주세요.', '운영자 환불 처리');

  if (reason === null) {
    return;
  }

  button.disabled = true;
  syncStatus.textContent = '환불 처리 중';

  try {
    const result = await refundAdminOrder(activeSession.accessToken, orderId, reason.trim() || '운영자 환불 처리');

    if (result.payment) {
      const others = overview.payments.filter((payment) => payment.id !== result.payment.id);
      overview.payments = [...others, result.payment];
    }

    if (result.order) {
      updateOrderInOverview(result.order);
    }

    const pushNote = result.push?.sent > 0 ? ` · 환불 알림 ${result.push.sent}건 발송` : '';
    syncStatus.textContent = `주문 환불 완료 (${getOrderStatusLabel('refunded')}) · 좌석이 반환되었습니다${pushNote}`;
  } catch (error) {
    console.error(error);
    syncStatus.textContent = getAdminWriteErrorMessage(error);
    button.disabled = false;
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

  let uploadedImageUrl = '';

  try {
    if (imageFile) {
      const meetupId = isEditing ? editingMeetupId : payload.id;
      meetupFormStatus.textContent = '이미지 업로드 중';
      payload.image_url = await uploadMeetupImage(activeSession.accessToken, imageFile, meetupId);
      uploadedImageUrl = payload.image_url;
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
    syncStatus.textContent = `모임 저장 완료 ${formatDate(new Date())}`;
  } catch (error) {
    console.error(error);

    if (uploadedImageUrl) {
      try {
        await deleteMeetupImage(activeSession.accessToken, uploadedImageUrl);
        if (meetupForm.elements.image_url.value === uploadedImageUrl) {
          meetupForm.elements.image_url.value = '';
        }
        meetupImageFileName.textContent = '저장 실패로 업로드한 이미지를 정리했어요';
      } catch (cleanupError) {
        console.error(cleanupError);
      }
    }

    meetupFormStatus.textContent = getAdminWriteErrorMessage(error);
  } finally {
    setMeetupFormPending(false);
    syncRegistrationStatusFields();
  }
});

meetupsBody.addEventListener('click', async (event) => {
  const guestsButton = event.target.closest('[data-guests-meetup]');
  if (guestsButton) {
    const meetup = overview.meetups.find((item) => item.id === guestsButton.dataset.guestsMeetup);
    if (meetup) openGuestModal(meetup);
    return;
  }

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
    syncStatus.textContent = `${nextVisibility ? '공개' : '숨김'} 완료 ${formatDate(new Date())}`;
  } catch (error) {
    console.error(error);
    syncStatus.textContent = getAdminWriteErrorMessage(error);
  } finally {
    toggleButton.disabled = false;
  }
});

document.querySelector('[data-refund-alert-go]')?.addEventListener('click', () => {
  document.querySelector('[data-tab-button="orders"]')?.click();
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

document.querySelectorAll('[data-guest-modal-close]').forEach((element) => {
  element.addEventListener('click', closeGuestModal);
});

document.querySelectorAll('[data-meetup-drawer-close]').forEach((element) => {
  element.addEventListener('click', closeMeetupForm);
});

document.addEventListener('keydown', (event) => {
  if (!isModalOpen(meetupDrawer)) return;
  if (event.key === 'Escape') {
    closeMeetupForm();
    return;
  }
  if (event.key === 'Tab') {
    trapFocus(event, meetupDrawer);
  }
});

guestAddForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!requireActiveSession(guestModalStatus, '다시 로그인한 뒤 진행해주세요.')) return;

  const formData = new FormData(guestAddForm);
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  const memo = String(formData.get('memo') || '').trim();

  guestModalStatus.textContent = '추가 중…';
  try {
    await addMeetupGuest(activeSession.accessToken, guestModalMeetupId, { name, memo });
    guestAddForm.reset();
    await refreshGuestList();
    await loadOperationalData();
  } catch (error) {
    console.error(error);
    guestModalStatus.textContent = getAdminWriteErrorMessage(error);
  }
});

guestList.addEventListener('click', async (event) => {
  const deleteButton = event.target.closest('[data-delete-guest]');
  if (!deleteButton) return;
  if (!requireActiveSession(guestModalStatus, '다시 로그인한 뒤 진행해주세요.')) return;

  deleteButton.disabled = true;
  guestModalStatus.textContent = '삭제 중…';
  try {
    await deleteMeetupGuest(activeSession.accessToken, deleteButton.dataset.deleteGuest);
    await refreshGuestList();
    await loadOperationalData();
  } catch (error) {
    console.error(error);
    deleteButton.disabled = false;
    guestModalStatus.textContent = getAdminWriteErrorMessage(error);
  }
});

document.addEventListener('keydown', (event) => {
  if (!isModalOpen(guestModal)) return;
  if (event.key === 'Escape') {
    closeGuestModal();
    return;
  }
  if (event.key === 'Tab') {
    trapFocus(event, guestModal);
  }
});

if (pendingInvite) {
  showInvite();
} else {
  loadOverview();
}
