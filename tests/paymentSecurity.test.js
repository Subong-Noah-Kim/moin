import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSeatBreakdownText,
  getSeatStatusClass,
  getSeatStatusLabel,
  getSeatSummaryText,
  mergeAdminMeetupAvailability,
} from '../admin-availability.js';
import {
  createAdminMeetupId,
  createAdminMeetupPayload,
  getAdminMeetupImageUrlPayloadValue,
  getCapacityPayloadValue,
  getRegistrationStatusPayloadValue,
  normalizeAdminMeetupPriceLabel,
  splitAdminMeetupList,
} from '../admin-meetup-form.js';
import {
  canManuallyUpdateOrderStatus,
  getAgentStatusLabel,
  getApplicationStatusLabel,
  getApplicationStatusOptions,
  getOrderStatusLabel,
  getOrderStatusOptions,
  getPaymentStatusLabel,
  getStatusClass,
  getTaskStatusLabel,
} from '../admin-status.js';
import {
  getPaymentButtonTextForMeetup,
  getPublicStatusClass,
  getRegistrationBlockReason,
  getRegistrationStatusDescription,
  getRegistrationStatusLabel,
  isRegistrationAvailable,
  mergeMeetupAvailability,
} from '../public-availability.js';
import { getPublicMeetupActionState } from '../public-flow.js';
import {
  createPublicApplicationPayload,
  createPublicCheckoutPayload,
  createPublicFieldId,
} from '../public-form.js';
import {
  persistPublicStringMap,
  persistPublicStringSet,
  publicStateMaxItems,
  publicStateMaxValueLength,
  readPublicStringMap,
  readPublicStringSet,
} from '../public-storage.js';
import {
  createTossAuthSummary,
  formatPaymentResultAmount,
  getConfirmErrorMessage,
  getFailureStatusLabel,
} from '../payment-result-state.js';
import { createToastQueue } from '../toast-queue.js';
import {
  clearAdminSession,
  confirmTossPayment,
  createDemoOrder,
  createTossPendingOrder,
  deleteMeetupImage,
  getAmountFromMeetup,
  getStoredAdminSession,
} from '../supabase-client.js';
import { SUPABASE_URL } from '../supabase-config.js';
import { createPublicAgenticStatus } from '../scripts/create-public-agentic-status.mjs';

const assetVersionPlaceholder = '__ASSET_VERSION__';
const cacheBustedSourceFiles = [
  '../index.html',
  '../admin.html',
  '../admin-availability.js',
  '../admin-meetup-form.js',
  '../admin-status.js',
  '../payment-result.html',
  '../main.js',
  '../modal-manager.js',
  '../toast-queue.js',
  '../toss-checkout.js',
  '../admin.js',
  '../payment-result.js',
  '../payment-result-state.js',
  '../public-availability.js',
  '../public-flow.js',
  '../public-form.js',
  '../public-storage.js',
  '../supabase-client.js',
];

async function readProjectFile(pathname) {
  return readFile(new URL(pathname, import.meta.url), 'utf8');
}

function getAssetVersions(source) {
  return [...source.matchAll(/\?v=([^"'`\s)]+)/g)].map((match) => match[1]);
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, String(value));
    },
    removeItem: (key) => {
      values.delete(key);
    },
    dump: () => Object.fromEntries(values),
  };
}

function createPaymentResultDom() {
  const elements = new Map();
  const selectors = [
    '[data-success-view]',
    '[data-fail-view]',
    '[data-success-title]',
    '[data-success-description]',
    '[data-confirm-status]',
    '[data-fail-sync-status]',
    '[data-order-id]',
    '[data-amount]',
    '[data-error-code]',
    '[data-fail-order-id]',
    '[data-fail-message]',
  ];

  selectors.forEach((selector) => {
    elements.set(selector, {
      hidden: selector === '[data-success-view]' || selector === '[data-fail-view]',
      textContent: '',
      dataset: {},
    });
  });

  return {
    title: 'moin 결제 테스트 결과',
    querySelector: (selector) => elements.get(selector) || null,
    get: (selector) => elements.get(selector),
  };
}

function snapshotGlobals(names) {
  return Object.fromEntries(names.map((name) => [name, globalThis[name]]));
}

function restoreGlobals(snapshot) {
  Object.entries(snapshot).forEach(([name, value]) => {
    if (value === undefined) {
      delete globalThis[name];
    } else {
      globalThis[name] = value;
    }
  });
}

test('payment result state helpers format safe display values', () => {
  assert.equal(formatPaymentResultAmount('39000'), '39,000원');
  assert.equal(formatPaymentResultAmount(148000), '148,000원');
  assert.equal(formatPaymentResultAmount(''), '-');
  assert.equal(formatPaymentResultAmount(0), '-');

  assert.deepEqual(
    createTossAuthSummary(
      { orderId: 'order_123', amount: '39000' },
      new Date('2026-06-07T01:09:29.901Z'),
    ),
    {
      orderId: 'order_123',
      amount: '39000',
      receivedAt: '2026-06-07T01:09:29.901Z',
    },
  );
});

test('payment result state helpers explain confirmation and failure states', () => {
  assert.equal(
    getConfirmErrorMessage(new Error('network request failed')),
    'Supabase Edge Function(confirm-toss-payment) 호출에 실패했습니다. 함수 배포와 CORS 응답을 확인해주세요.',
  );
  assert.equal(
    getConfirmErrorMessage(new Error('Requested function was not found')),
    'Supabase Edge Function(confirm-toss-payment)을 찾지 못했습니다. 함수 배포 상태를 확인해주세요.',
  );
  assert.equal(
    getConfirmErrorMessage(new Error('missing TOSS_SECRET_KEY')),
    '결제 승인 서버 설정을 확인해주세요.',
  );
  assert.equal(
    getConfirmErrorMessage(new Error('unexpected failure')),
    '결제 승인 처리에 실패했습니다. 잠시 후 다시 시도하거나 운영자에게 문의해주세요.',
  );

  assert.equal(getFailureStatusLabel('cancelled'), '취소');
  assert.equal(getFailureStatusLabel('failed'), '실패');
  assert.equal(getFailureStatusLabel('pending_review'), 'pending_review');
  assert.equal(getFailureStatusLabel(''), '실패');
});

const sensitiveAgentStatusKeys = [
  { name: 'access token field', pattern: /^(access[_-]?token|accessToken)$/i },
  { name: 'refresh token field', pattern: /^(refresh[_-]?token|refreshToken)$/i },
  { name: 'payment key field', pattern: /^paymentKey$/i },
  { name: 'checkout token field', pattern: /^checkoutToken$/i },
  { name: 'service role field', pattern: /^(service[_-]?role|serviceRole|serviceRoleKey)$/i },
];

const sensitiveAgentStatusValues = [
  {
    name: 'jwt-like token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: 'bearer token',
    pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i,
  },
  {
    name: 'toss secret key',
    pattern: /\b(?:test|live)_sk_[A-Za-z0-9_=-]{12,}\b/i,
  },
  {
    name: 'checkout token value',
    pattern: /\bmc_checkout_[A-Za-z0-9_-]{12,}\b/,
  },
  {
    name: 'payment key assignment',
    pattern: /\bpaymentKey\s*[:=]\s*["']?[A-Za-z0-9_-]{12,}\b/,
  },
  {
    name: 'checkout token assignment',
    pattern: /\bcheckoutToken\s*[:=]\s*["']?[A-Za-z0-9_-]{12,}\b/,
  },
  {
    name: 'service role assignment',
    pattern: /\b(?:service[_-]?role|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}\b/i,
  },
];

function collectSensitiveAgentStatusFindings(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSensitiveAgentStatusFindings(item, `${path}[${index}]`, findings));
    return findings;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      const keyRule = sensitiveAgentStatusKeys.find((rule) => rule.pattern.test(key));
      const nextPath = `${path}.${key}`;

      if (keyRule) {
        findings.push(`${nextPath}: ${keyRule.name}`);
      }

      collectSensitiveAgentStatusFindings(nested, nextPath, findings);
    });
    return findings;
  }

  if (typeof value === 'string') {
    sensitiveAgentStatusValues.forEach((rule) => {
      if (rule.pattern.test(value)) {
        findings.push(`${path}: ${rule.name}`);
      }
    });
  }

  return findings;
}

test('getAmountFromMeetup prefers numeric price_amount over display price text', () => {
  assert.equal(
    getAmountFromMeetup({
      price_amount: 39000,
      price: '1원',
    }),
    39000,
  );
});

test('getAmountFromMeetup supports normalized camelCase priceAmount', () => {
  assert.equal(
    getAmountFromMeetup({
      priceAmount: 49000,
      price: '무료',
    }),
    49000,
  );
});

test('getAmountFromMeetup falls back to display price for static demo meetups', () => {
  assert.equal(
    getAmountFromMeetup({
      price: '148,000원',
    }),
    148000,
  );
});

test('public availability helpers fail closed when required availability is missing', () => {
  const [meetup] = mergeMeetupAvailability(
    [{ id: 'capacity-audit', status: '4자리 남음', title: 'Capacity Audit' }],
    [],
    { requireAvailability: true },
  );

  assert.equal(meetup.availabilityKnown, false);
  assert.equal(meetup.canRegister, false);
  assert.equal(isRegistrationAvailable(meetup), false);
  assert.equal(getRegistrationBlockReason(meetup), getRegistrationStatusDescription(meetup));
  assert.equal(getRegistrationStatusLabel(meetup), '접수 확인중');
  assert.equal(getPublicStatusClass(meetup), 'is-checking');
  assert.equal(getPaymentButtonTextForMeetup(meetup), '확인중');
  assert.match(getRegistrationStatusDescription(meetup), /신청과 결제를 잠시 막았습니다/);
});

test('public availability helpers map sold-out, closed, and remaining-seat behavior', () => {
  const [soldOut, closed, nearlyFull, open] = mergeMeetupAvailability(
    [
      { id: 'sold-out' },
      { id: 'closed' },
      { id: 'nearly-full' },
      { id: 'open' },
    ],
    [
      {
        meetup_id: 'sold-out',
        capacity: 3,
        remaining_spots: 0,
        effective_registration_status: 'sold_out',
        can_register: false,
      },
      {
        meetup_id: 'closed',
        capacity: null,
        remaining_spots: null,
        effective_registration_status: 'closed',
        can_register: false,
      },
      {
        meetup_id: 'nearly-full',
        capacity: 4,
        remaining_spots: 2,
        effective_registration_status: 'open',
        can_register: true,
      },
      {
        meetup_id: 'open',
        capacity: 10,
        remaining_spots: 5,
        effective_registration_status: 'open',
        can_register: true,
      },
    ],
  );

  assert.equal(isRegistrationAvailable(soldOut), false);
  assert.equal(getRegistrationBlockReason(soldOut), getRegistrationStatusDescription(soldOut));
  assert.equal(getRegistrationStatusLabel(soldOut), '마감');
  assert.equal(getPaymentButtonTextForMeetup(soldOut), '마감');
  assert.match(getRegistrationStatusDescription(soldOut), /정원이 모두 차서/);

  assert.equal(isRegistrationAvailable(closed), false);
  assert.equal(getRegistrationBlockReason(closed), getRegistrationStatusDescription(closed));
  assert.equal(getRegistrationStatusLabel(closed), '신청 종료');
  assert.equal(getPaymentButtonTextForMeetup(closed), '신청 종료');
  assert.match(getRegistrationStatusDescription(closed), /운영자가 접수를 닫아/);

  assert.equal(isRegistrationAvailable(nearlyFull), true);
  assert.equal(getRegistrationBlockReason(nearlyFull), '');
  assert.equal(getRegistrationStatusLabel(nearlyFull), '잔여 2석');
  assert.equal(getPublicStatusClass(nearlyFull), 'is-urgent');
  assert.equal(getPaymentButtonTextForMeetup(nearlyFull, { isPaid: true }), '테스트 결제 완료');

  assert.equal(getRegistrationStatusLabel(open), '잔여 5석');
  assert.equal(getPublicStatusClass(open), 'is-seat');
  assert.equal(getPaymentButtonTextForMeetup(open), '결제하기');
});

test('public flow helper keeps detail, application, and checkout states aligned', () => {
  const [soldOut, closed, open] = mergeMeetupAvailability(
    [
      { id: 'sold-out', title: 'Sold Out Meetup', price: '20,000원' },
      { id: 'closed', title: 'Closed Meetup', price: '30,000원' },
      { id: 'open', title: 'Open Meetup', price: '40,000원' },
    ],
    [
      {
        meetup_id: 'sold-out',
        capacity: 2,
        remaining_spots: 0,
        effective_registration_status: 'sold_out',
        can_register: false,
      },
      {
        meetup_id: 'closed',
        capacity: null,
        remaining_spots: null,
        effective_registration_status: 'closed',
        can_register: false,
      },
      {
        meetup_id: 'open',
        capacity: 5,
        remaining_spots: 3,
        effective_registration_status: 'open',
        can_register: true,
      },
    ],
  );

  const soldOutState = getPublicMeetupActionState(soldOut);
  assert.equal(soldOutState.canSubmitApplication, false);
  assert.equal(soldOutState.canOpenCheckout, false);
  assert.equal(soldOutState.paymentButtonDisabled, true);
  assert.equal(soldOutState.paymentButtonText, '마감');
  assert.equal(soldOutState.paymentSummaryClass, 'payment-summary is-closed');
  assert.equal(soldOutState.paymentSummaryLabel, '신청 상태');
  assert.equal(soldOutState.paymentSummaryTitle, '마감');
  assert.match(soldOutState.blockReason, /정원이 모두 차서/);

  const closedState = getPublicMeetupActionState(closed);
  assert.equal(closedState.canSubmitApplication, false);
  assert.equal(closedState.canOpenCheckout, false);
  assert.equal(closedState.paymentButtonText, '신청 종료');
  assert.match(closedState.blockReason, /운영자가 접수를 닫아/);

  const openState = getPublicMeetupActionState(open);
  assert.equal(openState.canSubmitApplication, true);
  assert.equal(openState.canOpenCheckout, true);
  assert.equal(openState.paymentButtonDisabled, false);
  assert.equal(openState.blockReason, '');
  assert.equal(openState.paymentSummaryClass, 'payment-summary');
  assert.equal(openState.paymentSummaryLabel, '참가비 결제');
  assert.equal(openState.paymentSummaryTitle, '40,000원');
  assert.equal(openState.paymentButtonText, '결제하기');

  const paidState = getPublicMeetupActionState(open, { isPaid: true });
  assert.equal(paidState.canSubmitApplication, true);
  assert.equal(paidState.canOpenCheckout, false);
  assert.equal(paidState.paymentButtonDisabled, true);
  assert.equal(paidState.paymentSummaryClass, 'payment-summary is-paid');
  assert.equal(paidState.paymentButtonText, '테스트 결제 완료');
});

test('public form helpers build stable IDs and normalized payloads', () => {
  const applicationFormData = new FormData();
  applicationFormData.append('name', '  Subong  ');
  applicationFormData.append('interest', '  네트워킹  ');
  const checkoutFormData = new FormData();
  checkoutFormData.append('payer', '  ');
  checkoutFormData.append('method', '  임의값  ');

  assert.equal(createPublicFieldId('application', 'salon-night', 'name'), 'application-salon-night-name');
  assert.equal(createPublicFieldId('checkout', 'Bad <ID>', 'payer help'), 'checkout-bad-id-payer-help');
  assert.equal(createPublicFieldId('신청', '이름'), 'field-field');

  assert.deepEqual(
    createPublicApplicationPayload({
      name: '  Noah  ',
      interest: '  영화와 대화  ',
    }),
    {
      name: 'Noah',
      interest: '영화와 대화',
    },
  );

  assert.deepEqual(
    createPublicApplicationPayload(applicationFormData),
    {
      name: 'Subong',
      interest: '네트워킹',
    },
  );

  assert.deepEqual(
    createPublicCheckoutPayload({
      payer: '  Noah  ',
      method: ' 카드 ',
    }),
    {
      payerName: 'Noah',
      paymentMethod: '카드',
    },
  );
  assert.equal(createPublicCheckoutPayload({ payer: '', method: '간편결제' }).paymentMethod, '간편결제');
  assert.equal(createPublicCheckoutPayload({ payer: '', method: '계좌이체' }).paymentMethod, '계좌이체');

  assert.deepEqual(
    createPublicCheckoutPayload(checkoutFormData),
    {
      payerName: '',
      paymentMethod: '간편결제',
    },
  );

  assert.deepEqual(createPublicCheckoutPayload({ payer: '', method: '' }), {
    payerName: '',
    paymentMethod: '간편결제',
  });
});

test('admin capacity payload helpers normalize operator input', () => {
  assert.equal(getCapacityPayloadValue(''), null);
  assert.equal(getCapacityPayloadValue(' 12 '), 12);
  assert.equal(getRegistrationStatusPayloadValue('closed'), 'closed');
  assert.equal(getRegistrationStatusPayloadValue('sold_out'), 'open');
  assert.equal(getRegistrationStatusPayloadValue('anything-else'), 'open');
  assert.throws(() => getCapacityPayloadValue('0'), /정원은 비워두거나 1명 이상의 정수/);
  assert.throws(() => getCapacityPayloadValue('2.5'), /정원은 비워두거나 1명 이상의 정수/);
});

test('admin meetup form helpers build safe create and update payloads', () => {
  assert.equal(normalizeAdminMeetupPriceLabel('', 39000), '39,000원');
  assert.equal(normalizeAdminMeetupPriceLabel('49000', 0), '49,000원');
  assert.equal(normalizeAdminMeetupPriceLabel('월 2회 멤버십', 39000), '월 2회 멤버십');
  assert.deepEqual(splitAdminMeetupList('독서, 회고\n네트워킹'), ['독서', '회고', '네트워킹']);
  assert.equal(createAdminMeetupId('Sunday Club!', 46655), 'sunday-club-zzz');
  assert.equal(createAdminMeetupId('한글 제목', () => 36), 'meetup-10');
  assert.equal(getAdminMeetupImageUrlPayloadValue(' https://example.com/cover.jpg '), 'https://example.com/cover.jpg');
  assert.equal(getAdminMeetupImageUrlPayloadValue('http://example.com/cover.jpg'), 'http://example.com/cover.jpg');
  assert.equal(getAdminMeetupImageUrlPayloadValue('javascript:alert(1)'), '');
  assert.equal(getAdminMeetupImageUrlPayloadValue('data:image/svg+xml;base64,PHN2Zy8+'), '');
  assert.equal(getAdminMeetupImageUrlPayloadValue('not a url'), '');

  assert.deepEqual(
    createAdminMeetupPayload({
      id: '',
      type: 'social',
      category: ' 커뮤니티 ',
      title: ' Sunday Club ',
      description: ' 같이 읽어요 ',
      host_name: ' Noah ',
      host_role: ' host ',
      status_label: ' NEW ',
      date_label: ' 6월 20일 ',
      time_label: ' 오후 2시 ',
      location: ' 서울 ',
      price_amount: '39000',
      price_label: '',
      capacity: '12',
      registration_status: 'closed',
      close_reason: ' 정원 확인 ',
      tags: '독서, 회고\n네트워킹',
      image_url: ' https://example.com/cover.jpg ',
      schedule: '오프닝\n대화',
      is_published: 'on',
    }, { includeId: true, timestamp: 46655 }),
    {
      id: 'sunday-club-zzz',
      type: 'social',
      category: '커뮤니티',
      title: 'Sunday Club',
      description: '같이 읽어요',
      host_name: 'Noah',
      host_role: 'host',
      status_label: 'NEW',
      date_label: '6월 20일',
      time_label: '오후 2시',
      location: '서울',
      price_amount: 39000,
      price_label: '39,000원',
      capacity: 12,
      registration_status: 'closed',
      close_reason: '정원 확인',
      tags: ['독서', '회고', '네트워킹'],
      image_url: 'https://example.com/cover.jpg',
      schedule: ['오프닝', '대화'],
      is_published: true,
    },
  );

  assert.deepEqual(
    createAdminMeetupPayload({
      id: 'existing-id',
      title: 'Updated',
      price_amount: '0',
      price_label: '무료',
      capacity: '',
      registration_status: 'sold_out',
      close_reason: '남으면 안 됨',
      tags: '',
      schedule: '',
      image_url: '',
    }),
    {
      type: 'regular',
      category: '',
      title: 'Updated',
      description: '',
      host_name: '',
      host_role: '',
      status_label: '',
      date_label: '',
      time_label: '',
      location: '',
      price_amount: 0,
      price_label: '무료',
      capacity: null,
      registration_status: 'open',
      close_reason: null,
      tags: [],
      image_url: '',
      schedule: [],
      is_published: false,
    },
  );

  const browserLikeFormData = new FormData();
  browserLikeFormData.set('title', 'Cinema Night');
  browserLikeFormData.set('price_amount', '49000');
  browserLikeFormData.set('capacity', '4');
  browserLikeFormData.set('registration_status', 'open');
  browserLikeFormData.set('is_published', 'on');

  assert.deepEqual(
    createAdminMeetupPayload(browserLikeFormData, { includeId: true, timestamp: 36 }),
    {
      id: 'cinema-night-10',
      type: 'regular',
      category: '',
      title: 'Cinema Night',
      description: '',
      host_name: '',
      host_role: '',
      status_label: '',
      date_label: '',
      time_label: '',
      location: '',
      price_amount: 49000,
      price_label: '49,000원',
      capacity: 4,
      registration_status: 'open',
      close_reason: null,
      tags: [],
      image_url: '',
      schedule: [],
      is_published: true,
    },
  );
});

test('admin status helpers keep operator labels and manual order actions constrained', () => {
  assert.equal(getApplicationStatusLabel('submitted'), '접수');
  assert.equal(getApplicationStatusLabel('accepted'), '승인');
  assert.equal(getApplicationStatusLabel('unknown_state'), 'unknown_state');
  assert.equal(getApplicationStatusLabel(''), '-');

  assert.deepEqual(getApplicationStatusOptions('reviewing'), [
    { value: 'submitted', label: '접수', selected: false },
    { value: 'reviewing', label: '검토중', selected: true },
    { value: 'accepted', label: '승인', selected: false },
    { value: 'rejected', label: '거절', selected: false },
    { value: 'cancelled', label: '취소', selected: false },
  ]);

  assert.equal(getOrderStatusLabel('pending'), '입금대기');
  assert.equal(getOrderStatusLabel('paid'), '결제완료');
  assert.equal(getOrderStatusLabel('demo_paid'), '데모결제');
  assert.equal(getOrderStatusLabel('chargeback'), 'chargeback');
  assert.deepEqual(getOrderStatusOptions('failed'), [
    { value: 'pending', label: '입금대기', selected: false },
    { value: 'cancelled', label: '취소', selected: false },
    { value: 'failed', label: '실패', selected: true },
  ]);

  assert.equal(canManuallyUpdateOrderStatus('pending'), true);
  assert.equal(canManuallyUpdateOrderStatus('cancelled'), true);
  assert.equal(canManuallyUpdateOrderStatus('failed'), true);
  assert.equal(canManuallyUpdateOrderStatus('paid'), false);
  assert.equal(canManuallyUpdateOrderStatus('demo_paid'), false);

  assert.equal(getPaymentStatusLabel('paid'), '기록 있음');
  assert.equal(getPaymentStatusLabel('refunded'), '환불');
  assert.equal(getPaymentStatusLabel(''), '결제 기록');
  assert.equal(getAgentStatusLabel('running'), '진행중');
  assert.equal(getTaskStatusLabel('done_local'), '로컬 완료');
  assert.equal(getStatusClass('needs review / blocked'), 'needs_review___blocked');
  assert.equal(getStatusClass(''), 'idle');
});

test('admin availability helpers render seat summaries from structured rows', () => {
  const [open, nearlyFull, soldOut, closed, unknown] = mergeAdminMeetupAvailability(
    [
      { id: 'open' },
      { id: 'nearly-full' },
      { id: 'sold-out' },
      { id: 'closed' },
      { id: 'unknown', capacity: 8 },
    ],
    [
      {
        meetup_id: 'open',
        capacity: null,
        remaining_spots: null,
        paid_order_count: 7,
        pending_order_count: 1,
        active_order_count: 8,
        effective_registration_status: 'open',
        can_register: true,
      },
      {
        meetup_id: 'nearly-full',
        capacity: '4',
        remaining_spots: '2',
        paid_order_count: '1',
        pending_order_count: '1',
        active_order_count: '2',
        effective_registration_status: 'open',
        can_register: true,
      },
      {
        meetup_id: 'sold-out',
        capacity: 3,
        remaining_spots: 0,
        paid_order_count: 3,
        pending_order_count: 0,
        active_order_count: 3,
        effective_registration_status: 'sold_out',
        can_register: false,
      },
      {
        meetup_id: 'closed',
        capacity: 10,
        remaining_spots: 6,
        paid_order_count: 3,
        pending_order_count: 1,
        active_order_count: 4,
        effective_registration_status: 'closed',
        can_register: false,
        close_reason: '운영 점검',
      },
    ],
  );

  assert.equal(getSeatStatusLabel(open), '접수 가능');
  assert.equal(getSeatStatusClass(open), 'is-published');
  assert.equal(getSeatSummaryText(open), '무제한');
  assert.equal(getSeatBreakdownText(open), '확정 7 · 결제중 1');

  assert.equal(getSeatStatusLabel(nearlyFull), '접수 가능');
  assert.equal(getSeatStatusClass(nearlyFull), 'is-pending');
  assert.equal(getSeatSummaryText(nearlyFull), '잔여 2/4');
  assert.equal(getSeatBreakdownText(nearlyFull), '확정 1 · 결제중 1');

  assert.equal(getSeatStatusLabel(soldOut), '마감');
  assert.equal(getSeatStatusClass(soldOut), 'is-failed');
  assert.equal(getSeatSummaryText(soldOut), '잔여 0/3');
  assert.equal(soldOut.can_register, false);

  assert.equal(getSeatStatusLabel(closed), '신청 종료');
  assert.equal(getSeatStatusClass(closed), 'is-failed');
  assert.equal(getSeatSummaryText(closed), '잔여 6/10');
  assert.equal(closed.close_reason, '운영 점검');

  assert.equal(unknown.availability_known, false);
  assert.equal(unknown.can_register, false);
  assert.equal(getSeatStatusLabel(unknown), '확인 지연');
  assert.equal(getSeatStatusClass(unknown), 'is-deferred');
  assert.equal(getSeatSummaryText(unknown), '정원 8명 · 잔여 확인 지연');
  assert.equal(getSeatBreakdownText(unknown), '정원 상태를 다시 불러와야 합니다.');
});

test('payment hardening migration locks anonymous Toss orders to meetup price and checkout token', async () => {
  const migration = await readProjectFile('../supabase/migrations/20260606070000_harden_toss_payment_security.sql');

  assert.match(migration, /amount = coalesce/);
  assert.match(migration, /price_amount/);
  assert.match(migration, /checkout_token is not null/);
  assert.match(migration, /confirm_toss_payment_order/);
});

test('Toss confirmation function validates server amount and failure checkout token', async () => {
  const edgeFunction = await readProjectFile('../supabase/functions/confirm-toss-payment/index.ts');

  assert.match(edgeFunction, /assertServerAmount/);
  assert.match(edgeFunction, /findMeetupForOrder/);
  assert.match(edgeFunction, /checkoutToken is required/);
  assert.match(edgeFunction, /confirm_toss_payment_order/);
});

test('public meetup rendering escapes dynamic content before writing HTML templates', async () => {
  const mainScript = await readProjectFile('../main.js');

  assert.match(mainScript, /function escapeHtml/);
  assert.match(mainScript, /function escapeAttribute/);
  assert.match(mainScript, /function escapeImageUrl/);
  assert.match(mainScript, /createTagMarkup\(tags\) {\s+return tags\.map\(\(tag\) => `<span>\$\{escapeHtml\(tag\)\}<\/span>`\)/);
  assert.match(mainScript, /alt="\$\{escapeAttribute\(item\.title\)\}"/);
  assert.match(mainScript, /src="\$\{escapeImageUrl\(item\.image\)\}"/);
  assert.match(mainScript, /data-detail="\$\{escapeAttribute\(item\.id\)\}"/);
});

test('checkout waits for Toss SDK loading and prevents duplicate pending orders', async () => {
  const [mainScript, tossCheckoutModule] = await Promise.all([
    readProjectFile('../main.js'),
    readProjectFile('../toss-checkout.js'),
  ]);

  assert.match(tossCheckoutModule, /let tossSdkScriptPromise/);
  assert.match(tossCheckoutModule, /await ensureTossSdkScript\(\)/);
  assert.match(tossCheckoutModule, /script\.addEventListener\('load', handleLoad/);
  assert.match(tossCheckoutModule, /script\.addEventListener\('error', handleError/);
  assert.match(mainScript, /let checkoutInProgress = false/);
  assert.match(mainScript, /if \(checkoutInProgress\)/);
  assert.match(mainScript, /shouldUnlockForm = false/);
});

test('main.js delegates modal focus management and Toss helpers to extracted modules', async () => {
  const mainScript = await readProjectFile('../main.js');

  assert.match(mainScript, /from '\.\/modal-manager\.js\?v=__ASSET_VERSION__'/);
  assert.match(mainScript, /from '\.\/toss-checkout\.js\?v=__ASSET_VERSION__'/);
  assert.doesNotMatch(mainScript, /function openModal\(/);
  assert.doesNotMatch(mainScript, /function closeModal\(/);
  assert.doesNotMatch(mainScript, /function trapFocus\(/);
  assert.doesNotMatch(mainScript, /function ensureTossSdkScript\(/);
  assert.doesNotMatch(mainScript, /function getTossPayment\(/);
});

test('deploy workflow ships the extracted public modules', async () => {
  const workflow = await readProjectFile('../.github/workflows/deploy-pages.yml');

  assert.match(workflow, /cp modal-manager\.js dist\//);
  assert.match(workflow, /cp toast-queue\.js dist\//);
  assert.match(workflow, /cp toss-checkout\.js dist\//);
});

test('docs distinguish wired test integration from remaining production setup', async () => {
  const [readme, supabaseReadme] = await Promise.all([
    readProjectFile('../README.md'),
    readProjectFile('../supabase/README.md'),
  ]);
  const docs = `${readme}\n${supabaseReadme}`;

  assert.match(readme, /create-public-submission/);
  assert.match(readme, /confirm-toss-payment/);
  assert.match(readme, /토스페이먼츠 테스트/);
  assert.match(readme, /실제 과금 전환/);
  assert.match(readme, /토스 라이브 키/);

  assert.match(supabaseReadme, /Supabase migrations and Edge Function setup notes/);
  assert.match(supabaseReadme, /create-public-submission/);
  assert.match(supabaseReadme, /confirm-toss-payment/);
  assert.match(supabaseReadme, /Toss Payments test flow only/);
  assert.match(supabaseReadme, /Toss Payments test confirm API/);

  assert.doesNotMatch(docs, /연동 준비|연결 준비|실제 결제 연동 전|서버 함수 연결 후/);
  assert.doesNotMatch(supabaseReadme, /Payment confirmation should be handled by a server endpoint or Supabase Edge Function/);
});

test('public payment copy separates Toss test mode from live payments', async () => {
  const [mainScript, publicFlowModule, resultHtml, resultScript, resultStateModule] = await Promise.all([
    readProjectFile('../main.js'),
    readProjectFile('../public-flow.js'),
    readProjectFile('../payment-result.html'),
    readProjectFile('../payment-result.js'),
    readProjectFile('../payment-result-state.js'),
  ]);

  assert.match(publicFlowModule, /토스 테스트 결제와 서버 승인 흐름/);
  assert.match(publicFlowModule, /실제 출금은 없습니다/);
  assert.match(mainScript, /Supabase Edge Function이 승인 API를 호출/);
  assert.match(mainScript, /데모 결제 표시하기/);
  assert.match(mainScript, /데모 결제 표시를 저장했어요/);
  assert.match(publicFlowModule, /테스트 결제 확인 표시가 있는 모임입니다/);
  assert.doesNotMatch(mainScript, /결제가 완료된 모임입니다/);
  assert.doesNotMatch(mainScript, /데모 결제 완료/);
  assert.doesNotMatch(mainScript, /서버 함수 연결 후 완료됩니다/);

  assert.match(resultHtml, /TOSS TEST RESULT/);
  assert.match(resultHtml, /토스페이먼츠 테스트/);
  assert.match(resultHtml, /결제 인증값을 서버에서 확인/);
  assert.match(resultHtml, /브라우저 저장소에\s+남기지 않습니다/);
  assert.match(resultHtml, /주문 상태와 결제\s+기록/);

  assert.match(resultScript, /테스트 결제 승인이 완료됐어요/);
  assert.match(resultScript, /테스트 주문 상태가 결제완료로 변경되었습니다/);
  assert.match(resultStateModule, /message\.includes\('TOSS_SECRET_KEY'\)[\s\S]*return '결제 승인 서버 설정을 확인해주세요\.'/);
  assert.doesNotMatch(resultScript, /결제가 완료됐어요/);
  assert.doesNotMatch(resultScript, /아직 배포되지 않았|아직 설정되지 않았/);
  assert.doesNotMatch(resultStateModule, /return message \|\| '결제 승인 처리에 실패했습니다\.'/);
});

test('payment result uses paymentKey for confirmation without exposing the raw identifier', async () => {
  const [resultHtml, resultScript, resultStateModule] = await Promise.all([
    readProjectFile('../payment-result.html'),
    readProjectFile('../payment-result.js'),
    readProjectFile('../payment-result-state.js'),
  ]);
  const successFlow = resultScript.slice(
    resultScript.indexOf('async function handleSuccessResult'),
    resultScript.indexOf("if (result === 'success')"),
  );
  const failureFlow = resultScript.slice(resultScript.indexOf("const code = params.get('code')"));
  const sessionStorageWrites = [...resultScript.matchAll(/sessionStorage\.setItem\(([\s\S]*?)\);/g)]
    .map((match) => match[0]);
  const captureIndex = successFlow.indexOf("const paymentKey = params.get('paymentKey') || '';");
  const cleanIndex = successFlow.indexOf('clearPaymentResultQuery();');
  const confirmIndex = successFlow.indexOf('confirmTossPayment({ paymentKey, orderId, amount })');
  const checkoutTokenIndex = failureFlow.indexOf("const checkoutToken = params.get('checkoutToken') || '';");
  const failureCleanIndex = failureFlow.indexOf('clearPaymentResultQuery();');
  const recordFailureIndex = failureFlow.indexOf('recordTossPaymentFailure({ orderId, checkoutToken, code, message })');

  assert.match(resultHtml, /<meta name="referrer" content="no-referrer" \/>/);
  assert.match(resultHtml, /테스트 결제 접수 상태/);
  assert.match(resultHtml, /인증 정보가 도착했어요/);
  assert.doesNotMatch(resultHtml, /data-payment-key|테스트 결제키/);

  assert.match(resultScript, /from '\.\/payment-result-state\.js\?v=__ASSET_VERSION__'/);
  assert.match(resultScript, /const paymentKey = params\.get\('paymentKey'\) \|\| '';/);
  assert.match(resultScript, /function clearPaymentResultQuery\(\)/);
  assert.match(resultScript, /window\.history\.replaceState\(\{\}, document\.title, `\$\{window\.location\.pathname\}\$\{window\.location\.hash \|\| ''\}`\)/);
  assert.match(resultScript, /function rememberTossAuthSummary\(\{ orderId, amount \}\)/);
  assert.match(resultScript, /JSON\.stringify\(createTossAuthSummary\(\{ orderId, amount \}\)\)/);
  assert.match(resultScript, /confirmTossPayment\(\{ paymentKey, orderId, amount \}\)/);
  assert.doesNotMatch(resultScript, /setText\(\s*['"]\[data-payment-key\]['"]\s*,\s*paymentKey\s*\)/);
  assert.doesNotMatch(resultScript, /(?:textContent|innerText|innerHTML)\s*=\s*paymentKey\b/);
  assert.deepEqual(sessionStorageWrites.filter((write) => /\bpaymentKey\b/.test(write)), []);
  assert.doesNotMatch(resultStateModule, /\bpaymentKey\b/);

  assert.ok(captureIndex >= 0);
  assert.ok(cleanIndex > captureIndex);
  assert.ok(confirmIndex > cleanIndex);
  assert.ok(checkoutTokenIndex >= 0);
  assert.ok(failureCleanIndex > checkoutTokenIndex);
  assert.ok(recordFailureIndex > failureCleanIndex);
});

test('payment result success callback confirms order and stores only safe browser state', async () => {
  const globals = snapshotGlobals(['document', 'window', 'sessionStorage', 'localStorage', 'fetch']);
  const document = createPaymentResultDom();
  const sessionStorage = createMemoryStorage();
  const localStorage = createMemoryStorage();
  const fetchCalls = [];
  const location = {
    search: '?result=success&paymentKey=payment_secret_123&orderId=order_123&amount=39000',
    pathname: '/moin/payment-result.html',
    hash: '#done',
  };
  let replacedUrl = '';

  globalThis.document = document;
  globalThis.window = {
    location,
    history: {
      replaceState: (_state, _title, url) => {
        replacedUrl = url;
        location.search = '';
      },
    },
  };
  globalThis.sessionStorage = sessionStorage;
  globalThis.localStorage = localStorage;
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ order: { meetup_id: 'meetup-paid' } }),
    };
  };

  try {
    await import(`../payment-result.js?success-flow-test=${Date.now()}`);
  } finally {
    restoreGlobals(globals);
  }

  const [confirmCall] = fetchCalls;
  const confirmBody = JSON.parse(confirmCall.options.body);
  const tossAuthSummary = JSON.parse(sessionStorage.getItem('momentclub:toss-last-auth'));
  const paidMeetups = JSON.parse(localStorage.getItem('momentclub:paid'));

  assert.equal(document.get('[data-success-view]').hidden, false);
  assert.equal(document.get('[data-fail-view]').hidden, true);
  assert.equal(document.get('[data-order-id]').textContent, 'order_123');
  assert.equal(document.get('[data-amount]').textContent, '39,000원');
  assert.equal(document.get('[data-success-title]').textContent, '테스트 결제 승인이 완료됐어요');
  assert.equal(document.get('[data-confirm-status]').dataset.status, 'success');
  assert.match(document.get('[data-confirm-status]').textContent, /결제완료/);
  assert.equal(replacedUrl, '/moin/payment-result.html#done');

  assert.match(confirmCall.url, /\/functions\/v1\/confirm-toss-payment$/);
  assert.deepEqual(confirmBody, {
    paymentKey: 'payment_secret_123',
    orderId: 'order_123',
    amount: 39000,
  });
  assert.equal(tossAuthSummary.orderId, 'order_123');
  assert.equal(tossAuthSummary.amount, '39000');
  assert.ok(tossAuthSummary.receivedAt);
  assert.equal(Object.prototype.hasOwnProperty.call(tossAuthSummary, 'paymentKey'), false);
  assert.deepEqual(paidMeetups, ['meetup-paid']);
});

test('public localStorage sets recover from corrupted saved state', async () => {
  const [mainScript, paymentResultScript, publicStorageModule] = await Promise.all([
    readProjectFile('../main.js'),
    readProjectFile('../payment-result.js'),
    readProjectFile('../public-storage.js'),
  ]);
  const longValue = 'x'.repeat(publicStateMaxValueLength + 1);
  const boundedValues = Array.from({ length: publicStateMaxItems + 5 }, (_, index) => `meetup-${index}`);
  const storage = createMemoryStorage({
    'momentclub:bad-json': '{bad json',
    'momentclub:not-array': JSON.stringify({ value: 'meetup' }),
    'momentclub:values': JSON.stringify([' saved ', '', longValue, 'paid', ...boundedValues]),
  });

  assert.deepEqual([...readPublicStringSet('momentclub:missing', storage)], []);
  assert.deepEqual([...readPublicStringSet('momentclub:bad-json', storage)], []);
  assert.equal(storage.getItem('momentclub:bad-json'), null);
  assert.deepEqual([...readPublicStringSet('momentclub:not-array', storage)], []);
  assert.equal(storage.getItem('momentclub:not-array'), null);

  const recovered = [...readPublicStringSet('momentclub:values', storage)];
  assert.equal(recovered[0], 'saved');
  assert.equal(recovered[1], 'paid');
  assert.equal(recovered.length, publicStateMaxItems);
  assert.equal(recovered.includes(longValue), false);

  persistPublicStringSet('momentclub:persisted', new Set(['meetup-a', 'meetup-b']), storage);
  assert.deepEqual(JSON.parse(storage.getItem('momentclub:persisted')), ['meetup-a', 'meetup-b']);

  assert.equal(publicStateMaxItems, 100);
  assert.equal(publicStateMaxValueLength, 120);
  assert.match(publicStorageModule, /export function readPublicStringSet\(key, storage = getDefaultStorage\(\)\)/);
  assert.match(publicStorageModule, /storage\?\.removeItem\(key\)/);
  assert.match(publicStorageModule, /export function persistPublicStringSet\(key, set, storage = getDefaultStorage\(\)\)/);

  assert.match(mainScript, /from '\.\/public-storage\.js\?v=__ASSET_VERSION__'/);
  assert.match(mainScript, /const saved = readPublicStringSet\('momentclub:saved'\)/);
  assert.match(mainScript, /const notified = readPublicStringSet\('momentclub:notified'\)/);
  assert.match(mainScript, /const paid = readPublicStringSet\('momentclub:paid'\)/);
  assert.match(mainScript, /persistPublicStringSet as persist/);
  assert.doesNotMatch(mainScript, /function readStringSet\(key\)/);
  assert.doesNotMatch(mainScript, /function persist\(key, set\)/);
  assert.doesNotMatch(mainScript, /const (?:saved|notified|paid) = new Set\(JSON\.parse/);

  assert.match(paymentResultScript, /from '\.\/public-storage\.js\?v=__ASSET_VERSION__'/);
  assert.match(paymentResultScript, /const paid = readPublicStringSet\('momentclub:paid'\)/);
  assert.match(paymentResultScript, /persistPublicStringSet\('momentclub:paid', paid\)/);
  assert.doesNotMatch(paymentResultScript, /function readStringSet\(key\)/);
  assert.doesNotMatch(paymentResultScript, /function persistStringSet\(key, set\)/);
  assert.doesNotMatch(paymentResultScript, /new Set\(JSON\.parse\(localStorage\.getItem\('momentclub:paid'\)/);
});

test('static asset cache-busting uses one deploy version placeholder', async () => {
  const [workflow, ...sources] = await Promise.all([
    readProjectFile('../.github/workflows/deploy-pages.yml'),
    ...cacheBustedSourceFiles.map(readProjectFile),
  ]);
  const versions = sources.flatMap(getAssetVersions);
  const uniqueVersions = new Set(versions);

  assert.ok(versions.length > 0);
  assert.deepEqual([...uniqueVersions], [assetVersionPlaceholder]);
  assert.match(workflow, /ASSET_VERSION="\$\{GITHUB_SHA::12\}"/);
  assert.doesNotMatch(workflow, /cp AGENTIC_STATUS\.json dist\//);
  assert.match(workflow, /node scripts\/create-public-agentic-status\.mjs AGENTIC_STATUS\.json dist\/PUBLIC_AGENTIC_STATUS\.json/);
  assert.match(workflow, /cp admin-availability\.js dist\//);
  assert.match(workflow, /cp admin-meetup-form\.js dist\//);
  assert.match(workflow, /cp payment-result-state\.js dist\//);
  assert.match(workflow, /cp public-availability\.js dist\//);
  assert.match(workflow, /cp public-flow\.js dist\//);
  assert.match(workflow, /cp public-form\.js dist\//);
  assert.match(workflow, /cp public-storage\.js dist\//);
  assert.match(workflow, /s\/__ASSET_VERSION__\/\$\{ASSET_VERSION\}\/g/);
});

test('GitHub Pages workflow uses Node 24 compatible action versions', async () => {
  const workflow = await readProjectFile('../.github/workflows/deploy-pages.yml');
  const actionUses = [...workflow.matchAll(/^\s*uses:\s*(actions\/[^\s#]+)/gm)].map((match) => match[1]);

  assert.deepEqual(actionUses, [
    'actions/checkout@v6',
    'actions/setup-node@v6',
    'actions/checkout@v6',
    'actions/configure-pages@v6',
    'actions/upload-pages-artifact@v5',
    'actions/deploy-pages@v5',
  ]);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /package-manager-cache: false/);
  assert.match(workflow, /permissions:\s+contents: read\s+[\s\S]*?deploy:\s+needs: test\s+runs-on: ubuntu-latest\s+permissions:\s+contents: read\s+pages: write\s+id-token: write/);

  assert.doesNotMatch(workflow, /uses: actions\/checkout@v4/);
  assert.doesNotMatch(workflow, /uses: actions\/checkout@v5/);
  assert.doesNotMatch(workflow, /uses: actions\/setup-node@v4/);
  assert.doesNotMatch(workflow, /uses: actions\/setup-node@v5/);
  assert.doesNotMatch(workflow, /node-version: 20/);
  assert.doesNotMatch(workflow, /uses: actions\/configure-pages@v5/);
  assert.doesNotMatch(workflow, /uses: actions\/upload-pages-artifact@v3/);
  assert.doesNotMatch(workflow, /uses: actions\/upload-pages-artifact@v4/);
  assert.doesNotMatch(workflow, /uses: actions\/deploy-pages@v4/);
  assert.doesNotMatch(workflow, /actions: read/);
  assert.doesNotMatch(workflow, /enablement: true/);
});

test('admin orders include payment record reconciliation', async () => {
  const [adminHtml, adminScript, supabaseClient] = await Promise.all([
    readProjectFile('../admin.html'),
    readProjectFile('../admin.js'),
    readProjectFile('../supabase-client.js'),
  ]);

  assert.match(supabaseClient, /const adminPaymentFields = \[/);
  assert.match(supabaseClient, /selectRowsWithToken\(\s*'payments'/);
  assert.match(supabaseClient, /payments: resolveAdminRows\('결제', paymentsResult, warnings\)/);
  assert.doesNotMatch(supabaseClient, /실제 결제 연동 전/);
  assert.match(adminHtml, /<th>결제 기록<\/th>/);
  assert.match(adminScript, /function renderPaymentRecord/);
  assert.match(adminScript, /getPaymentForOrder\(order\.id\)/);
  assert.match(adminScript, /data-label="결제 기록"/);
  assert.match(adminScript, /기록 없음/);
});

test('admin sessions use short-lived storage without refresh token persistence', async () => {
  const [adminScript, supabaseClient] = await Promise.all([
    readProjectFile('../admin.js'),
    readProjectFile('../supabase-client.js'),
  ]);

  assert.match(supabaseClient, /function getAdminSessionStorage\(\) \{\s+try \{\s+return window\.sessionStorage;/);
  assert.match(supabaseClient, /function getLegacyAdminSessionStorage\(\) \{\s+try \{\s+return window\.localStorage;/);
  assert.match(supabaseClient, /function normalizeAdminSession\(session\)/);
  assert.match(supabaseClient, /expiresAt && expiresAt <= Date\.now\(\)/);
  assert.match(supabaseClient, /function createStoredAdminSession\(session\)[\s\S]*accessToken: session\.accessToken,[\s\S]*expiresAt: session\.expiresAt,[\s\S]*user: session\.user/);
  assert.match(supabaseClient, /clearAdminSession\(\);\s+if \(!storage \|\| !storedSession\)/);
  assert.match(supabaseClient, /removeStoredAdminSession\(getAdminSessionStorage\(\)\)/);
  assert.match(supabaseClient, /removeStoredAdminSession\(getLegacyAdminSessionStorage\(\)\)/);
  assert.match(supabaseClient, /catch \{\s+clearAdminSession\(\);\s+return null;/);
  assert.doesNotMatch(supabaseClient, /localStorage\.setItem\(adminSessionKey/);
  assert.doesNotMatch(supabaseClient, /localStorage\.getItem\(adminSessionKey/);
  assert.doesNotMatch(supabaseClient, /refreshToken/);

  assert.match(adminScript, /clearAdminSession,/);
  assert.match(adminScript, /const shouldClearAuthParams = hasAuthTokenParams\(\)/);
  assert.match(adminScript, /if \(shouldClearAuthParams\) \{\s+clearAuthParamsFromUrl\(\);/);
  assert.match(adminScript, /function hasAuthTokenParams\(\)/);
  assert.match(adminScript, /'refresh_token'/);
  assert.match(adminScript, /function getSessionUnavailableMessage\(session/);
  assert.match(adminScript, /관리자 세션이 만료되었습니다\. 다시 로그인해주세요\./);
  assert.match(adminScript, /function requireActiveSession\(statusElement/);
  assert.match(adminScript, /clearUnavailableActiveSession\(\)/);
  assert.doesNotMatch(adminScript, /refreshToken:/);
  assert.doesNotMatch(adminScript, /pendingInvite\.refreshToken/);
});

test('admin stored sessions clean up legacy, corrupted, and expired state', () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const originalWindow = globalThis.window;
  const key = 'momentclub:admin-session';
  const sessionStorage = createMemoryStorage();
  const localStorage = createMemoryStorage({
    [key]: JSON.stringify({
      accessToken: 'legacy-access-token',
      expiresAt: Date.now() + 60_000,
    }),
  });

  globalThis.window = { sessionStorage, localStorage };

  try {
    sessionStorage.setItem(key, JSON.stringify({
      accessToken: 'tab-access-token',
      refreshToken: 'must-not-survive',
      expiresAt: Date.now() + 60_000,
      user: { email: 'admin@example.com' },
    }));

    const storedSession = getStoredAdminSession();

    assert.equal(storedSession.accessToken, 'tab-access-token');
    assert.equal(storedSession.refreshToken, undefined);
    assert.deepEqual(storedSession.user, { email: 'admin@example.com' });
    assert.equal(localStorage.getItem(key), null);

    sessionStorage.setItem(key, '{bad json');
    assert.equal(getStoredAdminSession(), null);
    assert.equal(sessionStorage.getItem(key), null);

    sessionStorage.setItem(key, JSON.stringify({
      accessToken: 'expired-access-token',
      expiresAt: Date.now() - 1,
    }));
    assert.equal(getStoredAdminSession(), null);
    assert.equal(sessionStorage.getItem(key), null);

    localStorage.setItem(key, JSON.stringify({
      accessToken: 'stale-legacy-token',
      expiresAt: Date.now() + 60_000,
    }));
    clearAdminSession();
    assert.equal(sessionStorage.getItem(key), null);
    assert.equal(localStorage.getItem(key), null);
  } finally {
    if (hadWindow) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('admin dashboard renders redacted public agentic status from a static JSON board', async () => {
  const [adminHtml, adminStyles, adminScript, agenticStatus] = await Promise.all([
    readProjectFile('../admin.html'),
    readProjectFile('../admin.css'),
    readProjectFile('../admin.js'),
    readProjectFile('../AGENTIC_STATUS.json'),
  ]);
  const sourceStatus = JSON.parse(agenticStatus);
  const status = createPublicAgenticStatus(sourceStatus);

  assert.match(adminHtml, /data-agentic-board/);
  assert.match(adminHtml, /data-tab-button="agentic"/);
  assert.match(adminHtml, /data-tab-panel="agentic"[\s\S]*data-agentic-board[\s\S]*hidden/);
  assert.match(adminHtml, /data-agentic-summary/);
  assert.match(adminHtml, /data-agentic-agents/);
  assert.match(adminHtml, /data-agentic-tasks/);
  assert.match(adminHtml, /data-agentic-refresh/);
  assert.match(adminStyles, /\.agentic-board/);
  assert.match(adminStyles, /\.agent-grid/);
  assert.match(adminStyles, /\.task-list/);
  assert.match(adminStyles, /\.task-detail/);
  assert.match(adminStyles, /\.task-item\.has-detail/);
  assert.match(adminStyles, /\.task-item\.has-detail:focus-visible/);
  assert.match(adminScript, /PUBLIC_AGENTIC_STATUS\.json\?v=__ASSET_VERSION__/);
  assert.match(adminScript, /AGENTIC_STATUS\.json\?v=__ASSET_VERSION__/);
  assert.match(adminScript, /publicResponse\.ok/);
  assert.match(adminScript, /function renderAgenticStatus/);
  assert.match(adminScript, /function loadAgenticStatus/);
  assert.match(adminScript, /function renderTaskDetails/);
  assert.match(adminScript, /const detailsMarkup = renderTaskDetails\(task\)/);
  assert.match(adminScript, /function toggleTaskDetail/);
  assert.match(adminScript, /agenticTasks\.addEventListener\('click', handleTaskItemClick\)/);
  assert.match(adminScript, /agenticTasks\.addEventListener\('keydown', handleTaskItemKeydown\)/);
  assert.match(adminScript, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(adminScript, /상세 보기/);
  assert.match(adminScript, /무슨 작업인가요\?/);
  assert.match(adminScript, /왜 필요한가요\?/);
  assert.match(adminScript, /간단한 개발 방향/);
  assert.match(adminScript, /if \(getActiveTab\(\) === 'agentic'\)/);
  assert.match(adminScript, /if \(target === 'agentic'\)/);
  assert.doesNotMatch(adminScript, /showDashboard\(\);\s+void loadAgenticStatus\(\);/);
  assert.match(adminScript, /agenticRefreshButton\.addEventListener\('click', loadAgenticStatus\)/);
  assert.equal(status.visibility, 'public-redacted');
  assert.equal(Object.prototype.hasOwnProperty.call(status, 'branch'), false);
  assert.equal(status.summary.deployNeeded, status.tasks.filter((task) => task.deployNeeded).length);
  assert.ok(Array.isArray(status.agents));
  assert.ok(Array.isArray(status.tasks));
  assert.ok(status.agents.some((agent) => agent.name === 'UX/UI Agent'));
  assert.ok(status.tasks.some((task) => task.id === 'AG-0004' && task.status === 'deployed'));
  assert.equal(
    createPublicAgenticStatus({ tasks: [{ id: 'AG-X', status: 'deployed_verified' }] }).tasks[0].next,
    '배포 완료',
  );
  assert.ok(
    status.tasks.some(
      (task) =>
        task.id === 'AG-0007' &&
        task.details?.summary,
    ),
  );
  assert.deepEqual(
    status.agents.flatMap((agent) => Object.keys(agent)).filter((key) => (
      ['role', 'currentTask', 'blocker', 'next'].includes(key)
    )),
    [],
  );
  assert.deepEqual(
    status.tasks.flatMap((task) => Object.keys(task)).filter((key) => ['owner', 'commit'].includes(key)),
    [],
  );
  assert.deepEqual(
    status.tasks.flatMap((task) => Object.keys(task.details || {})).filter((key) => (
      ['what', 'why', 'developmentDirection', 'notes'].includes(key)
    )),
    [],
  );
});

test('local agent monitor polls live status without publishing it to Pages', async () => {
  const [workflow, server, monitorHtml, monitorStyles, monitorScript, liveStatus] = await Promise.all([
    readProjectFile('../.github/workflows/deploy-pages.yml'),
    readProjectFile('../server.js'),
    readProjectFile('../agent-monitor.html'),
    readProjectFile('../agent-monitor.css'),
    readProjectFile('../agent-monitor.js'),
    readProjectFile('../AGENTIC_LIVE_STATUS.json'),
  ]);
  const status = JSON.parse(liveStatus);

  assert.match(server, /\.json': 'application\/json; charset=utf-8'/);
  assert.match(server, /Cache-Control', 'no-store'/);
  assert.match(monitorHtml, /data-monitor-root/);
  assert.match(monitorHtml, /data-agent-list/);
  assert.match(monitorHtml, /data-event-list/);
  assert.match(monitorHtml, /data-task-list/);
  assert.match(monitorHtml, /data-task-count/);
  assert.match(monitorHtml, /agent-monitor\.js/);
  assert.match(monitorStyles, /\.monitor-layout/);
  assert.match(monitorStyles, /\.task-panel/);
  assert.match(monitorStyles, /\.task-item\.has-detail/);
  assert.match(monitorStyles, /\.task-detail/);
  assert.match(monitorScript, /AGENTIC_LIVE_STATUS\.json/);
  assert.match(monitorScript, /AGENTIC_STATUS\.json/);
  assert.match(monitorScript, /moin:agent-monitor:open-task-ids/);
  assert.match(monitorScript, /window\.localStorage\?\.getItem\(openTaskStorageKey\)/);
  assert.match(monitorScript, /window\.localStorage\?\.setItem\(openTaskStorageKey/);
  assert.match(monitorScript, /function renderTaskDetails/);
  assert.match(monitorScript, /function toggleTaskDetail/);
  assert.match(monitorScript, /data-task-id="\$\{escapeHtml\(taskId\)\}"/);
  assert.match(monitorScript, /<details class="task-detail"\$\{isOpen \? ' open' : ''\}>/);
  assert.match(monitorScript, /taskList\.addEventListener\('click', handleTaskItemClick\)/);
  assert.match(monitorScript, /taskList\.addEventListener\('keydown', handleTaskItemKeydown\)/);
  assert.match(monitorScript, /taskList\.addEventListener\('toggle', handleTaskDetailToggle, true\)/);
  assert.match(monitorScript, /document\.visibilityState !== 'visible'/);
  assert.match(monitorScript, /window\.setTimeout\(loadLiveStatus, state\.pollIntervalMs\)/);
  assert.doesNotMatch(workflow, /cp agent-monitor\./);
  assert.doesNotMatch(workflow, /cp AGENTIC_LIVE_STATUS\.json/);
  assert.doesNotMatch(workflow, /cp AGENTIC_STATUS\.json dist\//);
  assert.match(workflow, /PUBLIC_AGENTIC_STATUS\.json/);
  assert.equal(status.monitor.mode, 'local');
  assert.ok(status.monitor.pollIntervalMs >= 5000);
  assert.ok(Array.isArray(status.agents));
  assert.ok(Array.isArray(status.events));
});

test('browser smoke runner covers critical local page flows without new npm dependencies', async () => {
  const [packageJson, smokeScript] = await Promise.all([
    readProjectFile('../package.json'),
    readProjectFile('../scripts/browser-smoke.mjs'),
  ]);
  const pkg = JSON.parse(packageJson);

  assert.equal(pkg.scripts['smoke:browser'], 'node scripts/browser-smoke.mjs');
  assert.equal(pkg.devDependencies.playwright, undefined);
  assert.equal(pkg.devDependencies.puppeteer, undefined);

  assert.match(smokeScript, /startServer\(appPort\)/);
  assert.match(smokeScript, /startChrome\(chrome, debuggingPort, userDataDir\)/);
  assert.match(smokeScript, /class CdpConnection/);
  assert.match(smokeScript, /smokePublicPage\(connection, baseUrl\)/);
  assert.match(smokeScript, /smokeAdminPage\(connection, baseUrl\)/);
  assert.match(smokeScript, /smokePaymentResultPage\(connection, baseUrl\)/);
  assert.match(smokeScript, /document\.querySelectorAll\('\[data-meetup-grid\] \.meetup-card'\)\.length > 0/);
  assert.match(smokeScript, /document\.querySelector\('\[data-drawer\]\[aria-hidden="false"\]'\)/);
  assert.match(smokeScript, /document\.querySelector\('\[data-checkout-modal\]\[aria-hidden="false"\]'\)/);
  assert.match(smokeScript, /document\.querySelector\('\[data-login-form\]'\)/);
  assert.match(smokeScript, /document\.querySelector\('\[data-fail-view\]'\)/);
  assert.match(smokeScript, /favicon\.ico/);
});

test('agent status artifacts do not contain sensitive tokens or payment identifiers', async () => {
  const statusFiles = [
    '../AGENTIC_STATUS.json',
    '../AGENTIC_LIVE_STATUS.json',
  ];
  const syntheticFindings = collectSensitiveAgentStatusFindings({
    accessToken: 'stored-by-mistake',
    nested: {
      note: 'Bearer eyJaaaaaaaaaaaa.bbbbbbbbbbbbbbbb.cccccccccccccccc',
    },
  });
  const findings = [];

  assert.ok(syntheticFindings.some((finding) => finding.includes('access token field')));
  assert.ok(syntheticFindings.some((finding) => finding.includes('bearer token')));

  for (const pathname of statusFiles) {
    const parsed = JSON.parse(await readProjectFile(pathname));
    collectSensitiveAgentStatusFindings(parsed).forEach((finding) => {
      findings.push(`${pathname} ${finding}`);
    });
  }

  const publicStatus = createPublicAgenticStatus(JSON.parse(await readProjectFile('../AGENTIC_STATUS.json')));
  collectSensitiveAgentStatusFindings(publicStatus).forEach((finding) => {
    findings.push(`PUBLIC_AGENTIC_STATUS.json ${finding}`);
  });

  assert.equal(Object.prototype.hasOwnProperty.call(publicStatus, 'branch'), false);
  assert.ok(publicStatus.tasks.every((task) => !('owner' in task) && !('commit' in task)));
  assert.ok(publicStatus.agents.every((agent) => (
    !('role' in agent) && !('currentTask' in agent) && !('blocker' in agent) && !('next' in agent)
  )));
  assert.ok(publicStatus.tasks.every((task) => (
    !('what' in (task.details || {})) &&
    !('why' in (task.details || {})) &&
    !('developmentDirection' in (task.details || {})) &&
    !('notes' in (task.details || {}))
  )));

  assert.deepEqual(findings, []);
});

test('public submissions route through an abuse-controlled Edge Function', async () => {
  const [config, supabaseClient, edgeFunction, setupMigration, lockMigration] = await Promise.all([
    readProjectFile('../supabase/config.toml'),
    readProjectFile('../supabase-client.js'),
    readProjectFile('../supabase/functions/create-public-submission/index.ts'),
    readProjectFile('../supabase/migrations/20260606080000_public_submission_abuse_controls.sql'),
    readProjectFile('../supabase/migrations/20260606090000_lock_public_direct_inserts.sql'),
  ]);

  assert.match(config, /\[functions\.create-public-submission\]\s+verify_jwt = false/);
  assert.match(supabaseClient, /functions\/v1\/create-public-submission/);
  assert.match(supabaseClient, /callPublicSubmission\('application'/);
  assert.match(supabaseClient, /callPublicSubmission\('demo_order'/);
  assert.match(supabaseClient, /callPublicSubmission\('toss_order'/);
  assert.doesNotMatch(supabaseClient, /insertRow\('applications'/);
  assert.doesNotMatch(supabaseClient, /insertRow\('orders'/);
  assert.match(edgeFunction, /getVisitorHash/);
  assert.match(edgeFunction, /PUBLIC_SUBMISSION_HASH_SALT/);
  assert.match(edgeFunction, /const checkoutPaymentMethods = \['간편결제', '카드', '계좌이체'\]/);
  assert.match(edgeFunction, /function getPaymentMethod\(payload: Record<string, unknown>\)/);
  assert.match(edgeFunction, /checkoutPaymentMethods\.includes\(paymentMethod\) \? paymentMethod : '간편결제'/);
  assert.match(edgeFunction, /p_payment_method: getPaymentMethod\(payload\)/);
  assert.doesNotMatch(edgeFunction, /p_payment_method: getText\(payload, 'paymentMethod'\)/);
  assert.match(edgeFunction, /rpc\/create_public_application/);
  assert.match(edgeFunction, /rpc\/create_public_order/);
  assert.match(edgeFunction, /PUBLIC_SUBMISSION_RATE_LIMITED/);
  assert.match(setupMigration, /create table if not exists public\.public_submission_attempts/);
  assert.match(setupMigration, /create or replace function public\.create_public_application/);
  assert.match(setupMigration, /create or replace function public\.create_public_order/);
  assert.match(setupMigration, /v_meetup\.price_amount/);
  assert.match(lockMigration, /revoke insert on public\.applications from anon/);
  assert.match(lockMigration, /revoke insert on public\.orders from anon/);
});

test('capacity controls migration defines remaining spot and pending expiry contract', async () => {
  const migration = await readProjectFile('../supabase/migrations/20260607000000_capacity_remaining_spots.sql');

  assert.match(migration, /add column if not exists capacity integer/);
  assert.match(migration, /meetups_capacity_positive/);
  assert.match(migration, /add column if not exists registration_status text not null default 'open'/);
  assert.match(migration, /registration_status in \('open', 'closed'\)/);
  assert.match(migration, /add column if not exists expires_at timestamptz/);
  assert.match(migration, /created_at \+ interval '30 minutes'/);
  assert.match(migration, /orders_active_seat_holds_idx/);
  assert.match(migration, /create or replace function public\.get_meetup_seat_snapshot/);
  assert.match(migration, /remaining_spots/);
  assert.match(migration, /effective_registration_status/);
  assert.match(migration, /status in \('paid', 'demo_paid'\)/);
  assert.match(migration, /status = 'pending'[\s\S]*expires_at > now\(\)/);
  assert.match(migration, /create or replace function public\.assert_meetup_can_register/);
  assert.match(migration, /for update/);
  assert.match(migration, /MEETUP_REGISTRATION_CLOSED/);
  assert.match(migration, /MEETUP_SOLD_OUT/);
  assert.match(migration, /create or replace function public\.expire_stale_pending_orders/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /grant execute on function public\.get_meetup_seat_snapshot\(text\) to service_role/);
  assert.match(migration, /grant execute on function public\.assert_meetup_can_register\(text\) to service_role/);
  assert.doesNotMatch(migration, /status_label/);
  assert.doesNotMatch(migration, /grant execute on function public\.get_meetup_seat_snapshot\(text\) to authenticated/);
  assert.doesNotMatch(migration, /registration_status in \('open', 'sold_out', 'closed'\)/);
});

test('capacity guards wire public submissions and Toss confirmation expiry checks', async () => {
  const [guardMigration, publicSubmissionFunction, tossConfirmFunction, supabaseClient] = await Promise.all([
    readProjectFile('../supabase/migrations/20260607010000_capacity_rpc_guards.sql'),
    readProjectFile('../supabase/functions/create-public-submission/index.ts'),
    readProjectFile('../supabase/functions/confirm-toss-payment/index.ts'),
    readProjectFile('../supabase-client.js'),
  ]);
  const applicationBody = guardMigration.slice(
    guardMigration.indexOf('create or replace function public.create_public_application'),
    guardMigration.indexOf('create or replace function public.create_public_order'),
  );
  const orderBody = guardMigration.slice(
    guardMigration.indexOf('create or replace function public.create_public_order'),
    guardMigration.indexOf('create or replace function public.confirm_toss_payment_order'),
  );
  const confirmBody = guardMigration.slice(
    guardMigration.indexOf('create or replace function public.confirm_toss_payment_order'),
  );
  const tossConfirmFlow = tossConfirmFunction.slice(
    tossConfirmFunction.indexOf('const { paymentKey, orderId, amount } = assertPaymentPayload(payload);'),
  );
  const applicationGuardIndex = applicationBody.indexOf('v_meetup := public.assert_meetup_can_register(p_meetup_id);');
  const applicationInsertIndex = applicationBody.indexOf('insert into public.applications');
  const orderGuardIndex = orderBody.indexOf('v_meetup := public.assert_meetup_can_register(p_meetup_id);');
  const orderInsertIndex = orderBody.indexOf('insert into public.orders');
  const sqlExpiryGuardIndex = confirmBody.indexOf("if v_order.status = 'pending' and v_order.expires_at <= now() then");
  const sqlPaidUpdateIndex = confirmBody.indexOf('update public.orders');
  const expiredCheckIndex = tossConfirmFlow.indexOf('isExpiredPendingOrder(order)');
  const markExpiredIndex = tossConfirmFlow.indexOf("markOrderFinalStatus(order, 'failed')");
  const expiredResponseIndex = tossConfirmFlow.indexOf("code: 'ORDER_EXPIRED'");
  const tossConfirmIndex = tossConfirmFlow.indexOf('const tossPayment = await confirmWithToss(paymentKey, orderId, amount)');
  const sqlConfirmIndex = tossConfirmFlow.indexOf('const result = await confirmOrderAndPayment(order, tossPayment)');

  assert.match(guardMigration, /create or replace function public\.create_public_application/);
  assert.match(guardMigration, /v_meetup := public\.assert_meetup_can_register\(p_meetup_id\)/);
  assert.match(guardMigration, /perform public\.expire_stale_pending_orders\(100\)/);
  assert.ok(applicationGuardIndex >= 0 && applicationGuardIndex < applicationInsertIndex);
  assert.match(guardMigration, /create or replace function public\.create_public_order/);
  assert.ok(orderGuardIndex >= 0 && orderGuardIndex < orderInsertIndex);
  assert.match(guardMigration, /expires_at/);
  assert.match(guardMigration, /expires_at,\s+source/);
  assert.match(guardMigration, /case when v_action = 'toss_order' then now\(\) \+ interval '30 minutes' else null end/);
  assert.match(guardMigration, /v_meetup\.price_amount/);
  assert.match(guardMigration, /to_jsonb\(v_order\) - 'checkout_token'/);
  assert.match(guardMigration, /create or replace function public\.confirm_toss_payment_order/);
  assert.match(guardMigration, /for update/);
  assert.match(guardMigration, /v_order\.status = 'pending' and v_order\.expires_at <= now\(\)/);
  assert.match(guardMigration, /ORDER_EXPIRED/);
  assert.ok(sqlExpiryGuardIndex >= 0 && sqlExpiryGuardIndex < sqlPaidUpdateIndex);
  assert.match(guardMigration, /grant execute on function public\.confirm_toss_payment_order\(uuid, text, text, timestamptz, jsonb\) to service_role/);

  assert.match(publicSubmissionFunction, /MEETUP_SOLD_OUT/);
  assert.match(publicSubmissionFunction, /MEETUP_REGISTRATION_CLOSED/);
  assert.match(publicSubmissionFunction, /return 409/);
  assert.match(publicSubmissionFunction, /function getErrorCode\(error: unknown\)/);
  assert.match(publicSubmissionFunction, /code: getErrorCode\(error\)/);
  assert.match(publicSubmissionFunction, /모임 정원이 마감되었습니다/);
  assert.match(publicSubmissionFunction, /이 모임은 지금 신청을 받지 않습니다/);
  assert.match(publicSubmissionFunction, /신청 가능한 모임을 찾지 못했습니다/);

  assert.match(tossConfirmFunction, /expires_at: string \| null/);
  assert.match(tossConfirmFunction, /checkout_token,expires_at/);
  assert.match(tossConfirmFunction, /function isExpiredPendingOrder\(order: OrderRow\)/);
  assert.match(tossConfirmFunction, /Date\.parse\(order\.expires_at\)/);
  assert.match(tossConfirmFunction, /expiresAt <= Date\.now\(\)/);
  assert.match(tossConfirmFunction, /결제 가능 시간이 만료되었습니다\. 다시 신청해 주세요\./);
  assert.match(tossConfirmFunction, /code: 'ORDER_EXPIRED'/);
  assert.ok(expiredCheckIndex >= 0 && expiredCheckIndex < tossConfirmIndex);
  assert.ok(expiredCheckIndex < sqlConfirmIndex);
  assert.ok(markExpiredIndex > expiredCheckIndex);
  assert.ok(expiredResponseIndex > markExpiredIndex);

  assert.match(supabaseClient, /const message = await parseErrorMessage\(response\)/);
  assert.match(supabaseClient, /error\.status = response\.status/);
  assert.match(supabaseClient, /error\.code = message\.code/);
});

test('capacity read contract exposes safe public and admin availability fields', async () => {
  const migration = await readProjectFile('../supabase/migrations/20260607020000_capacity_read_contract.sql');
  const publicContract = migration.slice(
    migration.indexOf('create or replace function public.list_public_meetup_availability'),
    migration.indexOf('create or replace function public.list_admin_meetup_availability'),
  );
  const publicReturnSignature = publicContract.slice(
    publicContract.indexOf('returns table'),
    publicContract.indexOf('language sql'),
  );
  const publicProjection = publicContract.slice(
    publicContract.indexOf('select\n    availability.meetup_id'),
    publicContract.indexOf('from availability;'),
  );
  const adminContract = migration.slice(
    migration.indexOf('create or replace function public.list_admin_meetup_availability'),
  );

  assert.match(migration, /create or replace function public\.list_public_meetup_availability\(\)/);
  assert.match(publicReturnSignature, /returns table \(\s+meetup_id text,\s+capacity integer,\s+remaining_spots integer,\s+effective_registration_status text,\s+can_register boolean/s);
  assert.match(publicContract, /where meetups\.is_published = true/);
  assert.match(publicContract, /orders\.status in \('paid', 'demo_paid'\)/);
  assert.match(publicContract, /orders\.status = 'pending'[\s\S]*orders\.expires_at > now\(\)/);
  assert.match(publicContract, /grant execute on function public\.list_public_meetup_availability\(\) to anon/);
  assert.match(publicContract, /grant execute on function public\.list_public_meetup_availability\(\) to authenticated/);
  assert.match(publicContract, /revoke select on public\.meetups from anon/);
  assert.match(publicContract, /grant select \([\s\S]*status_label[\s\S]*schedule[\s\S]*\) on public\.meetups to anon/);
  assert.doesNotMatch(publicReturnSignature, /active_order_count|^\s+registration_status text|closed_at|close_reason|buyer_name|provider_payment_key|checkout_token/m);
  assert.doesNotMatch(publicProjection, /active_order_count|availability\.registration_status|closed_at|close_reason|buyer_name|provider_payment_key|checkout_token/);
  assert.doesNotMatch(publicContract, /grant select on public\.meetups to anon/);

  assert.match(migration, /create or replace function public\.list_admin_meetup_availability\(\)/);
  assert.match(adminContract, /if not public\.is_admin\(\) then\s+raise exception 'ADMIN_REQUIRED';\s+end if;/);
  assert.match(adminContract, /paid_order_count/);
  assert.match(adminContract, /pending_order_count/);
  assert.match(adminContract, /closed_at/);
  assert.match(adminContract, /close_reason/);
  assert.match(adminContract, /grant execute on function public\.list_admin_meetup_availability\(\) to authenticated/);
  assert.doesNotMatch(adminContract, /grant execute on function public\.list_admin_meetup_availability\(\) to anon/);
});

test('public meetup list uses a safe read RPC instead of anon table select', async () => {
  const [migration, supabaseClient] = await Promise.all([
    readProjectFile('../supabase/migrations/20260607030000_public_meetup_read_rpc.sql'),
    readProjectFile('../supabase-client.js'),
  ]);
  const returnSignature = migration.slice(
    migration.indexOf('returns table'),
    migration.indexOf('language sql'),
  );

  assert.match(migration, /create or replace function public\.list_public_meetups\(\)/);
  assert.match(returnSignature, /returns table \(\s+id text,\s+type text,\s+category text,\s+title text,\s+description text,\s+host_name text,\s+host_role text,\s+status_label text,\s+date_label text,\s+time_label text,\s+location text,\s+price_amount integer,\s+price_label text,\s+tags text\[\],\s+image_url text,\s+schedule text\[\]/s);
  assert.match(migration, /where meetups\.is_published = true/);
  assert.match(migration, /order by meetups\.created_at asc/);
  assert.match(migration, /grant execute on function public\.list_public_meetups\(\) to anon/);
  assert.match(migration, /grant execute on function public\.list_public_meetups\(\) to authenticated/);
  assert.match(migration, /grant execute on function public\.list_public_meetups\(\) to service_role/);
  assert.doesNotMatch(returnSignature, /capacity|registration_status|closed_at|close_reason|is_published|created_at|buyer_name|provider_payment_key|checkout_token/);
  assert.match(supabaseClient, /export async function fetchPublishedMeetups\(\) \{\s+return callReadRpc\('list_public_meetups'\);\s+\}/);
  assert.doesNotMatch(supabaseClient, /selectRows\('meetups'/);
});

test('capacity smoke test SQL covers safe live migration verification paths', async () => {
  const [smokeTest, supabaseReadme] = await Promise.all([
    readProjectFile('../supabase/capacity-smoke-test.sql'),
    readProjectFile('../supabase/README.md'),
  ]);

  assert.match(smokeTest, /begin;/);
  assert.match(smokeTest, /rollback;/);
  assert.match(smokeTest, /20260607000000_capacity_remaining_spots\.sql/);
  assert.match(smokeTest, /20260607010000_capacity_rpc_guards\.sql/);
  assert.match(smokeTest, /20260607020000_capacity_read_contract\.sql/);
  assert.match(smokeTest, /__capacity_smoke_/);
  assert.match(smokeTest, /where meetup_id in \(/);
  assert.match(smokeTest, /where id in \(/);
  assert.match(smokeTest, /public\.create_public_application/);
  assert.match(smokeTest, /public\.create_public_order/);
  assert.match(smokeTest, /provider_order_id = 'capacity-smoke-unlimited-order'[\s\S]*expires_at > now\(\)/);
  assert.match(smokeTest, /expected no pending Toss smoke orders with null expires_at/);
  assert.match(smokeTest, /capacity-smoke-active-payment-key/);
  assert.match(smokeTest, /expected non-expired Toss pending order to become paid/);
  assert.match(smokeTest, /expected payment row for confirmed non-expired Toss order/);
  assert.match(smokeTest, /public\.get_meetup_seat_snapshot\('__capacity_smoke_one__'\)/);
  assert.match(smokeTest, /public\.list_public_meetup_availability\(\)/);
  assert.match(smokeTest, /expected public availability read contract to return sold_out/);
  assert.match(smokeTest, /effective_registration_status' <> 'sold_out'/);
  assert.match(smokeTest, /expected MEETUP_SOLD_OUT/);
  assert.match(smokeTest, /expected MEETUP_SOLD_OUT for application/);
  assert.match(smokeTest, /expected MEETUP_REGISTRATION_CLOSED/);
  assert.match(smokeTest, /public\.confirm_toss_payment_order/);
  assert.match(smokeTest, /expected ORDER_EXPIRED/);
  assert.match(smokeTest, /public\.expire_stale_pending_orders\(10000\)/);
  assert.match(smokeTest, /expected the smoke expired pending order to be marked failed/);
  assert.doesNotMatch(smokeTest, /commit;/i);
  assert.doesNotMatch(smokeTest, /like '__capacity_smoke_%'/i);

  assert.match(supabaseReadme, /## 12\. Capacity and Sold-Out Guard Rollout/);
  assert.match(supabaseReadme, /20260606070000_harden_toss_payment_security\.sql/);
  assert.match(supabaseReadme, /20260606080000_public_submission_abuse_controls\.sql/);
  assert.match(supabaseReadme, /20260606090000_lock_public_direct_inserts\.sql/);
  assert.match(supabaseReadme, /20260607000000_capacity_remaining_spots\.sql[\s\S]*20260607010000_capacity_rpc_guards\.sql[\s\S]*20260607020000_capacity_read_contract\.sql/);
  assert.match(supabaseReadme, /Do not deploy `functions\/create-public-submission` or `functions\/confirm-toss-payment`/);
  assert.match(supabaseReadme, /capacity-rollout-checklist\.md/);
  assert.match(supabaseReadme, /Stop the rollout if any capacity migration fails/);
});

test('capacity rollout checklist documents safe live deployment order', async () => {
  const checklist = await readProjectFile('../supabase/capacity-rollout-checklist.md');

  assert.match(checklist, /# Capacity Rollout Checklist/);
  assert.match(checklist, /jqnnolsyvynrhjvfmege/);
  assert.match(checklist, /## Do Not Start Unless/);
  assert.match(checklist, /20260606070000[\s\S]*20260606080000[\s\S]*20260606090000/);
  assert.match(checklist, /## Hard Stop Rules/);
  assert.match(checklist, /A migration fails in the SQL editor/);
  assert.match(checklist, /capacity-smoke-test\.sql` raises an exception/);
  assert.match(checklist, /20260607000000_capacity_remaining_spots\.sql[\s\S]*20260607010000_capacity_rpc_guards\.sql[\s\S]*20260607020000_capacity_read_contract\.sql/);
  assert.match(checklist, /Do not deploy the capacity-aware Edge Functions before all three migrations are applied/);
  assert.match(checklist, /supabase functions deploy create-public-submission --no-verify-jwt/);
  assert.match(checklist, /supabase functions deploy confirm-toss-payment --no-verify-jwt/);
  assert.match(checklist, /Confirm secrets are still present:[\s\S]*TOSS_SECRET_KEY[\s\S]*PUBLIC_SUBMISSION_HASH_SALT/);
  assert.match(checklist, /Verify Edge Functions Before Frontend Deploy/);
  assert.match(checklist, /Run the GitHub Pages workflow/);
  assert.match(checklist, /without Node runtime deprecation warnings/);
  assert.match(checklist, /Do not use the service role key in browser config files/);
  assert.match(checklist, /Do not treat `status_label` as the source of truth/);
  assert.match(checklist, /Do not re-open anonymous direct inserts/);
  assert.match(checklist, /Do not drop capacity columns as the first rollback move/);
  assert.match(checklist, /Do not switch Toss live keys during this test-mode rollout/);
  assert.match(checklist, /The admin UI saves `capacity`, `registration_status`, and `close_reason`/);
  assert.match(checklist, /does not currently write `closed_at`/);
  assert.match(checklist, /## Rollback Notes/);
  assert.doesNotMatch(checklist, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
  assert.doesNotMatch(checklist, /test_sk_[A-Za-z0-9_=-]{8,}/);
});

test('public meetup UI reads availability RPC and fails closed in configured mode', async () => {
  const [supabaseClient, mainScript, availabilityModule, flowModule, formModule, styles] = await Promise.all([
    readProjectFile('../supabase-client.js'),
    readProjectFile('../main.js'),
    readProjectFile('../public-availability.js'),
    readProjectFile('../public-flow.js'),
    readProjectFile('../public-form.js'),
    readProjectFile('../styles.css'),
  ]);
  const openCheckoutStart = mainScript.indexOf('function openCheckout');
  const completeCheckoutStart = mainScript.indexOf('async function completeCheckout');
  const submitApplicationStart = mainScript.indexOf('async function submitApplication');
  const setFilterStart = mainScript.indexOf('function setFilter');
  const openCheckoutBody = mainScript.slice(openCheckoutStart, completeCheckoutStart);
  const checkoutBody = mainScript.slice(completeCheckoutStart, submitApplicationStart);
  const applicationBody = mainScript.slice(submitApplicationStart, setFilterStart);
  const checkoutGuardSource = 'const actionState = getPublicMeetupActionState(item, { isPaid: paid.has(item.id), hasApplication: hasStoredApplication(item.id) });';
  const applicationGuardSource = 'const actionState = getPublicMeetupActionState(item, { hasApplication: hasStoredApplication(item.id) });';
  const openCheckoutGuardIndex = openCheckoutBody.indexOf(checkoutGuardSource);
  const checkoutGuardIndex = checkoutBody.indexOf(checkoutGuardSource);
  const checkoutCreateIndex = checkoutBody.indexOf('await createTossPendingOrder');
  const demoCreateIndex = checkoutBody.indexOf('await createDemoOrder');
  const applicationGuardIndex = applicationBody.indexOf(applicationGuardSource);
  const applicationCreateIndex = applicationBody.indexOf('await createApplication');
  const statusClassStructuredIndex = availabilityModule.indexOf("if (item?.availabilityKnown === true) return 'is-open';");
  const statusClassRawIndex = availabilityModule.indexOf("const value = String(item?.status || '');");

  assert.match(supabaseClient, /async function callReadRpc\(functionName, payload = \{\}\)/);
  assert.match(supabaseClient, /export async function fetchPublishedMeetups\(\) \{\s+return callReadRpc\('list_public_meetups'\);\s+\}/);
  assert.match(supabaseClient, /export async function fetchPublicMeetupAvailability\(\) \{\s+return callReadRpc\('list_public_meetup_availability'\);\s+\}/);
  assert.match(mainScript, /fetchPublicMeetupAvailability,/);
  assert.match(mainScript, /from '\.\/public-availability\.js\?v=__ASSET_VERSION__'/);
  assert.match(mainScript, /from '\.\/public-flow\.js\?v=__ASSET_VERSION__'/);
  assert.match(mainScript, /from '\.\/public-form\.js\?v=__ASSET_VERSION__'/);
  assert.match(mainScript, /mergeMeetupAvailability,/);
  assert.match(availabilityModule, /function normalizeAvailability\(row\)/);
  assert.match(availabilityModule, /meetup_id/);
  assert.match(availabilityModule, /effective_registration_status/);
  assert.match(availabilityModule, /can_register === true/);
  assert.match(availabilityModule, /export function mergeMeetupAvailability\(items, availabilityRows, \{ requireAvailability = false \} = \{\}\)/);
  assert.match(availabilityModule, /export function getRegistrationBlockReason\(item\)/);
  assert.match(flowModule, /export function getPublicMeetupActionState\(item, \{ isPaid = false, hasApplication = true \} = \{\}\)/);
  assert.match(flowModule, /canSubmitApplication: canRegister/);
  assert.match(flowModule, /canOpenCheckout: canRegister && !isPaid && !requiresApplication/);
  assert.match(flowModule, /paymentButtonDisabled: isPaid \|\| !canRegister/);
  assert.match(availabilityModule, /new Map\([\s\S]*\.map\(normalizeAvailability\)[\s\S]*\[availability\.id, availability\]/);
  assert.match(mainScript, /let meetups = isSupabaseConfigured\(\)\s+\? mergeMeetupAvailability\(fallbackMeetups, \[\], \{ requireAvailability: true \}\)/);
  assert.match(mainScript, /Promise\.allSettled\(\[\s+fetchPublishedMeetups\(\),\s+fetchPublicMeetupAvailability\(\),\s+\]\)/);
  assert.match(mainScript, /mergeMeetupAvailability\(rows\.map\(normalizeMeetup\), availabilityRows, \{ requireAvailability: true \}\)/);
  assert.match(mainScript, /meetups = mergeMeetupAvailability\(fallbackMeetups, \[\], \{ requireAvailability: true \}\)/);
  assert.match(formModule, /export function createPublicApplicationPayload\(source\)/);
  assert.match(formModule, /export function createPublicCheckoutPayload\(source\)/);
  assert.match(mainScript, /const \{ payerName, paymentMethod \} = createPublicCheckoutPayload\(formData\)/);
  assert.match(mainScript, /const \{ name, interest \} = createPublicApplicationPayload\(formData\)/);
  assert.match(mainScript, /const actionState = getPublicMeetupActionState\(item, \{ isPaid, hasApplication: hasStoredApplication\(item\.id\) \}\)/);
  assert.match(mainScript, /const actionState = getPublicMeetupActionState\(item, \{ hasApplication: hasStoredApplication\(item\.id\) \}\)/);
  assert.match(mainScript, /actionState\.paymentSummaryClass/);
  assert.match(mainScript, /actionState\.paymentButtonDisabled/);
  assert.match(mainScript, /actionState\.blockReason/);
  assert.doesNotMatch(mainScript, /if \(!isRegistrationAvailable\(item\)\) \{\n    setCheckoutStatus/);
  assert.doesNotMatch(mainScript, /if \(!isRegistrationAvailable\(item\)\) \{\n    showToast\(getRegistrationStatusDescription\(item\)\);/);
  assert.match(availabilityModule, /잔여석 정보를 확인하지 못해 신청과 결제를 잠시 막았습니다/);
  assert.match(availabilityModule, /정원이 모두 차서 새 신청과 테스트 결제를 받을 수 없습니다/);
  assert.match(availabilityModule, /운영자가 접수를 닫아 새 신청과 테스트 결제를 받을 수 없습니다/);
  assert.ok(openCheckoutGuardIndex >= 0);
  assert.ok(checkoutGuardIndex >= 0 && checkoutGuardIndex < checkoutCreateIndex);
  assert.ok(checkoutGuardIndex < demoCreateIndex);
  assert.ok(applicationGuardIndex >= 0 && applicationGuardIndex < applicationCreateIndex);
  assert.ok(statusClassStructuredIndex >= 0 && statusClassStructuredIndex < statusClassRawIndex);
  assert.match(styles, /\.status-badge\.is-checking/);
  assert.match(styles, /\.payment-summary\.is-closed/);
  assert.match(styles, /\.registration-closed-note/);
});

test('admin capacity UI uses admin RPC and strips derived availability fields', async () => {
  const [supabaseClient, adminHtml, adminScript, adminAvailabilityModule, adminFormModule, adminStyles] = await Promise.all([
    readProjectFile('../supabase-client.js'),
    readProjectFile('../admin.html'),
    readProjectFile('../admin.js'),
    readProjectFile('../admin-availability.js'),
    readProjectFile('../admin-meetup-form.js'),
    readProjectFile('../admin.css'),
  ]);
  const operationalLoad = supabaseClient.slice(
    supabaseClient.indexOf('export async function fetchAdminOperationalData'),
    supabaseClient.indexOf('export async function fetchAdminOrders'),
  );
  const sanitizeBlock = supabaseClient.slice(
    supabaseClient.indexOf('const adminMeetupWritableFields'),
    supabaseClient.indexOf('async function callPublicSubmission'),
  );

  assert.match(supabaseClient, /'capacity',\s+'registration_status',\s+'closed_at',\s+'close_reason'/);
  assert.match(supabaseClient, /async function callReadRpcWithToken\(functionName, accessToken, payload = \{\}/);
  assert.match(operationalLoad, /callReadRpcWithToken\('list_admin_meetup_availability', accessToken/);
  assert.doesNotMatch(supabaseClient, /callReadRpc\('list_admin_meetup_availability'/);
  assert.match(sanitizeBlock, /const adminMeetupWritableFields = \[/);
  assert.match(sanitizeBlock, /'capacity'/);
  assert.match(sanitizeBlock, /'registration_status'/);
  assert.match(sanitizeBlock, /'close_reason'/);
  assert.match(sanitizeBlock, /normalizeAdminMeetupCapacity/);
  assert.match(sanitizeBlock, /normalizeAdminMeetupImageUrl/);
  assert.match(sanitizeBlock, /payload\.image_url = normalizeAdminMeetupImageUrl\(payload\.image_url\)/);
  assert.match(supabaseClient, /url\.protocol === 'http:' \|\| url\.protocol === 'https:' \? trimmed : ''/);
  assert.match(sanitizeBlock, /registration_status'[\s\S]*\['open', 'closed'\]\.includes/);
  assert.doesNotMatch(sanitizeBlock, /remaining_spots|effective_registration_status|paid_order_count|pending_order_count|active_order_count|can_register|closed_at/);
  assert.match(supabaseClient, /sanitizeAdminMeetupPayload\(meetup, \{ includeId: true \}\)/);
  assert.match(supabaseClient, /sanitizeAdminMeetupPayload\(meetup\)/);

  assert.match(adminHtml, /name="capacity" type="number" min="1" step="1"/);
  assert.match(adminHtml, /name="registration_status"[\s\S]*value="open"[\s\S]*접수중[\s\S]*value="closed"[\s\S]*수동 종료/);
  assert.match(adminHtml, /name="close_reason"/);
  assert.match(adminHtml, /<th>좌석<\/th>/);
  assert.doesNotMatch(adminHtml, /name="remaining_spots"|name="effective_registration_status"|name="active_order_count"|name="can_register"|name="closed_at"/);

  assert.match(adminScript, /from '\.\/admin-availability\.js\?v=__ASSET_VERSION__'/);
  assert.match(adminScript, /from '\.\/admin-meetup-form\.js\?v=__ASSET_VERSION__'/);
  assert.match(adminScript, /mergeAdminMeetupAvailability,/);
  assert.match(adminScript, /getSeatStatusLabel,/);
  assert.match(adminScript, /getSeatSummaryText,/);
  assert.match(adminScript, /meetups: mergeAdminMeetupAvailability\(data\.meetups, data\.meetupAvailability\)/);
  assert.match(adminAvailabilityModule, /export function mergeAdminMeetupAvailability\(meetups, availabilityRows = \[\]\)/);
  assert.match(adminAvailabilityModule, /availability_known: false/);
  assert.match(adminAvailabilityModule, /export function getSeatStatusLabel\(meetup\)/);
  assert.match(adminAvailabilityModule, /export function getSeatSummaryText\(meetup\)/);
  assert.match(adminFormModule, /export function createAdminMeetupPayload\(source/);
  assert.match(adminFormModule, /getCapacityPayloadValue\(getSourceValue\(source, 'capacity'\)\)/);
  assert.match(adminFormModule, /getRegistrationStatusPayloadValue\(getSourceValue\(source, 'registration_status'\)\)/);
  assert.match(adminScript, /function renderSeatSummary\(meetup\)/);
  assert.match(adminScript, /<td data-label="좌석">\$\{renderSeatSummary\(meetup\)\}<\/td>/);
  assert.match(adminScript, /return createAdminMeetupPayload\(formData, \{ includeId \}\)/);
  assert.match(adminFormModule, /registrationStatus === 'closed' && closeReason \? closeReason : null/);

  assert.match(adminStyles, /\.capacity-controls/);
  assert.match(adminStyles, /\.seat-summary/);
});

test('drawer and checkout modal use inert focus traps with opener restoration', async () => {
  const [indexHtml, mainScript, modalManagerModule] = await Promise.all([
    readProjectFile('../index.html'),
    readProjectFile('../main.js'),
    readProjectFile('../modal-manager.js'),
  ]);

  assert.match(indexHtml, /data-drawer hidden inert/);
  assert.match(indexHtml, /data-checkout-modal hidden inert/);
  assert.match(indexHtml, /class="drawer-panel"[^>]*tabindex="-1"/);
  assert.match(indexHtml, /class="checkout-panel"[^>]*tabindex="-1"/);
  assert.match(modalManagerModule, /export function trapFocus/);
  assert.match(mainScript, /function getTopOpenModal/);
  assert.match(mainScript, /drawerRestoreFocusElement/);
  assert.match(mainScript, /checkoutRestoreFocusElement/);
  assert.match(mainScript, /event\.key === 'Tab'/);
  assert.match(mainScript, /closeModal\(drawer, 'drawer-open', drawerRestoreFocusElement/);
  assert.match(mainScript, /closeModal\(checkoutModal, 'checkout-open', checkoutRestoreFocusElement/);
});

test('public application and checkout forms have explicit labels', async () => {
  const [mainScript, formModule, styles] = await Promise.all([
    readProjectFile('../main.js'),
    readProjectFile('../public-form.js'),
    readProjectFile('../styles.css'),
  ]);

  assert.match(mainScript, /createPublicFieldId as createFieldId/);
  assert.match(formModule, /export function createPublicFieldId\(\.\.\.parts\)/);
  assert.match(mainScript, /const applicationNameId = createFieldId\('application', item\.id, 'name'\)/);
  assert.match(mainScript, /const applicationNameHelpId = createFieldId\(applicationNameId, 'help'\)/);
  assert.match(mainScript, /const applicationInterestId = createFieldId\('application', item\.id, 'interest'\)/);
  assert.match(mainScript, /const applicationInterestHelpId = createFieldId\(applicationInterestId, 'help'\)/);
  assert.match(mainScript, /<label class="field-group" for="\$\{escapeAttribute\(applicationNameId\)\}">[\s\S]*<span>이름<\/span>[\s\S]*id="\$\{escapeAttribute\(applicationNameId\)\}"[\s\S]*name="name"[\s\S]*aria-describedby="\$\{escapeAttribute\(applicationNameHelpId\)\}"/);
  assert.match(mainScript, /id="\$\{escapeAttribute\(applicationNameHelpId\)\}">신청 확인에 사용할 이름을 적어주세요\./);
  assert.match(mainScript, /<label class="field-group" for="\$\{escapeAttribute\(applicationInterestId\)\}">[\s\S]*<span>이 모임에 끌린 이유<\/span>[\s\S]*id="\$\{escapeAttribute\(applicationInterestId\)\}"[\s\S]*name="interest"[\s\S]*aria-describedby="\$\{escapeAttribute\(applicationInterestHelpId\)\}"/);
  assert.match(mainScript, /id="\$\{escapeAttribute\(applicationInterestHelpId\)\}">모임에 끌린 이유를 한 줄로 적어주세요\./);
  assert.doesNotMatch(mainScript, /<input name="name" type="text" placeholder="이름"/);
  assert.doesNotMatch(mainScript, /<input name="interest" type="text" placeholder=/);

  assert.match(mainScript, /const checkoutPayerId = createFieldId\('checkout', item\.id, 'payer'\)/);
  assert.match(mainScript, /const checkoutPayerHelpId = createFieldId\(checkoutPayerId, 'help'\)/);
  assert.match(mainScript, /<label class="field-group" for="\$\{escapeAttribute\(checkoutPayerId\)\}">[\s\S]*<span>결제자 이름 \(선택\)<\/span>[\s\S]*id="\$\{escapeAttribute\(checkoutPayerId\)\}"[\s\S]*name="payer"[\s\S]*aria-describedby="\$\{escapeAttribute\(checkoutPayerHelpId\)\}"/);
  assert.match(mainScript, /id="\$\{escapeAttribute\(checkoutPayerHelpId\)\}">비워두어도 결제를 진행할 수 있습니다\./);
  assert.match(mainScript, /<fieldset>[\s\S]*<legend>결제 수단<\/legend>[\s\S]*name="method"/);
  assert.doesNotMatch(mainScript, /<label>\s+이름 \(선택\)/);

  assert.match(styles, /\.field-group\s*\{/);
  assert.match(styles, /\.form-helper\s*\{/);
  assert.match(styles, /\.checkout-form \.field-group input\[type="text"\]/);
});

test('mobile bottom navigation is visible and tracks active sections', async () => {
  const [indexHtml, styles, mainScript] = await Promise.all([
    readProjectFile('../index.html'),
    readProjectFile('../styles.css'),
    readProjectFile('../main.js'),
  ]);

  assert.match(indexHtml, /styles\.css\?v=__ASSET_VERSION__/);
  assert.match(indexHtml, /main\.js\?v=__ASSET_VERSION__/);
  assert.match(indexHtml, /data-mobile-tabs/);
  assert.doesNotMatch(indexHtml, /data-mobile-apply/);
  assert.match(indexHtml, /data-mobile-nav="meetups"/);
  assert.match(indexHtml, /data-mobile-nav="events"/);
  assert.match(indexHtml, /data-mobile-nav="waitlist"/);
  assert.match(styles, /bottom: calc\(10px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /\.mobile-tabs a\[aria-current='page'\]/);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(mainScript, /const mobileNavLinks = document\.querySelectorAll/);
  assert.match(mainScript, /function updateMobileNavActiveSection/);
  assert.match(mainScript, /function syncMobileNavFromHash/);
  assert.match(mainScript, /syncMobileNavFromHash\(\)/);
  assert.match(mainScript, /event\.preventDefault\(\)/);
  assert.match(mainScript, /section\.scrollIntoView\(\{ block: 'start' \}\)/);
  assert.doesNotMatch(mainScript, /data-mobile-apply/);
});

test('public submission visitor hash requires a dedicated salt secret', async () => {
  const edgeFunction = await readProjectFile('../supabase/functions/create-public-submission/index.ts');

  assert.match(edgeFunction, /getRequiredEnv\('PUBLIC_SUBMISSION_HASH_SALT'\)/);
  assert.doesNotMatch(
    edgeFunction,
    /PUBLIC_SUBMISSION_HASH_SALT'\)\s*\|\|/,
    'visitor hash salt must not fall back to another secret',
  );
  assert.doesNotMatch(
    edgeFunction,
    /getVisitorHash[\s\S]{0,200}SUPABASE_SERVICE_ROLE_KEY/,
    'service role key must not be reused as the visitor hash salt',
  );
});

test('edge functions restrict CORS to known site origins', async () => {
  const sources = await Promise.all([
    readProjectFile('../supabase/functions/create-public-submission/index.ts'),
    readProjectFile('../supabase/functions/confirm-toss-payment/index.ts'),
  ]);

  sources.forEach((source) => {
    assert.doesNotMatch(
      source,
      /'Access-Control-Allow-Origin':\s*'\*'/,
      'CORS must not allow every origin',
    );
    assert.match(source, /https:\/\/subong-noah-kim\.github\.io/);
    assert.match(source, /http:\/\/localhost:5173/);
    assert.match(source, /Vary:\s*'Origin'|'Vary':\s*'Origin'/);
  });
});

test('supabase client raises a clear error when a 200 response body is not valid JSON', async () => {
  const globals = snapshotGlobals(['fetch']);

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => '<html>upstream proxy error page</html>',
  });

  try {
    await assert.rejects(
      confirmTossPayment({ paymentKey: 'payment_key_test', orderId: 'order_json_test', amount: 39000 }),
      (error) => error instanceof Error
        && error.name !== 'SyntaxError'
        && /JSON/.test(error.message),
      'invalid JSON should surface a descriptive error, not a raw SyntaxError',
    );
  } finally {
    restoreGlobals(globals);
  }
});

test('payment result success callback warns when confirmation lacks meetup information', async () => {
  const globals = snapshotGlobals(['document', 'window', 'sessionStorage', 'localStorage', 'fetch']);
  const document = createPaymentResultDom();
  const sessionStorage = createMemoryStorage();
  const localStorage = createMemoryStorage();
  const location = {
    search: '?result=success&paymentKey=payment_secret_456&orderId=order_456&amount=39000',
    pathname: '/moin/payment-result.html',
    hash: '',
  };

  globalThis.document = document;
  globalThis.window = {
    location,
    history: {
      replaceState: () => {
        location.search = '';
      },
    },
  };
  globalThis.sessionStorage = sessionStorage;
  globalThis.localStorage = localStorage;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: true }),
  });

  try {
    await import(`../payment-result.js?missing-meetup-test=${Date.now()}`);
  } finally {
    restoreGlobals(globals);
  }

  assert.equal(localStorage.getItem('momentclub:paid'), null);
  assert.equal(document.get('[data-success-title]').textContent, '테스트 결제 승인이 완료됐어요');
  assert.equal(document.get('[data-confirm-status]').dataset.status, 'fail');
  assert.match(document.get('[data-confirm-status]').textContent, /모임 정보를 받지 못해/);
});

test('checkout modal cannot reopen while a payment request is in flight', async () => {
  const mainScript = await readProjectFile('../main.js');

  assert.match(
    mainScript,
    /function openCheckout\(itemId, opener = document\.activeElement\) \{\s+if \(checkoutInProgress\) \{\s+showToast\([^)]*\);\s+return;\s+\}/,
    'openCheckout must refuse to rebuild the modal while checkoutInProgress is true',
  );
});

test('deleteMeetupImage removes only meetup bucket objects uploaded by this app', async () => {
  const globals = snapshotGlobals(['fetch']);
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => '{}' };
  };

  try {
    const removed = await deleteMeetupImage(
      'admin-access-token',
      `${SUPABASE_URL}/storage/v1/object/public/meetup-images/sunday-club/cover.jpg`,
    );

    assert.equal(removed, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'DELETE');
    assert.match(calls[0].url, /\/storage\/v1\/object\/meetup-images\/sunday-club\/cover\.jpg$/);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer admin-access-token');

    const skippedForeign = await deleteMeetupImage('admin-access-token', 'https://example.com/cover.jpg');

    assert.equal(skippedForeign, false);
    assert.equal(calls.length, 1, 'urls outside the meetup image bucket must not trigger requests');
  } finally {
    restoreGlobals(globals);
  }
});

test('admin meetup form cleans up the uploaded image when saving the meetup fails', async () => {
  const adminScript = await readProjectFile('../admin.js');

  assert.match(adminScript, /deleteMeetupImage,/, 'admin.js must import deleteMeetupImage');
  assert.match(
    adminScript,
    /catch \(error\) \{[\s\S]{0,400}deleteMeetupImage\(activeSession\.accessToken, uploadedImageUrl\)/,
    'the meetup form submit catch block must clean up the uploaded image',
  );
});

function createManualScheduler() {
  const tasks = [];

  return {
    schedule: (callback, delayMs) => {
      tasks.push({ callback, delayMs });
    },
    runNext: () => {
      const task = tasks.shift();
      if (task) task.callback();
      return task?.delayMs;
    },
    get pending() {
      return tasks.length;
    },
  };
}

test('toast queue shows messages one at a time instead of overwriting them', () => {
  const shown = [];
  let visible = false;
  const scheduler = createManualScheduler();
  const queue = createToastQueue({
    show: (message) => {
      shown.push(message);
      visible = true;
    },
    hide: () => {
      visible = false;
    },
    schedule: scheduler.schedule,
  });

  queue.push('첫 번째 알림');
  queue.push('두 번째 알림');

  assert.deepEqual(shown, ['첫 번째 알림'], 'second message must wait for the first to finish');
  assert.equal(visible, true);

  scheduler.runNext();
  assert.equal(visible, false, 'toast hides after its display window');

  scheduler.runNext();
  assert.deepEqual(shown, ['첫 번째 알림', '두 번째 알림']);
  assert.equal(visible, true);
});

test('toast queue drops consecutive duplicates but replays messages after draining', () => {
  const shown = [];
  const scheduler = createManualScheduler();
  const queue = createToastQueue({
    show: (message) => shown.push(message),
    hide: () => {},
    schedule: scheduler.schedule,
  });

  assert.equal(queue.push('같은 알림'), true);
  assert.equal(queue.push('같은 알림'), false, 'duplicate of the visible message is dropped');
  assert.equal(queue.push('다른 알림'), true);
  assert.equal(queue.push('다른 알림'), false, 'duplicate of the queued tail is dropped');

  while (scheduler.pending) {
    scheduler.runNext();
  }

  assert.deepEqual(shown, ['같은 알림', '다른 알림']);
  assert.equal(queue.push('같은 알림'), true, 'the same text can reappear once the queue drained');
  assert.deepEqual(shown, ['같은 알림', '다른 알림', '같은 알림']);
});

test('main.js routes toasts through the shared toast queue module', async () => {
  const mainScript = await readProjectFile('../main.js');

  assert.match(mainScript, /from '\.\/toast-queue\.js\?v=__ASSET_VERSION__'/);
  assert.match(mainScript, /createToastQueue\(/);
  assert.doesNotMatch(mainScript, /clearTimeout\(toastTimer\)/);
});

test('scroll handling registers a passive listener', async () => {
  const mainScript = await readProjectFile('../main.js');

  assert.match(
    mainScript,
    /window\.addEventListener\(\s*'scroll',[\s\S]{0,200}\{ passive: true \},?\s*\)/,
    'the scroll listener must declare itself passive so it cannot block scrolling',
  );
});

test('public page offers a retry control when meetup data fails to load', async () => {
  const [indexHtml, mainScript, styles] = await Promise.all([
    readProjectFile('../index.html'),
    readProjectFile('../main.js'),
    readProjectFile('../styles.css'),
  ]);

  assert.match(indexHtml, /data-load-retry hidden/);
  assert.match(indexHtml, /data-load-retry-message/);
  assert.match(indexHtml, /data-load-retry-button/);
  assert.match(styles, /\.load-retry/);

  assert.match(mainScript, /function showLoadRetryNotice\(/);
  assert.match(mainScript, /function hideLoadRetryNotice\(/);
  assert.match(
    mainScript,
    /loadRetryButton[\s\S]{0,200}await loadMeetupsFromDatabase\(\)/,
    'the retry button must re-run the meetup load',
  );
  assert.match(
    mainScript,
    /catch \(error\) \{[\s\S]{0,400}showLoadRetryNotice\(/,
    'a failed meetup load must surface the retry notice',
  );
});

test('rate limit attempt log retention matches the limit windows', async () => {
  const migration = await readProjectFile('../supabase/migrations/20260612000000_shorten_attempt_retention.sql');

  assert.match(migration, /create or replace function public\.assert_public_submission_rate_limit/);
  assert.match(migration, /now\(\) - interval '1 hour'/);
  assert.doesNotMatch(
    migration,
    /interval '1 day'/,
    'attempt rows only feed 5-10 minute windows, so a full day of retention is unnecessary',
  );
});

test('deploy pipeline runs the browser smoke checks before publishing', async () => {
  const workflow = await readProjectFile('../.github/workflows/deploy-pages.yml');

  assert.match(workflow, /npm run smoke:browser/);
});

test('link migration issues application tokens and optionally links orders', async () => {
  const migration = await readProjectFile('../supabase/migrations/20260613000000_link_orders_to_applications.sql');

  assert.match(migration, /add column if not exists confirmation_token text/);
  assert.match(migration, /add column if not exists application_id uuid references public\.applications\(id\) on delete set null/);
  assert.match(migration, /create unique index if not exists applications_confirmation_token_idx/);
  assert.match(migration, /p_application_token text default null/);
  assert.match(migration, /APPLICATION_NOT_FOUND/);
  assert.match(migration, /APPLICATION_MEETUP_MISMATCH/);
  assert.match(migration, /APPLICATION_NOT_PAYABLE/);
  assert.match(migration, /APPLICATION_ALREADY_PAID/);
  assert.match(
    migration,
    /v_action = 'demo_order' and v_application\.id is not null[\s\S]{0,200}status in \('submitted', 'reviewing'\)/,
    'demo orders must auto-accept the linked application',
  );
  assert.match(
    migration,
    /v_order\.application_id is not null[\s\S]{0,200}status in \('submitted', 'reviewing'\)/,
    'toss confirmation must auto-accept the linked application',
  );
  assert.match(
    migration,
    /insert into public\.applications \([\s\S]{0,200}confirmation_token/,
    'application inserts must populate the token',
  );
  assert.match(migration, /grant execute on function public\.create_public_order\(text, text, text, text, text, text, text, text\) to service_role/);
  assert.match(migration, /drop function if exists public\.create_public_order\(text, text, text, text, text, text, text\)/, 'old 7-arg overload must be dropped to avoid PostgREST ambiguity');
});

test('public submission function forwards application tokens and maps link errors', async () => {
  const edgeFunction = await readProjectFile('../supabase/functions/create-public-submission/index.ts');

  assert.match(edgeFunction, /p_application_token/);
  assert.match(edgeFunction, /applicationToken/);
  assert.match(edgeFunction, /APPLICATION_NOT_FOUND/);
  assert.match(edgeFunction, /APPLICATION_ALREADY_PAID/);
  assert.match(edgeFunction, /APPLICATION_NOT_PAYABLE/);
  assert.match(edgeFunction, /APPLICATION_MEETUP_MISMATCH/);
  assert.match(edgeFunction, /APPLICATION_REQUIRED/);
});

test('toss confirmation blocks double payment before capturing money', async () => {
  const edgeFunction = await readProjectFile('../supabase/functions/confirm-toss-payment/index.ts');

  assert.match(edgeFunction, /application_id/, 'order select must include the linked application');
  assert.match(
    edgeFunction,
    /APPLICATION_ALREADY_PAID[\s\S]+confirmWithToss/,
    'the already-paid guard must run before the Toss capture call',
  );
});

test('public string map helpers persist and recover meetup token maps', () => {
  const globals = snapshotGlobals(['localStorage']);
  globalThis.localStorage = createMemoryStorage({
    'momentclub:application-tokens': JSON.stringify({ 'salon-night': 'a'.repeat(64) }),
    'momentclub:broken-map': '"not-an-object"',
  });

  try {
    const map = readPublicStringMap('momentclub:application-tokens');
    assert.equal(map.get('salon-night'), 'a'.repeat(64));

    map.set('dating-values', 'b'.repeat(64));
    persistPublicStringMap('momentclub:application-tokens', map);
    assert.deepEqual(
      JSON.parse(globalThis.localStorage.getItem('momentclub:application-tokens')),
      { 'salon-night': 'a'.repeat(64), 'dating-values': 'b'.repeat(64) },
    );

    assert.equal(readPublicStringMap('momentclub:broken-map').size, 0, 'corrupted state recovers to empty map');

    const oversized = new Map([['k', 'x'.repeat(publicStateMaxValueLength + 1)]]);
    persistPublicStringMap('momentclub:oversized', oversized);
    assert.equal(readPublicStringMap('momentclub:oversized').size, 0, 'over-length values are dropped');
  } finally {
    restoreGlobals(globals);
  }
});

test('checkout requests carry the application token to the submission function', async () => {
  const globals = snapshotGlobals(['fetch']);
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: { order: {} } }) };
  };

  try {
    await createDemoOrder({
      meetup: { id: 'salon-night' },
      payerName: '',
      paymentMethod: '간편결제',
      applicationToken: 'c'.repeat(64),
    });
    assert.equal(calls[0].applicationToken, 'c'.repeat(64));
    assert.equal(calls[0].action, 'demo_order');

    await createTossPendingOrder({
      meetup: { id: 'salon-night' },
      payerName: '',
      paymentMethod: '카드',
      providerOrderId: 'mc_order_test_1234',
      checkoutToken: 'd'.repeat(64),
      applicationToken: 'c'.repeat(64),
    });
    assert.equal(calls[1].applicationToken, 'c'.repeat(64));
    assert.equal(calls[1].action, 'toss_order');
  } finally {
    restoreGlobals(globals);
  }
});

test('public flow helper gates checkout behind a stored application', () => {
  const [open, soldOut] = mergeMeetupAvailability(
    [
      { id: 'open', title: 'Open Meetup', price: '40,000원' },
      { id: 'sold-out', title: 'Sold Out Meetup', price: '20,000원' },
    ],
    [
      { meetup_id: 'open', capacity: 5, remaining_spots: 3, effective_registration_status: 'open', can_register: true },
      { meetup_id: 'sold-out', capacity: 2, remaining_spots: 0, effective_registration_status: 'sold_out', can_register: false },
    ],
  );

  const noApplication = getPublicMeetupActionState(open, { hasApplication: false });
  assert.equal(noApplication.requiresApplication, true);
  assert.equal(noApplication.canOpenCheckout, false);
  assert.equal(noApplication.paymentButtonDisabled, false, 'button stays clickable to guide users to the form');
  assert.equal(noApplication.paymentButtonText, '신청 후 결제');
  assert.equal(noApplication.canSubmitApplication, true, 'the application form itself must stay available');

  const withApplication = getPublicMeetupActionState(open, { hasApplication: true });
  assert.equal(withApplication.requiresApplication, false);
  assert.equal(withApplication.canOpenCheckout, true);
  assert.equal(withApplication.paymentButtonText, '결제하기');

  const defaulted = getPublicMeetupActionState(open);
  assert.equal(defaulted.requiresApplication, false, 'omitting the option must preserve legacy behavior');
  assert.equal(defaulted.canOpenCheckout, true);

  const paid = getPublicMeetupActionState(open, { hasApplication: true, isPaid: true });
  assert.equal(paid.requiresApplication, false);
  assert.equal(paid.canOpenCheckout, false);

  const paidWithoutApplication = getPublicMeetupActionState(open, { hasApplication: false, isPaid: true });
  assert.equal(paidWithoutApplication.requiresApplication, false, 'paid meetups never demand a new application');
  assert.equal(paidWithoutApplication.paymentButtonText, '테스트 결제 완료');

  const blockedWithoutApplication = getPublicMeetupActionState(soldOut, { hasApplication: false });
  assert.equal(blockedWithoutApplication.requiresApplication, false, 'block reasons win over the application gate');
  assert.equal(blockedWithoutApplication.paymentButtonText, '마감');
});

test('main.js stores application tokens and gates checkout on them', async () => {
  const mainScript = await readProjectFile('../main.js');

  assert.match(mainScript, /readPublicStringMap/);
  assert.match(mainScript, /persistPublicStringMap/);
  assert.match(mainScript, /momentclub:application-tokens/);
  assert.match(mainScript, /hasApplication: hasStoredApplication\(/, 'every action-state call site must pass the stored-token flag');
  assert.doesNotMatch(mainScript, /getPublicMeetupActionState\((\w+)\)(?!,)/, 'no action-state call site may omit the options bag');
  assert.match(
    mainScript,
    /function openCheckout[\s\S]{0,600}requiresApplication[\s\S]{0,300}return;/,
    'openCheckout must honor the application gate before building the modal',
  );
  assert.match(mainScript, /applicationToken: getApplicationToken\(/, 'checkout requests must carry the stored token');
  assert.match(mainScript, /APPLICATION_NOT_FOUND/, 'stale tokens must be cleared on server rejection');
  assert.match(mainScript, /confirmation_token/, 'application submissions must persist the returned token');
  assert.match(
    mainScript,
    /신청서는 저장됐지만 결제 연결 정보를 받지 못했어요\. 새로고침 후 다시 신청해주세요\./,
    'token-less live submissions must not show the plain success toast',
  );
});

test('gated payment summary explains the application-first flow', () => {
  const [open] = mergeMeetupAvailability(
    [{ id: 'open', title: 'Open Meetup', price: '40,000원' }],
    [{ meetup_id: 'open', capacity: 5, remaining_spots: 3, effective_registration_status: 'open', can_register: true }],
  );

  const gated = getPublicMeetupActionState(open, { hasApplication: false });
  assert.equal(gated.paymentSummaryDescription, '신청서를 먼저 제출하면 결제할 수 있어요.');

  const ungated = getPublicMeetupActionState(open, { hasApplication: true });
  assert.match(ungated.paymentSummaryDescription, /토스 테스트 결제/);
});

test('admin dashboard joins orders to applicants and flags paid applications', async () => {
  const [adminScript, clientScript, adminHtml] = await Promise.all([
    readProjectFile('../admin.js'),
    readProjectFile('../supabase-client.js'),
    readProjectFile('../admin.html'),
  ]);

  assert.match(clientScript, /applications\(applicant_name\)/, 'orders select must embed the linked applicant');
  assert.match(clientScript, /orders\(status\)/, 'applications select must embed linked order statuses');
  assert.match(adminScript, /<td data-label="신청자">/);
  assert.match(adminScript, /hasPaidLinkedOrder/);
  assert.match(adminHtml, /<th>신청자<\/th>/);
});

test('lock migration makes application tokens mandatory for public orders', async () => {
  const migration = await readProjectFile('../supabase/migrations/20260614000000_require_application_for_orders.sql');

  assert.match(migration, /APPLICATION_REQUIRED/);
  assert.match(migration, /create or replace function public\.create_public_order/);
  assert.match(
    migration,
    /create unique index if not exists orders_single_paid_per_application_idx/,
    'a partial unique index must backstop concurrent confirms',
  );
  assert.match(migration, /where application_id is not null[\s\S]{0,80}status in \('paid', 'demo_paid'\)/);
});

test('confirm error messaging recognizes an already-paid application', () => {
  const alreadyPaid = new Error('이미 결제가 완료된 신청입니다.');
  alreadyPaid.code = 'APPLICATION_ALREADY_PAID';

  assert.equal(
    getConfirmErrorMessage(alreadyPaid),
    '이미 결제가 완료된 신청입니다. 이전 결제가 정상 처리되어 추가 결제는 필요 없어요.',
  );
  assert.equal(
    getConfirmErrorMessage(new Error('unexpected failure')),
    '결제 승인 처리에 실패했습니다. 잠시 후 다시 시도하거나 운영자에게 문의해주세요.',
  );
});

test('admin tables collapse into labeled mobile cards', async () => {
  const [adminHtml, adminStyles, adminScript] = await Promise.all([
    readProjectFile('../admin.html'),
    readProjectFile('../admin.css'),
    readProjectFile('../admin.js'),
  ]);

  assert.match(adminHtml, /admin\.css\?v=__ASSET_VERSION__/);
  assert.match(adminHtml, /admin\.js\?v=__ASSET_VERSION__/);
  assert.match(adminScript, /<td data-label="접수">/);
  assert.match(adminScript, /<td data-label="관심 이유">/);
  assert.match(adminScript, /<td data-label="일시">/);
  assert.match(adminScript, /<td data-label="구매자">/);
  assert.match(adminScript, /<td data-label="수단">/);
  assert.match(adminScript, /<td data-label="결제 기록">/);
  assert.match(adminScript, /<td data-label="관리">/);
  assert.match(adminStyles, /\.table-section thead\s*\{\s*display: none;/);
  assert.match(adminStyles, /\.table-section tbody\s*\{\s*display: grid;/);
  assert.match(adminStyles, /\.table-section td::before\s*\{\s*content: attr\(data-label\);/);
  assert.match(adminStyles, /\.row-actions\s*\{\s*width: 100%;/);
  assert.doesNotMatch(adminStyles, /position: sticky;\s*right: 0;/);
});
