import {
  createApplication,
  createDemoOrder,
  fetchPublicMeetupAvailability,
  createTossPendingOrder,
  fetchPublishedMeetups,
  getAmountFromMeetup,
  isSupabaseConfigured,
  recordTossPaymentFailure,
  registerPushSubscription,
} from './supabase-client.js?v=__ASSET_VERSION__';
import {
  applicationServerKeyToUint8Array,
  createPushRegistrationPayload,
  getPushOptInState,
  isPushSupported,
} from './push-client.js?v=__ASSET_VERSION__';
import { PUSH_APPLICATION_SERVER_KEY } from './push-config.js?v=__ASSET_VERSION__';
import {
  getPublicStatusClass as getStatusClass,
  getRegistrationStatusLabel,
  mergeMeetupAvailability,
} from './public-availability.js?v=__ASSET_VERSION__';
import { escapeHtml } from './escape-html.js?v=__ASSET_VERSION__';
import {
  fallbackMeetups,
  normalizeMeetup,
  matchesSearch,
  sortMeetupsByFallbackOrder,
  escapeAttribute,
  escapeImageUrl,
  createTagMarkup,
} from './public-meetup.js?v=__ASSET_VERSION__';
import { detectInstallEnv, getInstallPromptMode } from './pwa-install.js?v=__ASSET_VERSION__';
import { getPublicMeetupActionState } from './public-flow.js?v=__ASSET_VERSION__';
import {
  createPublicApplicationPayload,
  createPublicCheckoutPayload,
  createPublicFieldId as createFieldId,
} from './public-form.js?v=__ASSET_VERSION__';
import {
  persistPublicStringMap,
  persistPublicStringSet as persist,
  readPublicStringMap,
  readPublicStringSet,
} from './public-storage.js?v=__ASSET_VERSION__';
import {
  closeModal,
  isModalOpen,
  openModal,
  setInert,
  trapFocus,
} from './modal-manager.js?v=__ASSET_VERSION__';
import { createToastQueue } from './toast-queue.js?v=__ASSET_VERSION__';
import {
  createSafeRandomId,
  ensureTossSdkScript,
  getPaymentErrorCode,
  getPaymentFailUrl,
  getPaymentResultUrl,
  getTossMethod,
  getTossPayment,
  isTossConfigured,
} from './toss-checkout.js?v=__ASSET_VERSION__';

function redirectInviteToAdmin() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  hashParams.forEach((value, key) => {
    if (!params.has(key)) {
      params.set(key, value);
    }
  });

  if (params.get('type') !== 'invite' || !params.get('access_token')) {
    return;
  }

  const adminUrl = new URL('./admin.html', window.location.href);
  adminUrl.search = window.location.search;
  adminUrl.hash = window.location.hash;
  window.location.replace(adminUrl.toString());
}

redirectInviteToAdmin();


let meetups = isSupabaseConfigured()
  ? mergeMeetupAvailability(fallbackMeetups, [], { requireAvailability: true })
  : [...fallbackMeetups];
window.__momentclubDataSource = 'fallback';
document.documentElement.dataset.meetupSource = 'fallback';

const waitlistItems = [
  {
    id: 'freedive',
    title: '처음 만나는 프리다이빙 입문기',
    count: 28,
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'brand-small-data',
    title: '스몰 데이터로 읽는 브랜드 심리',
    count: 24,
    image: 'https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'home-baking',
    title: '나만의 디저트 처방전 만들기',
    count: 22,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'architecture',
    title: '좋은 건축을 수집하는 주말',
    count: 19,
    image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
  },
];

const detailBenefits = [
  '첫 참여자를 위한 짧은 웰컴 체크인',
  '모임별 질문 카드와 진행 가이드',
  '제휴 공간 이용과 현장 운영 지원',
];

const detailMembers = [
  ['기록하는 사람', '대화 후 남는 문장을 노트에 모으는 편이에요.'],
  ['낯선 취향 탐험가', '잘 모르던 분야도 사람 이야기로 들어가면 좋아합니다.'],
  ['느린 주말 수집가', '빨리 친해지기보다 천천히 오래 보고 싶어요.'],
];

const detailFaqs = [
  ['혼자 신청해도 괜찮나요?', '대부분 혼자 신청합니다. 첫 만남에 자연스럽게 섞일 수 있게 진행자가 흐름을 엽니다.'],
  ['일정 중 빠지는 날이 있으면요?', '신청 전 불참 가능 회차를 알려주면 진행자가 참여 흐름을 안내합니다.'],
  ['취소나 환불은 어떻게 되나요?', '모임 시작 7일 전까지는 전액 취소, 이후에는 준비 비용을 제외한 기준으로 안내합니다.'],
];

const filters = {
  all: () => true,
  regular: (item) => item.type === 'regular',
  event: (item) => item.type === 'event',
  social: (item) => item.type === 'social',
  waitlist: () => false,
};

const gridEl = document.querySelector('[data-meetup-grid]');
const eventListEl = document.querySelector('[data-event-list]');
const railEl = document.querySelector('[data-waitlist-rail]');
const smallGroupListEl = document.querySelector('[data-small-group-list]');
const resultCountEl = document.querySelector('[data-result-count]');
const searchInput = document.querySelector('[data-search]');
const filterButtons = document.querySelectorAll('[data-filter]');
const drawer = document.querySelector('[data-drawer]');
const drawerContent = document.querySelector('[data-drawer-content]');
const checkoutModal = document.querySelector('[data-checkout-modal]');
const checkoutContent = document.querySelector('[data-checkout-content]');
const toast = document.querySelector('[data-toast]');
const loadRetryEl = document.querySelector('[data-load-retry]');
const loadRetryMessageEl = document.querySelector('[data-load-retry-message]');
const loadRetryButton = document.querySelector('[data-load-retry-button]');
const header = document.querySelector('[data-header]');
const mobileNavLinks = document.querySelectorAll('[data-mobile-nav]');
const mobileNavSectionIds = ['meetups', 'waitlist', 'events'];
const saved = readPublicStringSet('momentclub:saved');
const notified = readPublicStringSet('momentclub:notified');
const paid = readPublicStringSet('momentclub:paid');
const pushOptedIn = readPublicStringSet('momentclub:push-optin');
const applicationTokens = readPublicStringMap('momentclub:application-tokens');

function getApplicationToken(meetupId) {
  return applicationTokens.get(meetupId) || '';
}

function hasStoredApplication(meetupId) {
  return Boolean(getApplicationToken(meetupId));
}

function setApplicationToken(meetupId, token) {
  if (!meetupId || !token) return;
  applicationTokens.set(meetupId, token);
  persistPublicStringMap('momentclub:application-tokens', applicationTokens);
}

function clearApplicationToken(meetupId) {
  if (!applicationTokens.delete(meetupId)) return;
  persistPublicStringMap('momentclub:application-tokens', applicationTokens);
}
let activeFilter = 'all';
let checkoutInProgress = false;
let drawerRestoreFocusElement = null;
let checkoutRestoreFocusElement = null;
let mobileNavRaf = 0;

function getTopOpenModal() {
  if (isModalOpen(installGuide)) return installGuide;
  if (isModalOpen(checkoutModal)) return checkoutModal;
  if (isModalOpen(drawer)) return drawer;
  return null;
}

const toastQueue = createToastQueue({
  show: (message) => {
    toast.textContent = message;
    toast.classList.add('is-visible');
  },
  hide: () => toast.classList.remove('is-visible'),
});

function showToast(message) {
  toastQueue.push(message);
}

function setActiveMobileNav(sectionId) {
  mobileNavLinks.forEach((link) => {
    const isActive = link.dataset.mobileNav === sectionId;

    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function scrollToMobileNavSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return false;

  section.scrollIntoView({ block: 'start' });
  return true;
}

function syncMobileNavFromHash() {
  const sectionId = window.location.hash.replace('#', '');
  if (!mobileNavSectionIds.includes(sectionId)) return;

  setActiveMobileNav(sectionId);
  scrollToMobileNavSection(sectionId);
  scheduleMobileNavUpdate();
}

function updateMobileNavActiveSection() {
  mobileNavRaf = 0;

  if (!mobileNavLinks.length || window.innerWidth > 720) return;

  const viewportAnchor = Math.min(window.innerHeight * 0.42, 300);
  let activeSectionId = mobileNavSectionIds[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  let sectionAtAnchor = null;

  mobileNavSectionIds.forEach((sectionId) => {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const rect = section.getBoundingClientRect();
    if (!sectionAtAnchor && rect.top <= viewportAnchor && rect.bottom > viewportAnchor) {
      sectionAtAnchor = sectionId;
    }

    const sectionVisible = rect.bottom > 120 && rect.top < window.innerHeight - 120;
    const distance = Math.abs(rect.top - viewportAnchor);

    if (sectionVisible && distance < closestDistance) {
      closestDistance = distance;
      activeSectionId = sectionId;
    }
  });

  setActiveMobileNav(sectionAtAnchor || activeSectionId);
}

function scheduleMobileNavUpdate() {
  if (mobileNavRaf) return;
  mobileNavRaf = requestAnimationFrame(updateMobileNavActiveSection);
}

function setFormPending(form, isPending) {
  form.querySelectorAll('input, button').forEach((element) => {
    element.disabled = isPending;
  });
}

function setCheckoutStatus(form, message, tone = '') {
  const status = form.querySelector('[data-checkout-status]');
  if (!status) return;

  status.textContent = message;
  status.dataset.tone = tone;
}











function getVisibleMeetups() {
  const query = searchInput.value.trim();
  return meetups.filter((item) => filters[activeFilter](item) && matchesSearch(item, query));
}


function renderMeetups() {
  const visible = getVisibleMeetups();
  resultCountEl.textContent = `${visible.length}개 모임`;

  if (!visible.length) {
    gridEl.innerHTML = `
      <div class="empty-state">
        <h3>조건에 맞는 모임이 없어요</h3>
        <p>검색어를 줄이거나 다른 카테고리를 선택해보세요.</p>
      </div>
    `;
    return;
  }

  gridEl.innerHTML = visible
    .map(
      (item) => `
        <article class="meetup-card">
          <figure>
            <img src="${escapeImageUrl(item.image)}" alt="${escapeAttribute(item.title)}" loading="lazy" decoding="async" />
            <span class="status-badge ${getStatusClass(item)}">${escapeHtml(getRegistrationStatusLabel(item))}</span>
            <button
              class="save-button ${saved.has(item.id) ? 'is-saved' : ''}"
              type="button"
              aria-label="${escapeAttribute(item.title)} 저장"
              data-save="${escapeAttribute(item.id)}"
            >
              ${saved.has(item.id) ? '●' : '○'}
            </button>
          </figure>
          <div class="card-body">
            <div class="meta-line">
              <span>${escapeHtml(item.category)}</span>
              <span class="dot" aria-hidden="true"></span>
              <span>${item.type === 'event' ? '원데이' : item.type === 'social' ? '친목' : '정기 모임'}</span>
            </div>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="card-desc">${escapeHtml(item.desc)}</p>
            <p class="host-line">${escapeHtml(item.host)} · ${escapeHtml(item.hostRole)}</p>
            <div class="tag-row">${createTagMarkup(item.tags)}</div>
            <div class="card-footer">
              <div class="date-place">${escapeHtml(item.date)} · ${escapeHtml(item.time)}<br />${escapeHtml(item.location)}</div>
              <strong class="price-chip">${escapeHtml(item.price)}</strong>
              <button class="detail-button" type="button" data-detail="${escapeAttribute(item.id)}">보기</button>
            </div>
          </div>
        </article>
      `,
    )
    .join('');
}

function renderWaitlist() {
  railEl.innerHTML = waitlistItems
    .map(
      (item) => `
        <article class="rail-card">
          <figure>
            <img src="${escapeImageUrl(item.image)}" alt="${escapeAttribute(item.title)}" loading="lazy" decoding="async" />
          </figure>
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>지금 ${escapeHtml(item.count)}명이 기다려요</p>
            <button
              class="notify-button ${notified.has(item.id) ? 'is-on' : ''}"
              type="button"
              data-notify="${escapeAttribute(item.id)}"
            >
              ${notified.has(item.id) ? '알림 신청됨' : '오픈 알림 받기'}
            </button>
          </div>
        </article>
      `,
    )
    .join('');
}

function renderEvents() {
  eventListEl.innerHTML = meetups
    .filter((item) => item.type === 'event' || item.type === 'social')
    .slice(0, 5)
    .map(
      (item) => `
        <article class="event-row">
          <div class="event-thumb">
            <img src="${escapeImageUrl(item.image)}" alt="${escapeAttribute(item.title)}" loading="lazy" decoding="async" />
          </div>
          <div class="event-info">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.date)} · ${escapeHtml(item.time)} · ${escapeHtml(item.location)}</p>
          </div>
          <button class="event-button" type="button" data-detail="${escapeAttribute(item.id)}">보기</button>
        </article>
      `,
    )
    .join('');
}

function renderSmallGroups() {
  smallGroupListEl.innerHTML = meetups
    .filter((item) => item.type === 'social')
    .map(
      (item) => `
        <article class="mini-card">
          <img src="${escapeImageUrl(item.image)}" alt="${escapeAttribute(item.title)}" loading="lazy" decoding="async" />
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.date)} · ${escapeHtml(item.location)}</p>
            <button type="button" data-detail="${escapeAttribute(item.id)}">보기</button>
          </div>
        </article>
      `,
    )
    .join('');
}

function showLoadRetryNotice(message) {
  if (!loadRetryEl) return;
  if (loadRetryMessageEl) loadRetryMessageEl.textContent = message;
  loadRetryEl.hidden = false;
}

function hideLoadRetryNotice() {
  if (loadRetryEl) loadRetryEl.hidden = true;
}

async function loadMeetupsFromDatabase() {
  if (!isSupabaseConfigured()) return;

  hideLoadRetryNotice();

  try {
    const [meetupsResult, availabilityResult] = await Promise.allSettled([
      fetchPublishedMeetups(),
      fetchPublicMeetupAvailability(),
    ]);

    if (meetupsResult.status !== 'fulfilled') {
      throw meetupsResult.reason;
    }

    const { rows } = meetupsResult.value;
    if (!rows.length) {
      meetups = mergeMeetupAvailability(fallbackMeetups, [], { requireAvailability: true });
      renderMeetups();
      renderEvents();
      renderSmallGroups();
      showToast('DB 모임 목록이 비어 있어 신청과 결제를 잠시 막았어요.');
      return;
    }

    const availabilityRows = availabilityResult.status === 'fulfilled'
      ? availabilityResult.value.rows
      : [];

    meetups = sortMeetupsByFallbackOrder(
      mergeMeetupAvailability(rows.map(normalizeMeetup), availabilityRows, { requireAvailability: true }),
    );
    window.__momentclubDataSource = 'supabase';
    document.documentElement.dataset.meetupSource = 'supabase';
    renderMeetups();
    renderEvents();
    renderSmallGroups();
    syncMobileNavFromHash();

    if (availabilityResult.status !== 'fulfilled') {
      console.error(availabilityResult.reason);
      showToast('잔여석 상태를 확인하지 못해 신청과 결제를 잠시 막았어요.');
      showLoadRetryNotice('잔여석 상태를 확인하지 못해 신청과 결제를 잠시 막았습니다. 다시 불러오면 풀릴 수 있어요.');
    }
  } catch (error) {
    console.error(error);
    window.__momentclubDataSource = 'fallback';
    document.documentElement.dataset.meetupSource = 'fallback';
    meetups = mergeMeetupAvailability(fallbackMeetups, [], { requireAvailability: true });
    renderMeetups();
    renderEvents();
    renderSmallGroups();
    showToast('DB 모임 목록을 불러오지 못해 신청과 결제를 잠시 막았어요.');
    showLoadRetryNotice('모임 목록을 불러오지 못해 신청과 결제를 잠시 막았습니다.');
  }
}

loadRetryButton?.addEventListener('click', async () => {
  loadRetryButton.disabled = true;
  showToast('모임 정보를 다시 불러오는 중입니다.');

  try {
    await loadMeetupsFromDatabase();
  } finally {
    loadRetryButton.disabled = false;
  }
});

function buildApplicationFormMarkup(item) {
  const nameId = createFieldId('application', item.id, 'name');
  const nameHelpId = createFieldId(nameId, 'help');
  const emailId = createFieldId('application', item.id, 'email');
  const emailHelpId = createFieldId(emailId, 'help');
  const interestId = createFieldId('application', item.id, 'interest');
  const interestHelpId = createFieldId(interestId, 'help');

  return `
    <form class="application-form" data-application-form="${escapeAttribute(item.id)}">
      <label class="field-group" for="${escapeAttribute(nameId)}">
        <span>이름</span>
        <input
          id="${escapeAttribute(nameId)}"
          name="name"
          type="text"
          autocomplete="name"
          aria-describedby="${escapeAttribute(nameHelpId)}"
          required
        />
      </label>
      <p class="form-helper" id="${escapeAttribute(nameHelpId)}">신청 확인에 사용할 이름을 적어주세요.</p>
      <label class="field-group" for="${escapeAttribute(emailId)}">
        <span>이메일</span>
        <input
          id="${escapeAttribute(emailId)}"
          name="email"
          type="email"
          autocomplete="email"
          inputmode="email"
          aria-describedby="${escapeAttribute(emailHelpId)}"
          required
        />
      </label>
      <p class="form-helper" id="${escapeAttribute(emailHelpId)}">신청 확인과 모임 안내에만 사용해요. 어느 기기에서든 이 이메일로 내 신청 이력을 확인할 수 있어요.</p>
      <label class="field-group" for="${escapeAttribute(interestId)}">
        <span>이 모임에 끌린 이유</span>
        <input
          id="${escapeAttribute(interestId)}"
          name="interest"
          type="text"
          aria-describedby="${escapeAttribute(interestHelpId)}"
          required
        />
      </label>
      <p class="form-helper" id="${escapeAttribute(interestHelpId)}">모임에 끌린 이유를 한 줄로 적어주세요.</p>
      <button class="drawer-cta apply-submit" type="submit">신청서 제출하기</button>
    </form>
  `;
}

function buildPaymentSummaryMarkup(item, actionState) {
  return `
    <section class="${escapeAttribute(actionState.paymentSummaryClass)}" aria-label="결제 요약">
      <div>
        <span>${escapeHtml(actionState.paymentSummaryLabel)}</span>
        <strong>${escapeHtml(actionState.paymentSummaryTitle)}</strong>
        <p>${escapeHtml(actionState.paymentSummaryDescription)}</p>
      </div>
      <button
        class="drawer-pay-button"
        type="button"
        data-checkout="${escapeAttribute(item.id)}"
        ${actionState.paymentButtonDisabled ? 'disabled' : ''}
      >
        ${escapeHtml(actionState.paymentButtonText)}
      </button>
    </section>
  `;
}

// Renders the apply→pay area as a guided two-step flow. Before an application
// exists the payment step is visibly locked; after submission step 1 collapses
// to a completed state and the payment step activates.
function buildApplyFlow(item) {
  const isPaid = paid.has(item.id);
  const hasApplication = hasStoredApplication(item.id);
  const actionState = getPublicMeetupActionState(item, { isPaid, hasApplication });

  if (!actionState.canRegister) {
    return `
      <div class="registration-closed-note" role="status">
        <strong>${escapeHtml(actionState.registrationLabel)}</strong>
        <p>${escapeHtml(actionState.registrationDescription)}</p>
      </div>
    `;
  }

  const applied = hasApplication || isPaid;

  const step1 = applied
    ? `
      <li class="apply-step is-done" data-apply-step="1">
        <div class="apply-step-head">
          <span class="apply-step-num is-check" aria-hidden="true">✓</span>
          <h4>신청 완료</h4>
        </div>
        <p class="apply-step-note">신청이 접수되어 확인 메일을 보냈어요. 아래에서 결제를 마치면 신청이 확정됩니다.</p>
        <div class="push-optin" data-push-optin="${escapeAttribute(item.id)}" hidden></div>
      </li>
    `
    : `
      <li class="apply-step is-active" data-apply-step="1">
        <div class="apply-step-head">
          <span class="apply-step-num" aria-hidden="true">1</span>
          <h4>신청서 작성</h4>
        </div>
        ${buildApplicationFormMarkup(item)}
      </li>
    `;

  const step2 = applied
    ? `
      <li class="apply-step is-active" data-apply-step="2">
        <div class="apply-step-head">
          <span class="apply-step-num" aria-hidden="true">2</span>
          <h4>결제</h4>
        </div>
        ${buildPaymentSummaryMarkup(item, actionState)}
      </li>
    `
    : `
      <li class="apply-step is-locked" data-apply-step="2">
        <div class="apply-step-head">
          <span class="apply-step-num" aria-hidden="true">2</span>
          <h4>결제</h4>
        </div>
        <p class="apply-lock-note">신청서를 먼저 제출하면 결제를 진행할 수 있어요.</p>
      </li>
    `;

  return `<ol class="apply-steps">${step1}${step2}</ol>`;
}

function refreshApplyFlow(item, { focusPayment = false } = {}) {
  if (!isModalOpen(drawer)) return;

  const section = drawerContent.querySelector('.drawer-apply-flow');
  if (!section) return;

  section.innerHTML = `<h3>신청과 결제</h3>${buildApplyFlow(item)}`;
  renderPushOptIn(item);

  if (focusPayment) {
    const paymentStep = section.querySelector('[data-apply-step="2"]');
    paymentStep?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    paymentStep?.querySelector('.drawer-pay-button:not([disabled])')?.focus({ preventScroll: true });
  }
}

function openDrawer(itemId, opener = document.activeElement) {
  const item = meetups.find((meetup) => meetup.id === itemId);
  if (!item) return;
  const restoreFocusTarget = isModalOpen(drawer) && drawer.contains(opener)
    ? drawerRestoreFocusElement
    : opener;
  const recommendations = meetups.filter((meetup) => meetup.id !== item.id).slice(0, 2);
  const isPaid = paid.has(item.id);
  const actionState = getPublicMeetupActionState(item, { isPaid, hasApplication: hasStoredApplication(item.id) });
  const { registrationLabel } = actionState;
  const scheduleMarkup = item.schedule.length
    ? `
      <section class="drawer-section">
        <h3>시즌 흐름</h3>
        <div class="schedule-note">${escapeHtml(item.schedule.join('\n'))}</div>
      </section>
    `
    : '';
  drawerContent.innerHTML = `
    <div class="drawer-hero">
      <img src="${escapeImageUrl(item.image)}" alt="${escapeAttribute(item.title)}" />
    </div>
    <div class="drawer-content">
      <p class="drawer-kicker">${escapeHtml(item.category)} · ${escapeHtml(registrationLabel)}</p>
      <h2 id="drawerTitle">${escapeHtml(item.title)}</h2>
      <p class="drawer-desc">${escapeHtml(item.desc)}</p>

      <div class="drawer-meta">
        <div>
          <span>일정</span>
          <strong>${escapeHtml(item.date)} · ${escapeHtml(item.time)}</strong>
        </div>
        <div>
          <span>장소</span>
          <strong>${escapeHtml(item.location)}</strong>
        </div>
        <div>
          <span>여는이</span>
          <strong>${escapeHtml(item.host)} · ${escapeHtml(item.hostRole)}</strong>
        </div>
        <div>
          <span>참가비</span>
          <strong>${escapeHtml(item.price)}</strong>
        </div>
      </div>

      <div class="tag-row">${createTagMarkup(item.tags)}</div>

      <section class="drawer-section drawer-apply-flow" aria-label="신청과 결제">
        <h3>신청과 결제</h3>
        ${buildApplyFlow(item)}
      </section>

      ${scheduleMarkup}

      <section class="drawer-section">
        <h3>자주 묻는 질문</h3>
        <ul class="faq-list">
          ${detailFaqs.map(([question, answer]) => `<li><strong>${escapeHtml(question)}</strong>${escapeHtml(answer)}</li>`).join('')}
        </ul>
      </section>

      <section class="drawer-section">
        <h3>비슷한 모임</h3>
        <div class="recommend-row">
          ${recommendations.map((meetup) => `<button type="button" data-detail="${escapeAttribute(meetup.id)}">${escapeHtml(meetup.title)}</button>`).join('')}
        </div>
      </section>
    </div>
  `;

  drawerRestoreFocusElement = openModal(drawer, 'drawer-open', restoreFocusTarget, 'input[name="name"]');
  renderPushOptIn(item);
}

function renderPushOptIn(item) {
  if (!isModalOpen(drawer)) return;

  const container = drawerContent.querySelector(`[data-push-optin="${CSS.escape(item.id)}"]`);
  if (!container) return;

  const state = getPushOptInState({
    supported: isPushSupported(),
    hasToken: hasStoredApplication(item.id),
    permission: typeof Notification === 'undefined' ? 'default' : Notification.permission,
    subscribed: pushOptedIn.has(item.id),
  });

  if (state.mode === 'hidden') {
    container.hidden = true;
    container.textContent = '';
    return;
  }

  container.hidden = false;

  if (state.mode === 'button' || state.mode === 'done') {
    const checkboxId = createFieldId('push-optin', item.id, 'checkbox');
    const isDone = state.mode === 'done';

    container.innerHTML = `
      <label class="push-optin-toggle" for="${escapeAttribute(checkboxId)}">
        <input
          id="${escapeAttribute(checkboxId)}"
          type="checkbox"
          data-push-optin-checkbox="${escapeAttribute(item.id)}"
          ${isDone ? 'checked disabled' : ''}
        />
        <span>${escapeHtml(isDone ? state.message : state.label)}</span>
      </label>
      ${isDone ? '' : '<p class="push-optin-helper">신청이 승인되면 푸시 알림으로 바로 알려드려요.</p>'}
    `;
    return;
  }

  if (state.mode === 'install-hint') {
    container.innerHTML = `
      <div class="push-install-hint">
        <p>${escapeHtml(state.message)}</p>
        <button type="button" class="ghost-button" data-install-action>홈 화면에 추가하기</button>
      </div>
    `;
    return;
  }

  container.textContent = state.message;
}

async function subscribeToApprovalPush(item, control) {
  control.disabled = true;

  try {
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      renderPushOptIn(item);
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription()
      || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKeyToUint8Array(PUSH_APPLICATION_SERVER_KEY),
      });
    const payload = createPushRegistrationPayload({
      meetupId: item.id,
      applicationToken: getApplicationToken(item.id),
      subscription,
    });

    if (!payload) {
      showToast('알림 구독 정보를 만들지 못했어요. 잠시 후 다시 시도해주세요.');
      return;
    }

    await registerPushSubscription(payload);
    pushOptedIn.add(item.id);
    persist('momentclub:push-optin', pushOptedIn);
    showToast('승인되면 알림으로 알려드릴게요.');
  } catch (error) {
    console.error(error);
    showToast('알림 신청에 실패했어요. 잠시 후 다시 시도해주세요.');
  } finally {
    control.disabled = false;
    renderPushOptIn(item);
  }
}

function closeDrawer({ restoreFocus = true } = {}) {
  if (isModalOpen(checkoutModal)) {
    closeCheckout({ restoreFocus: false });
  }

  closeModal(drawer, 'drawer-open', drawerRestoreFocusElement, restoreFocus);
  drawerRestoreFocusElement = null;
}

function focusDrawerApplicationForm(itemId, opener = document.activeElement) {
  const applicationForm = isModalOpen(drawer)
    ? drawerContent.querySelector('form[data-application-form]')
    : null;

  if (applicationForm?.dataset.applicationForm === itemId) {
    applicationForm.querySelector('input[name="name"]')?.focus();
    return;
  }

  openDrawer(itemId, opener);
}

function openCheckout(itemId, opener = document.activeElement) {
  if (checkoutInProgress) {
    showToast('이미 결제를 진행하고 있어요. 잠시만 기다려주세요.');
    return;
  }

  const item = meetups.find((meetup) => meetup.id === itemId);
  if (!item) return;

  const actionState = getPublicMeetupActionState(item, { isPaid: paid.has(item.id), hasApplication: hasStoredApplication(item.id) });
  if (actionState.blockReason) {
    showToast(actionState.blockReason);
    return;
  }

  if (actionState.requiresApplication) {
    showToast(actionState.paymentSummaryDescription);
    focusDrawerApplicationForm(itemId, opener);
    return;
  }

  const tossConfigured = isTossConfigured();
  const checkoutPayerId = createFieldId('checkout', item.id, 'payer');
  const checkoutPayerHelpId = createFieldId(checkoutPayerId, 'help');

  if (tossConfigured) {
    ensureTossSdkScript().catch((error) => {
      console.error(error);
    });
  }

  checkoutContent.innerHTML = `
    <div class="checkout-content">
      <p class="checkout-kicker">${tossConfigured ? 'TOSS TEST CHECKOUT' : 'DEMO CHECKOUT'}</p>
      <h2 id="checkoutTitle">결제하기</h2>
      <p class="checkout-desc">
        ${
          tossConfigured
            ? '토스페이먼츠 테스트 결제창을 열고 Supabase 승인 함수까지 이어지는 흐름을 확인합니다.'
            : '토스 테스트 키가 없어서 결제창 없이 화면 확인용 데모 결제로 진행합니다.'
        }
      </p>

      <div class="checkout-ticket">
        <span>선택한 모임</span>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.date)} · ${escapeHtml(item.location)}</p>
      </div>

      <dl class="checkout-breakdown">
        <div>
          <dt>참가비</dt>
          <dd>${escapeHtml(item.price)}</dd>
        </div>
        <div>
          <dt>플랫폼 수수료</dt>
          <dd>0원</dd>
        </div>
        <div class="is-total">
          <dt>결제 예정 금액</dt>
          <dd>${escapeHtml(item.price)}</dd>
        </div>
      </dl>

      <form class="checkout-form" data-checkout-form="${escapeAttribute(item.id)}">
        <label class="field-group" for="${escapeAttribute(checkoutPayerId)}">
          <span>결제자 이름 (선택)</span>
          <input
            id="${escapeAttribute(checkoutPayerId)}"
            name="payer"
            type="text"
            autocomplete="name"
            placeholder="입력하지 않아도 괜찮아요"
            aria-describedby="${escapeAttribute(checkoutPayerHelpId)}"
          />
        </label>
        <p class="form-helper" id="${escapeAttribute(checkoutPayerHelpId)}">비워두어도 결제를 진행할 수 있습니다.</p>
        <fieldset>
          <legend>결제 수단</legend>
          <label><input type="radio" name="method" value="간편결제" checked /> 간편결제</label>
          <label><input type="radio" name="method" value="카드" /> 카드</label>
          <label><input type="radio" name="method" value="계좌이체" /> 계좌이체</label>
        </fieldset>
        <p class="checkout-note">
          ${
            tossConfigured
              ? '테스트 결제는 실제 출금되지 않으며, 인증 후 Supabase Edge Function이 승인 API를 호출합니다.'
              : '토스 개발자센터에서 받은 test_ 클라이언트 키를 toss-config.js에 넣으면 테스트 결제창이 열립니다.'
          }
        </p>
        <p class="checkout-status" data-checkout-status aria-live="polite"></p>
        <button class="checkout-submit" type="submit">
          ${tossConfigured ? '토스 테스트 결제 열기' : '데모 결제 표시하기'}
        </button>
      </form>
    </div>
  `;

  checkoutRestoreFocusElement = openModal(checkoutModal, 'checkout-open', opener, 'input[name="payer"]');
}

function closeCheckout({ restoreFocus = true } = {}) {
  closeModal(checkoutModal, 'checkout-open', checkoutRestoreFocusElement, restoreFocus);
  checkoutRestoreFocusElement = null;
}

async function completeCheckout(itemId, form) {
  const item = meetups.find((meetup) => meetup.id === itemId);
  if (!item) return;

  const actionState = getPublicMeetupActionState(item, { isPaid: paid.has(item.id), hasApplication: hasStoredApplication(item.id) });
  if (actionState.blockReason) {
    setCheckoutStatus(form, actionState.blockReason, 'error');
    showToast(actionState.blockReason);
    return;
  }

  if (checkoutInProgress) {
    setCheckoutStatus(form, '이미 결제창을 준비하고 있습니다.', 'warning');
    return;
  }

  const formData = new FormData(form);
  const { payerName, paymentMethod } = createPublicCheckoutPayload(formData);
  const tossConfigured = isTossConfigured();
  let shouldUnlockForm = true;

  checkoutInProgress = true;
  setCheckoutStatus(form, '결제를 준비하는 중입니다.');
  setFormPending(form, true);

  try {
    if (tossConfigured) {
      const providerOrderId = createSafeRandomId('mc_order');
      const checkoutToken = createSafeRandomId('mc_checkout');
      setCheckoutStatus(form, '토스 결제창을 준비하는 중입니다.');
      const payment = await getTossPayment();
      const paymentOptions = getTossMethod(paymentMethod);

      setCheckoutStatus(form, '주문 정보를 저장하는 중입니다.');
      await createTossPendingOrder({
        meetup: item,
        payerName,
        paymentMethod,
        providerOrderId,
        checkoutToken,
        applicationToken: getApplicationToken(item.id),
      });

      setCheckoutStatus(form, '토스 결제창으로 이동하는 중입니다.');
      const requestPaymentPromise = payment.requestPayment({
        ...paymentOptions,
        amount: {
          currency: 'KRW',
          value: getAmountFromMeetup(item),
        },
        orderId: providerOrderId,
        orderName: item.title.slice(0, 100),
        successUrl: getPaymentResultUrl('success'),
        failUrl: getPaymentFailUrl(checkoutToken),
        customerName: payerName.trim() || undefined,
      });
      setCheckoutStatus(form, '토스 결제창을 요청했습니다. 창이 열리지 않으면 다시 눌러주세요.');
      shouldUnlockForm = false;
      Promise.resolve(requestPaymentPromise).catch(async (error) => {
        console.error(error);
        const errorMessage = error?.message || '토스 결제창을 열지 못했습니다.';

        checkoutInProgress = false;
        setFormPending(form, false);
        setCheckoutStatus(form, errorMessage, 'error');
        showToast(errorMessage);

        try {
          await recordTossPaymentFailure({
            orderId: providerOrderId,
            checkoutToken,
            code: getPaymentErrorCode(error),
            message: errorMessage,
          });
        } catch (syncError) {
          console.error(syncError);
        }
      });
      return;
    }

    await createDemoOrder({
      meetup: item,
      payerName,
      paymentMethod,
      applicationToken: getApplicationToken(item.id),
    });
    paid.add(itemId);
    persist('momentclub:paid', paid);
    closeCheckout({ restoreFocus: false });
    openDrawer(itemId);
    showToast(`${item.title} 데모 결제 표시를 저장했어요.`);
  } catch (error) {
    console.error(error);

    if (error?.code === 'APPLICATION_NOT_FOUND') {
      clearApplicationToken(item.id);
      refreshApplyFlow(item);
      const message = '신청 내역을 찾지 못했어요. 신청서를 다시 제출한 뒤 결제해주세요.';
      setCheckoutStatus(form, message, 'error');
      showToast(message);
      return;
    }

    setCheckoutStatus(form, error?.message || '결제를 다시 시도해주세요.', 'error');
    showToast(error?.message || '결제 기록 저장에 실패했어요. 잠시 후 다시 시도해주세요.');
  } finally {
    if (shouldUnlockForm) {
      checkoutInProgress = false;
      setFormPending(form, false);
    }
  }
}

async function submitApplication(form) {
  const item = meetups.find((meetup) => meetup.id === form.dataset.applicationForm);
  if (!item) return;

  const actionState = getPublicMeetupActionState(item, { hasApplication: hasStoredApplication(item.id) });
  if (actionState.blockReason) {
    showToast(actionState.blockReason);
    return;
  }

  const formData = new FormData(form);
  const { name, interest, email } = createPublicApplicationPayload(formData);

  setFormPending(form, true);

  try {
    const { skipped, rows } = await createApplication({ meetup: item, name, interest, email });
    const confirmationToken = rows?.[0]?.confirmation_token || '';
    setApplicationToken(item.id, confirmationToken);
    form.reset();

    if (!skipped && !confirmationToken) {
      console.warn('createApplication returned no confirmation_token; checkout stays gated.');
      refreshApplyFlow(item);
      showToast('신청서는 저장됐지만 결제 연결 정보를 받지 못했어요. 새로고침 후 다시 신청해주세요.');
      return;
    }

    refreshApplyFlow(item, { focusPayment: true });

    showToast(
      isSupabaseConfigured()
        ? `${item.title} 신청서를 저장했어요.`
        : `${item.title} 신청서가 임시 제출됐어요.`,
    );
  } catch (error) {
    console.error(error);
    showToast('신청서 저장에 실패했어요. 잠시 후 다시 시도해주세요.');
  } finally {
    setFormPending(form, false);
  }
}

function setFilter(filter) {
  activeFilter = filter;
  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === filter;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  renderMeetups();
}

function openApplyPrompt(opener = document.activeElement) {
  const first = getVisibleMeetups()[0] || meetups[0];
  openDrawer(first.id, opener);
  showToast('관심 있는 모임에서 신청서를 작성할 수 있어요.');
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-install-action]')) {
    openInstallFlow();
    return;
  }

  if (event.target.closest('[data-install-dismiss]')) {
    dismissInstallBanner();
    return;
  }

  if (event.target.closest('[data-install-guide-close]')) {
    closeInstallGuide();
    return;
  }

  const checkoutButton = event.target.closest('[data-checkout]');
  if (checkoutButton) {
    openCheckout(checkoutButton.dataset.checkout, checkoutButton);
    return;
  }

  const detailButton = event.target.closest('[data-detail]');
  if (detailButton) {
    openDrawer(detailButton.dataset.detail, detailButton);
    return;
  }

  const saveButton = event.target.closest('[data-save]');
  if (saveButton) {
    const id = saveButton.dataset.save;
    if (saved.has(id)) {
      saved.delete(id);
      showToast('저장을 해제했어요.');
    } else {
      saved.add(id);
      showToast('관심 모임에 저장했어요.');
    }
    persist('momentclub:saved', saved);
    renderMeetups();
    return;
  }

  const notifyButton = event.target.closest('[data-notify]');
  if (notifyButton) {
    const id = notifyButton.dataset.notify;
    if (notified.has(id)) {
      notified.delete(id);
      showToast('오픈 알림을 취소했어요.');
    } else {
      notified.add(id);
      showToast('오픈 알림을 신청했어요.');
    }
    persist('momentclub:notified', notified);
    renderWaitlist();
    return;
  }

  if (event.target.closest('[data-close-drawer]')) {
    closeDrawer();
    return;
  }

  if (event.target.closest('[data-close-checkout]')) {
    closeCheckout();
    return;
  }

  if (event.target.closest('[data-open-apply]')) {
    openApplyPrompt(event.target.closest('[data-open-apply]'));
    return;
  }

  if (event.target.closest('[data-show-social]')) {
    setFilter('social');
    document.querySelector('#meetups')?.scrollIntoView({ block: 'start' });
    setActiveMobileNav('meetups');
  }
});

document.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-push-optin-checkbox]');
  if (!checkbox || !checkbox.checked) return;

  const item = meetups.find((meetup) => meetup.id === checkbox.dataset.pushOptinCheckbox);
  if (item) subscribeToApprovalPush(item, checkbox);
});

document.addEventListener('submit', async (event) => {
  if (event.target.matches('[data-search-form]')) {
    event.preventDefault();
    renderMeetups();
    document.querySelector('#meetups')?.scrollIntoView({ block: 'start' });
    setActiveMobileNav('meetups');
    return;
  }

  if (event.target.matches('[data-application-form]')) {
    event.preventDefault();
    await submitApplication(event.target);
    return;
  }

  if (event.target.matches('[data-checkout-form]')) {
    event.preventDefault();
    await completeCheckout(event.target.dataset.checkoutForm, event.target);
  }
});

searchInput.addEventListener('input', renderMeetups);

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.filter === 'waitlist') {
      document.querySelector('#waitlist')?.scrollIntoView({ block: 'start' });
      setActiveMobileNav('waitlist');
      return;
    }

    setFilter(button.dataset.filter);
    setActiveMobileNav('meetups');
  });
});

mobileNavLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    const sectionId = link.dataset.mobileNav;
    if (!scrollToMobileNavSection(sectionId)) return;

    event.preventDefault();
    setActiveMobileNav(sectionId);

    if (window.history?.pushState) {
      window.history.pushState(null, '', `#${sectionId}`);
    } else {
      window.location.hash = sectionId;
    }

    scheduleMobileNavUpdate();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    const modal = getTopOpenModal();

    if (modal) {
      trapFocus(event, modal);
    }

    return;
  }

  if (event.key === 'Escape') {
    if (isModalOpen(installGuide)) {
      closeInstallGuide();
      return;
    }

    if (isModalOpen(checkoutModal)) {
      closeCheckout();
      return;
    }

    if (isModalOpen(drawer)) {
      closeDrawer();
    }
  }
});

window.addEventListener(
  'scroll',
  () => {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
    scheduleMobileNavUpdate();
  },
  { passive: true },
);

window.addEventListener('hashchange', syncMobileNavFromHash);
window.addEventListener('resize', scheduleMobileNavUpdate);

renderMeetups();
renderWaitlist();
renderEvents();
renderSmallGroups();
loadMeetupsFromDatabase();
syncMobileNavFromHash();
scheduleMobileNavUpdate();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.warn('service worker registration failed', error);
  });
}

let deferredInstallPrompt = null;
const installBanner = document.querySelector('[data-install-banner]');
const installGuide = document.querySelector('[data-install-guide]');

function readInstallDismissed() {
  try {
    return localStorage.getItem('momentclub:install-dismissed') === '1';
  } catch {
    return false;
  }
}

function getInstallMode() {
  return getInstallPromptMode({
    ...detectInstallEnv(),
    dismissed: readInstallDismissed(),
    hasDeferredPrompt: Boolean(deferredInstallPrompt),
  });
}

function refreshInstallBanner() {
  if (!installBanner) return;
  const mode = getInstallMode();
  installBanner.hidden = !(mode === 'native' || mode === 'ios-guide' || mode === 'ios-browser');
}

let installGuideRestoreFocus = null;

function openInstallGuide({ browserOnly = false } = {}) {
  if (!installGuide) return;
  const note = installGuide.querySelector('[data-install-guide-note]');
  if (note) {
    note.textContent = browserOnly
      ? '아이폰에서는 Safari 브라우저에서만 홈 화면에 추가할 수 있어요. Safari로 열어주세요.'
      : '홈 화면 앱에서 열면 신청 승인·환불 알림을 받을 수 있어요.';
  }
  installGuideRestoreFocus = openModal(installGuide, 'install-guide-open', document.activeElement, '.install-guide-close');
}

function closeInstallGuide() {
  if (!installGuide || !isModalOpen(installGuide)) return;
  closeModal(installGuide, 'install-guide-open', installGuideRestoreFocus);
  installGuideRestoreFocus = null;
}

async function openInstallFlow() {
  const mode = getInstallMode();

  if (mode === 'native' && deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch (error) {
      console.warn('install prompt dismissed', error);
    }
    deferredInstallPrompt = null;
    refreshInstallBanner();
    return;
  }

  openInstallGuide({ browserOnly: mode === 'ios-browser' });
}

function dismissInstallBanner() {
  try {
    localStorage.setItem('momentclub:install-dismissed', '1');
  } catch {
    // best effort; the banner still hides for this session
  }
  if (installBanner) installBanner.hidden = true;
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  refreshInstallBanner();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  dismissInstallBanner();
  closeInstallGuide();
});

refreshInstallBanner();
