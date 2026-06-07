import {
  createApplication,
  createDemoOrder,
  fetchPublicMeetupAvailability,
  createTossPendingOrder,
  fetchPublishedMeetups,
  getAmountFromMeetup,
  isSupabaseConfigured,
  recordTossPaymentFailure,
} from './supabase-client.js?v=__ASSET_VERSION__';
import {
  getPaymentButtonTextForMeetup,
  getPublicStatusClass as getStatusClass,
  getRegistrationStatusDescription,
  getRegistrationStatusLabel,
  isRegistrationAvailable,
  mergeMeetupAvailability,
} from './public-availability.js?v=__ASSET_VERSION__';
import {
  createPublicApplicationPayload,
  createPublicCheckoutPayload,
  createPublicFieldId as createFieldId,
} from './public-form.js?v=__ASSET_VERSION__';
import { TOSS_CLIENT_KEY } from './toss-config.js?v=__ASSET_VERSION__';

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

const fallbackMeetups = [
  {
    id: 'salon-night',
    type: 'regular',
    category: '문화',
    title: '토요일 밤의 취향 살롱',
    desc: '좋아하는 영화와 책 한 장면에서 시작해 서로의 생활 감각을 발견하는 4회 모임입니다.',
    host: '이지안',
    hostRole: '문화 기획자',
    status: '4자리 남음',
    date: '6월 13일',
    time: '토요일 19:00',
    location: '성수',
    price: '148,000원',
    tags: ['영화', '책', '대화'],
    image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80',
    schedule: ['취향을 여는 질문', '장면과 문장 나누기', '나만의 큐레이션 만들기', '작은 상영회와 회고'],
  },
  {
    id: 'city-walk',
    type: 'regular',
    category: '라이프',
    title: '서울 골목 산책 기록단',
    desc: '주말마다 다른 동네를 걸으며 사진, 지도, 짧은 글로 도시의 분위기를 수집합니다.',
    host: '문하린',
    hostRole: '로컬 에디터',
    status: '2자리 남음',
    date: '6월 14일',
    time: '일요일 10:30',
    location: '서촌',
    price: '132,000원',
    tags: ['산책', '사진', '기록'],
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
    schedule: ['동네 관찰법', '사진 산책', '기록 편집', '개인 루트 공유'],
  },
  {
    id: 'taste-table',
    type: 'social',
    category: '미식',
    title: '낯선 사람들의 저녁 식탁',
    desc: '한 가지 재료를 주제로 요리와 이야기를 준비해오는 느슨한 포트럭 다이닝입니다.',
    host: '최윤재',
    hostRole: '푸드 큐레이터',
    status: '마감 임박',
    date: '6월 18일',
    time: '목요일 20:00',
    location: '연남',
    price: '42,000원',
    tags: ['포트럭', '대화', '친목'],
    image: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=900&q=80',
    schedule: ['웰컴 테이블', '재료 이야기', '한 접시 소개', '다음 식탁 정하기'],
  },
  {
    id: 'career-lab',
    type: 'regular',
    category: '커리어',
    title: '일하는 나를 다시 설계하는 워크숍',
    desc: '일의 기준, 강점, 협업 방식을 정리하고 다음 분기의 작은 실험을 설계합니다.',
    host: '강서윤',
    hostRole: '조직 코치',
    status: 'NEW',
    date: '6월 20일',
    time: '토요일 14:00',
    location: '강남',
    price: '165,000원',
    tags: ['커리어', '워크숍', '회고'],
    image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80',
    schedule: ['일의 기준 찾기', '강점 인터뷰', '협업 지도', '90일 실험 설계'],
  },
  {
    id: 'music-room',
    type: 'event',
    category: '음악',
    title: '취중 음감회: 조명이 낮아지는 시간',
    desc: '각자 준비한 노래 한 곡을 듣고, 그 음악이 머무는 기억을 천천히 나눕니다.',
    host: '오민준',
    hostRole: '뮤직 라이터',
    status: '6자리 남음',
    date: '6월 21일',
    time: '일요일 19:30',
    location: '합정',
    price: '35,000원',
    tags: ['음악', '원데이', '바'],
    image: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=900&q=80',
    schedule: ['오늘의 플레이리스트', '곡과 기억 소개', '페어 토크', '마지막 신청곡'],
  },
  {
    id: 'writing-studio',
    type: 'regular',
    category: '창작',
    title: '처음 쓰는 짧은 소설 스튜디오',
    desc: '인물, 장면, 갈등을 작게 연습하며 100일 안에 한 편의 짧은 이야기를 완성합니다.',
    host: '박노을',
    hostRole: '소설가',
    status: '1자리 남음',
    date: '6월 27일',
    time: '토요일 15:00',
    location: '망원',
    price: '176,000원',
    tags: ['글쓰기', '창작', '합평'],
    image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80',
    schedule: ['장면의 씨앗', '인물 만들기', '첫 문장과 갈등', '낭독과 퇴고'],
  },
  {
    id: 'gallery-loop',
    type: 'event',
    category: '전시',
    title: '전시 보는 눈을 키우는 오후',
    desc: '작품을 오래 바라보는 방법과 감상 언어를 익히는 소규모 갤러리 투어입니다.',
    host: '정다원',
    hostRole: '독립 큐레이터',
    status: 'NEW',
    date: '6월 28일',
    time: '일요일 13:00',
    location: '삼청',
    price: '39,000원',
    tags: ['전시', '투어', '감상'],
    image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80',
    schedule: ['관람 전 질문', '전시 동선 걷기', '작품 감상 노트', '카페 리뷰'],
  },
  {
    id: 'dating-values',
    type: 'social',
    category: '관계',
    title: '가치관 카드로 시작하는 소개 모임',
    desc: '빠른 자기소개 대신 선택과 이유를 통해 서로의 결을 알아가는 8인 대화 모임입니다.',
    host: '한유리',
    hostRole: '관계 콘텐츠 에디터',
    status: '마감 임박',
    date: '7월 1일',
    time: '수요일 20:00',
    location: '을지로',
    price: '49,000원',
    tags: ['친목', '대화', '가치관'],
    image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80',
    schedule: ['가치관 카드 선택', '페어 대화', '그룹 토크', '애프터 신청'],
  },
];

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
const header = document.querySelector('[data-header]');
const mobileNavLinks = document.querySelectorAll('[data-mobile-nav]');
const mobileNavSectionIds = ['meetups', 'waitlist', 'events'];
const publicStateMaxItems = 100;
const publicStateMaxValueLength = 120;

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
      // Ignore storage cleanup failures so the public page can keep rendering.
    }

    return new Set();
  }
}

const saved = readStringSet('momentclub:saved');
const notified = readStringSet('momentclub:notified');
const paid = readStringSet('momentclub:paid');
const tossCustomerKeyStorage = 'momentclub:toss-customer-key';
const tossSdkUrl = 'https://js.tosspayments.com/v2/standard';
let activeFilter = 'all';
let toastTimer;
let tossSdkScriptPromise;
let tossPaymentPromise;
let checkoutInProgress = false;
let drawerRestoreFocusElement = null;
let checkoutRestoreFocusElement = null;
let mobileNavRaf = 0;

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function persist(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // Saved/notified/paid state is helpful, but it should never block the page.
  }
}

function setInert(element, isInert) {
  if (!element) return;
  element.inert = isInert;

  if (isInert) {
    element.setAttribute('inert', '');
  } else {
    element.removeAttribute('inert');
  }
}

function isModalOpen(modal) {
  return modal && modal.getAttribute('aria-hidden') === 'false';
}

function getFocusableElements(container) {
  return [...container.querySelectorAll(focusableSelector)].filter((element) => {
    if (element.disabled || element.getAttribute('aria-hidden') === 'true') return false;
    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  });
}

function focusElement(element) {
  if (!element || !document.contains(element)) return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

function focusFirstInModal(modal, preferredSelector) {
  const preferred = preferredSelector ? modal.querySelector(preferredSelector) : null;
  if (focusElement(preferred)) return;

  const firstFocusable = getFocusableElements(modal)[0];
  if (focusElement(firstFocusable)) return;

  focusElement(modal.querySelector('[role="dialog"]'));
}

function openModal(modal, bodyClass, restoreFocusElement, preferredSelector) {
  modal.hidden = false;
  setInert(modal, false);
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add(bodyClass);
  requestAnimationFrame(() => focusFirstInModal(modal, preferredSelector));

  return restoreFocusElement && document.contains(restoreFocusElement)
    ? restoreFocusElement
    : document.activeElement;
}

function closeModal(modal, bodyClass, restoreFocusElement, shouldRestoreFocus = true) {
  modal.setAttribute('aria-hidden', 'true');
  setInert(modal, true);
  modal.hidden = true;
  document.body.classList.remove(bodyClass);

  if (shouldRestoreFocus && restoreFocusElement) {
    focusElement(restoreFocusElement);
  }
}

function trapFocus(event, modal) {
  const focusableElements = getFocusableElements(modal);

  if (!focusableElements.length) {
    event.preventDefault();
    focusFirstInModal(modal);
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus({ preventScroll: true });
    return;
  }

  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus({ preventScroll: true });
  }
}

function getTopOpenModal() {
  if (isModalOpen(checkoutModal)) return checkoutModal;
  if (isModalOpen(drawer)) return drawer;
  return null;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
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

function getTossClientKey() {
  return String(TOSS_CLIENT_KEY || '').trim();
}

function isTossConfigured() {
  return getTossClientKey().startsWith('test_');
}

function createSafeRandomId(prefix) {
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

function getPaymentResultUrl(result) {
  const url = new URL('./payment-result.html', window.location.href);
  url.searchParams.set('result', result);
  return url.toString();
}

function getPaymentFailUrl(checkoutToken) {
  const url = new URL(getPaymentResultUrl('fail'));
  url.searchParams.set('checkoutToken', checkoutToken);
  return url.toString();
}

function getTossMethod(paymentMethod) {
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

function getPaymentErrorCode(error) {
  return String(error?.code || error?.name || 'PAYMENT_WINDOW_ERROR');
}

function ensureTossSdkScript() {
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

async function getTossPayment() {
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

function createFallbackOrder() {
  return new Map(fallbackMeetups.map((item, index) => [item.id, index]));
}

function formatPrice(amount) {
  return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
}

function normalizePriceLabel(priceLabel, amount) {
  const trimmed = String(priceLabel || '').trim();

  if (!trimmed) {
    return formatPrice(amount);
  }

  if (/^\d+$/.test(trimmed)) {
    return formatPrice(trimmed);
  }

  return trimmed;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function escapeImageUrl(value) {
  return escapeAttribute(isPublicImageUrl(value) ? value : fallbackMeetups[0].image);
}

function isPublicImageUrl(value) {
  const rawValue = String(value || '').trim();

  if (!/^https?:\/\//i.test(rawValue)) {
    return false;
  }

  try {
    const url = new URL(rawValue);
    return Boolean(url.hostname && url.hostname.includes('.'));
  } catch {
    return false;
  }
}

function getCategoryFallbackImage(category) {
  if (category === '음악') {
    return fallbackMeetups.find((item) => item.category === '음악')?.image || fallbackMeetups[0].image;
  }

  return fallbackMeetups[0].image;
}

function normalizeMeetup(row) {
  const fallback = fallbackMeetups.find((item) => item.id === row.id) || fallbackMeetups[0];
  const category = row.category || fallback.category;
  const priceAmount = Number.isFinite(Number(row.price_amount))
    ? Number(row.price_amount)
    : getAmountFromMeetup(fallback);

  return {
    id: row.id,
    type: row.type || fallback.type,
    category,
    title: row.title || fallback.title,
    desc: row.description || fallback.desc,
    host: row.host_name || fallback.host,
    hostRole: row.host_role || fallback.hostRole,
    statusLabel: row.status_label || fallback.status,
    status: row.status_label || fallback.status,
    date: row.date_label || fallback.date,
    time: row.time_label || fallback.time,
    location: row.location || fallback.location,
    priceAmount,
    price: normalizePriceLabel(row.price_label, priceAmount),
    tags: Array.isArray(row.tags) ? row.tags : fallback.tags,
    image: isPublicImageUrl(row.image_url) ? row.image_url : getCategoryFallbackImage(category),
    schedule: Array.isArray(row.schedule) ? row.schedule.filter(Boolean) : fallback.schedule,
    availabilityKnown: null,
    canRegister: true,
    effectiveRegistrationStatus: 'open',
    capacity: null,
    remainingSpots: null,
  };
}

function sortMeetupsByFallbackOrder(items) {
  const order = createFallbackOrder();
  return [...items].sort((a, b) => {
    const orderA = order.get(a.id) ?? 999;
    const orderB = order.get(b.id) ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title, 'ko-KR');
  });
}

function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [
    item.title,
    item.desc,
    item.host,
    item.hostRole,
    item.category,
    item.location,
    ...item.tags,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function getVisibleMeetups() {
  const query = searchInput.value.trim();
  return meetups.filter((item) => filters[activeFilter](item) && matchesSearch(item, query));
}

function createTagMarkup(tags) {
  return tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');
}

function getPaymentButtonText(itemId) {
  const item = meetups.find((meetup) => meetup.id === itemId);
  return getPaymentButtonTextForMeetup(item, { isPaid: paid.has(itemId) });
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

async function loadMeetupsFromDatabase() {
  if (!isSupabaseConfigured()) return;

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
  const canRegister = isRegistrationAvailable(item);
  const registrationLabel = getRegistrationStatusLabel(item);
  const registrationDescription = getRegistrationStatusDescription(item);
  const applicationNameId = createFieldId('application', item.id, 'name');
  const applicationNameHelpId = createFieldId(applicationNameId, 'help');
  const applicationInterestId = createFieldId('application', item.id, 'interest');
  const applicationInterestHelpId = createFieldId(applicationInterestId, 'help');
  const scheduleMarkup = item.schedule.length
    ? `
      <section class="drawer-section">
        <h3>시즌 흐름</h3>
        <div class="schedule-note">${escapeHtml(item.schedule.join('\n'))}</div>
      </section>
    `
    : '';
  const applicationMarkup = canRegister
    ? `
      <form class="application-form" data-application-form="${escapeAttribute(item.id)}">
        <label class="field-group" for="${escapeAttribute(applicationNameId)}">
          <span>이름</span>
          <input
            id="${escapeAttribute(applicationNameId)}"
            name="name"
            type="text"
            autocomplete="name"
            aria-describedby="${escapeAttribute(applicationNameHelpId)}"
            required
          />
        </label>
        <p class="form-helper" id="${escapeAttribute(applicationNameHelpId)}">신청 확인에 사용할 이름을 적어주세요.</p>
        <label class="field-group" for="${escapeAttribute(applicationInterestId)}">
          <span>이 모임에 끌린 이유</span>
          <input
            id="${escapeAttribute(applicationInterestId)}"
            name="interest"
            type="text"
            aria-describedby="${escapeAttribute(applicationInterestHelpId)}"
            required
          />
        </label>
        <p class="form-helper" id="${escapeAttribute(applicationInterestHelpId)}">모임에 끌린 이유를 한 줄로 적어주세요.</p>
        <button class="drawer-cta" type="submit">신청서 제출</button>
      </form>
    `
    : `
      <div class="registration-closed-note" role="status">
        <strong>${escapeHtml(registrationLabel)}</strong>
        <p>${escapeHtml(registrationDescription)}</p>
      </div>
    `;

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

      <section class="payment-summary ${isPaid ? 'is-paid' : ''} ${!canRegister && !isPaid ? 'is-closed' : ''}" aria-label="결제 요약">
        <div>
          <span>${isPaid ? '결제 상태' : canRegister ? '참가비 결제' : '신청 상태'}</span>
          <strong>${isPaid ? '테스트 결제 확인 표시가 있는 모임입니다' : canRegister ? escapeHtml(item.price) : escapeHtml(registrationLabel)}</strong>
          <p>${isPaid ? '이 브라우저에 테스트 결제 확인 표시가 저장되어 있어요.' : canRegister ? '토스 테스트 결제와 서버 승인 흐름을 확인합니다. 실제 출금은 없습니다.' : escapeHtml(registrationDescription)}</p>
        </div>
        <button
          class="drawer-pay-button"
          type="button"
          data-checkout="${escapeAttribute(item.id)}"
          ${isPaid || !canRegister ? 'disabled' : ''}
        >
          ${getPaymentButtonText(item.id)}
        </button>
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
      ${applicationMarkup}
    </div>
  `;

  drawerRestoreFocusElement = openModal(drawer, 'drawer-open', restoreFocusTarget, 'input[name="name"]');
}

function closeDrawer({ restoreFocus = true } = {}) {
  if (isModalOpen(checkoutModal)) {
    closeCheckout({ restoreFocus: false });
  }

  closeModal(drawer, 'drawer-open', drawerRestoreFocusElement, restoreFocus);
  drawerRestoreFocusElement = null;
}

function openCheckout(itemId, opener = document.activeElement) {
  const item = meetups.find((meetup) => meetup.id === itemId);
  if (!item) return;

  if (!isRegistrationAvailable(item)) {
    showToast(getRegistrationStatusDescription(item));
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

  if (!isRegistrationAvailable(item)) {
    setCheckoutStatus(form, getRegistrationStatusDescription(item), 'error');
    showToast(getRegistrationStatusDescription(item));
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

    await createDemoOrder({ meetup: item, payerName, paymentMethod });
    paid.add(itemId);
    persist('momentclub:paid', paid);
    closeCheckout({ restoreFocus: false });
    openDrawer(itemId);
    showToast(`${item.title} 데모 결제 표시를 저장했어요.`);
  } catch (error) {
    console.error(error);
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

  if (!isRegistrationAvailable(item)) {
    showToast(getRegistrationStatusDescription(item));
    return;
  }

  const formData = new FormData(form);
  const { name, interest } = createPublicApplicationPayload(formData);

  setFormPending(form, true);

  try {
    await createApplication({ meetup: item, name, interest });
    form.reset();
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
    if (isModalOpen(checkoutModal)) {
      closeCheckout();
      return;
    }

    if (isModalOpen(drawer)) {
      closeDrawer();
    }
  }
});

window.addEventListener('scroll', () => {
  header.classList.toggle('is-scrolled', window.scrollY > 8);
  scheduleMobileNavUpdate();
});

window.addEventListener('hashchange', syncMobileNavFromHash);
window.addEventListener('resize', scheduleMobileNavUpdate);

renderMeetups();
renderWaitlist();
renderEvents();
renderSmallGroups();
loadMeetupsFromDatabase();
syncMobileNavFromHash();
scheduleMobileNavUpdate();
