import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js?v=__ASSET_VERSION__';

const supabaseUrl = SUPABASE_URL.replace(/\/$/, '');
const supabaseAnonKey = SUPABASE_ANON_KEY;
const adminSessionKey = 'momentclub:admin-session';
const meetupImageBucket = 'meetup-images';
const requestTimeoutMs = 15000;
const optionalRequestTimeoutMs = 12000;
const adminMeetupFields = [
  'id',
  'type',
  'category',
  'title',
  'description',
  'host_name',
  'host_role',
  'status_label',
  'date_label',
  'time_label',
  'location',
  'price_amount',
  'price_label',
  'tags',
  'image_url',
  'schedule',
  'capacity',
  'registration_status',
  'closed_at',
  'close_reason',
  'is_published',
  'created_at',
].join(',');
const adminApplicationFields = [
  'id',
  'meetup_id',
  'applicant_name',
  'interest',
  'status',
  'source',
  'created_at',
  'orders(status)',
].join(',');
const adminOrderFields = [
  'id',
  'meetup_id',
  'buyer_name',
  'amount',
  'currency',
  'status',
  'provider',
  'payment_method',
  'source',
  'created_at',
  'refund_requested_at',
  'refund_request_reason',
  'applications(applicant_name)',
].join(',');
const adminPaymentFields = [
  'id',
  'order_id',
  'meetup_id',
  'amount',
  'currency',
  'status',
  'provider',
  'payment_method',
  'provider_payment_key',
  'paid_at',
  'created_at',
].join(',');
const adminMeetupWritableFields = [
  'id',
  'type',
  'category',
  'title',
  'description',
  'host_name',
  'host_role',
  'status_label',
  'date_label',
  'time_label',
  'location',
  'price_amount',
  'price_label',
  'tags',
  'image_url',
  'schedule',
  'capacity',
  'registration_status',
  'close_reason',
  'is_published',
];

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

function parsePriceAmount(priceLabel) {
  const digits = String(priceLabel || '').replace(/[^\d]/g, '');
  return Number(digits || 0);
}

function getNumericAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function normalizeAdminMeetupCapacity(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const capacity = Number(value);

  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error('정원은 비워두거나 1 이상의 정수여야 합니다.');
  }

  return capacity;
}

function normalizeAdminMeetupImageUrl(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : '';
  } catch {
    return '';
  }
}

function sanitizeAdminMeetupPayload(meetup, { includeId = false } = {}) {
  const payload = {};
  const allowedFields = includeId
    ? adminMeetupWritableFields
    : adminMeetupWritableFields.filter((field) => field !== 'id');

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(meetup, field)) {
      payload[field] = meetup[field];
    }
  });

  if (Object.prototype.hasOwnProperty.call(payload, 'capacity')) {
    payload.capacity = normalizeAdminMeetupCapacity(payload.capacity);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'image_url')) {
    payload.image_url = normalizeAdminMeetupImageUrl(payload.image_url);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'registration_status')
    && !['open', 'closed'].includes(payload.registration_status)) {
    throw new Error('신청 상태는 open 또는 closed만 저장할 수 있습니다.');
  }

  return payload;
}

async function callPublicSubmission(action, payload) {
  if (!isSupabaseConfigured()) {
    return { skipped: true, rows: [] };
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/create-public-submission`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    const error = new Error(message.text);
    error.status = response.status;
    error.code = message.code;
    throw error;
  }

  const body = await response.json();
  const result = body?.result || {};

  return {
    skipped: false,
    rows: [result.application || result.order || result.subscription].filter(Boolean),
  };
}

async function selectRows(tableName, queryString) {
  if (!isSupabaseConfigured()) {
    return { skipped: true, rows: [] };
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/${tableName}${queryString}`, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase select failed for ${tableName}: ${response.status} ${message}`);
  }

  return { skipped: false, rows: await response.json() };
}

async function callReadRpc(functionName, payload = {}) {
  if (!isSupabaseConfigured()) {
    return { skipped: true, rows: [] };
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase RPC failed for ${functionName}: ${response.status} ${message}`);
  }

  return { skipped: false, rows: await response.json() };
}

async function callReadRpcWithToken(functionName, accessToken, payload = {}, timeoutMs = requestTimeoutMs) {
  if (!isSupabaseConfigured()) {
    return { skipped: true, rows: [] };
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, timeoutMs);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase admin RPC failed for ${functionName}: ${response.status} ${message}`);
  }

  return response.json();
}

async function selectRowsWithToken(tableName, queryString, accessToken, timeoutMs = requestTimeoutMs) {
  if (!isSupabaseConfigured()) {
    return { skipped: true, rows: [] };
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/${tableName}${queryString}`, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  }, timeoutMs);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase admin select failed for ${tableName}: ${response.status} ${message}`);
  }

  return response.json();
}

async function writeRowsWithToken(tableName, queryString, accessToken, payload, method = 'PATCH') {
  if (!isSupabaseConfigured()) {
    return { skipped: true, rows: [] };
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/${tableName}${queryString}`, {
    method,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase admin write failed for ${tableName}: ${response.status} ${message}`);
  }

  return response.json();
}

async function authRequest(path, options = {}) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    const error = new Error(message.text);
    error.status = response.status;
    error.code = message.code;
    throw error;
  }

  return response.json();
}

async function parseErrorMessage(response) {
  const fallback = { code: String(response.status), text: `HTTP ${response.status}` };

  try {
    const payload = await response.json();
    return {
      code: payload.error_code || payload.code || payload.error || fallback.code,
      text: payload.msg || payload.message || payload.error_description || payload.error || fallback.text,
    };
  } catch {
    const text = await response.text();
    return {
      code: fallback.code,
      text: text || fallback.text,
    };
  }
}

function parseJsonBody(bodyText) {
  if (!bodyText) {
    return null;
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error('Supabase 응답을 JSON으로 해석하지 못했습니다.');
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = requestTimeoutMs) {
  const controller = new AbortController();
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('Supabase request timed out.'));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      (async () => {
        const fetchResponse = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        const bodyText = await fetchResponse.text();

        return {
          ok: fetchResponse.ok,
          status: fetchResponse.status,
          json: async () => parseJsonBody(bodyText),
          text: async () => bodyText,
        };
      })(),
      timeoutPromise,
    ]);

    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Supabase request timed out.');
    }

    if (isNetworkLoadError(error) && typeof XMLHttpRequest !== 'undefined') {
      return requestWithXhr(url, options, timeoutMs);
    }

    if (isNetworkLoadError(error)) {
      throw new Error('Supabase network request failed.');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isNetworkLoadError(error) {
  const message = error?.message || '';
  return error?.name === 'TypeError' || message.includes('Load failed') || message.includes('Failed to fetch');
}

function createResponseShim(status, bodyText) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => parseJsonBody(bodyText),
    text: async () => bodyText,
  };
}

function requestWithXhr(url, options = {}, timeoutMs = requestTimeoutMs) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || 'GET', url, true);
    xhr.timeout = timeoutMs;

    Object.entries(options.headers || {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.onload = () => {
      resolve(createResponseShim(xhr.status, xhr.responseText || ''));
    };
    xhr.onerror = () => {
      reject(new Error('Supabase network request failed.'));
    };
    xhr.ontimeout = () => {
      reject(new Error('Supabase request timed out.'));
    };
    xhr.onabort = () => {
      reject(new Error('Supabase request timed out.'));
    };
    xhr.send(options.body || null);
  });
}

function getAdminSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getLegacyAdminSessionStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeStoredAdminSession(storage) {
  try {
    storage?.removeItem(adminSessionKey);
  } catch {
    // Storage cleanup is best-effort; sign-in/out should keep moving.
  }
}

function normalizeAdminSession(session) {
  if (!session || typeof session !== 'object' || typeof session.accessToken !== 'string' || !session.accessToken) {
    return null;
  }

  const expiresAt = Number(session.expiresAt || 0);

  if (expiresAt && expiresAt <= Date.now()) {
    return null;
  }

  return {
    accessToken: session.accessToken,
    expiresAt: expiresAt || null,
    user: session.user || null,
  };
}

function createStoredAdminSession(session) {
  return normalizeAdminSession({
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    user: session.user,
  });
}

function storeAdminSession(session) {
  const storage = getAdminSessionStorage();
  const storedSession = createStoredAdminSession(session);

  clearAdminSession();

  if (!storage || !storedSession) {
    return;
  }

  try {
    storage.setItem(adminSessionKey, JSON.stringify(storedSession));
  } catch {
    // The in-memory session returned to the caller is still usable for this tab.
  }
}

export function getStoredAdminSession() {
  const storage = getAdminSessionStorage();

  try {
    const storedSession = normalizeAdminSession(JSON.parse(storage?.getItem(adminSessionKey) || 'null'));

    if (!storedSession) {
      clearAdminSession();
    } else {
      removeStoredAdminSession(getLegacyAdminSessionStorage());
    }

    return storedSession;
  } catch {
    clearAdminSession();
    return null;
  }
}

export function clearAdminSession() {
  removeStoredAdminSession(getAdminSessionStorage());
  removeStoredAdminSession(getLegacyAdminSessionStorage());
}

export function getAmountFromMeetup(meetup) {
  const storedAmount = getNumericAmount(meetup?.price_amount ?? meetup?.priceAmount);

  if (storedAmount !== null) {
    return storedAmount;
  }

  return parsePriceAmount(meetup?.price);
}

export async function fetchPublishedMeetups() {
  return callReadRpc('list_public_meetups');
}

export async function fetchPublicMeetupAvailability() {
  return callReadRpc('list_public_meetup_availability');
}

export async function createApplication({ meetup, name, interest, email }) {
  return callPublicSubmission('application', {
    meetupId: meetup.id,
    name: name.trim(),
    interest: interest.trim(),
    email: (email || '').trim(),
  });
}

export async function createDemoOrder({ meetup, payerName, paymentMethod, applicationToken }) {
  return callPublicSubmission('demo_order', {
    meetupId: meetup.id,
    payerName: payerName ? payerName.trim() : '',
    paymentMethod,
    applicationToken: applicationToken || '',
  });
}

export async function createTossPendingOrder({ meetup, payerName, paymentMethod, providerOrderId, checkoutToken, applicationToken }) {
  return callPublicSubmission('toss_order', {
    meetupId: meetup.id,
    payerName: payerName ? payerName.trim() : '',
    paymentMethod,
    providerOrderId,
    checkoutToken,
    applicationToken: applicationToken || '',
  });
}

export async function registerPushSubscription({ meetupId, applicationToken, endpoint, p256dh, auth }) {
  return callPublicSubmission('push_subscription', {
    meetupId,
    applicationToken,
    endpoint,
    p256dh,
    auth,
  });
}

export async function sendApprovalPush(applicationId) {
  if (!isSupabaseConfigured()) {
    return { skipped: true, claimed: false, sent: 0 };
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/send-approval-push`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ applicationId }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message.text);
  }

  const body = await response.json();

  return { skipped: false, ...(body?.result || {}) };
}

export async function sendRejectionNotice(applicationId) {
  if (!isSupabaseConfigured()) {
    return { skipped: true, claimed: false, emailed: 0, sent: 0 };
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/send-approval-push`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ applicationId, kind: 'rejection' }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message.text);
  }

  const body = await response.json();

  return { skipped: false, ...(body?.result || {}) };
}

export async function refundAdminOrder(accessToken, orderId, reason) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase가 연결되어 있지 않습니다.');
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/confirm-toss-payment`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'refund', orderId, reason }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    const error = new Error(message.text);
    error.status = response.status;
    error.code = message.code;
    throw error;
  }

  const body = await response.json();

  return { order: body?.order || null, payment: body?.payment || null, push: body?.push || null };
}

export async function confirmTossPayment({ paymentKey, orderId, amount }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/confirm-toss-payment`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paymentKey,
      orderId,
      amount: Number(amount),
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    const error = new Error(message.text);
    error.status = response.status;
    error.code = message.code;
    throw error;
  }

  return response.json();
}

export async function recordTossPaymentFailure({ orderId, checkoutToken, code, message }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/confirm-toss-payment`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'record-failure',
      orderId,
      checkoutToken,
      code,
      message,
    }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    const error = new Error(message.text);
    error.status = response.status;
    error.code = message.code;
    throw error;
  }

  return response.json();
}

export async function signInAdmin({ email, password }) {
  const result = await authRequest('token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  const session = {
    accessToken: result.access_token,
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
    user: result.user,
  };

  storeAdminSession(session);
  return session;
}

export async function completeAdminInvite({ accessToken, password, expiresAt }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    const error = new Error(message.text);
    error.status = response.status;
    error.code = message.code;
    throw error;
  }

  const user = await response.json();
  const session = {
    accessToken,
    expiresAt: expiresAt || Date.now() + 3600 * 1000,
    user,
  };

  storeAdminSession(session);
  return session;
}

export async function signOutAdmin() {
  const session = getStoredAdminSession();

  if (session?.accessToken) {
    try {
      await authRequest('logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      });
    } catch {
      // Local sign-out should still proceed even when the remote session already expired.
    }
  }

  clearAdminSession();
}

function getAdminFetchWarning(label, error) {
  const message = error?.message || String(error);

  if (message.includes('timed out')) {
    return `${label} 데이터 조회가 지연되어 이번 화면에서는 건너뛰었습니다.`;
  }

  return `${label} 데이터 조회 실패: ${message}`;
}

function resolveAdminRows(label, result, warnings) {
  if (result.status === 'fulfilled') {
    return result.value;
  }

  console.warn(result.reason);
  warnings.push(getAdminFetchWarning(label, result.reason));
  return [];
}

async function resolveAdminMeetups(result, warnings) {
  const adminRows = resolveAdminRows('모임', result, warnings);

  if (adminRows.length) {
    return adminRows;
  }

  try {
    const fallback = await fetchPublishedMeetups();

    if (fallback.rows.length) {
      warnings.push('관리자 전체 모임 조회가 비어 공개 모임으로 임시 표시했습니다.');
      return fallback.rows.map((row) => ({
        ...row,
        is_published: true,
        created_at: row.created_at || null,
      }));
    }
  } catch (error) {
    console.warn(error);
    warnings.push(getAdminFetchWarning('공개 모임', error));
  }

  return adminRows;
}

export async function fetchAdminOverview() {
  return {
    meetups: [],
    meetupAvailability: [],
    applications: [],
    orders: [],
    payments: [],
    warnings: [],
  };
}

export async function fetchAdminOperationalData(accessToken) {
  const warnings = [];
  const [meetupsResult, applicationsResult, availabilityResult] = await Promise.allSettled([
    selectRowsWithToken(
      'meetups',
      `?select=${adminMeetupFields}&order=created_at.desc`,
      accessToken,
      optionalRequestTimeoutMs,
    ),
    selectRowsWithToken(
      'applications',
      `?select=${adminApplicationFields}&order=created_at.desc&limit=200`,
      accessToken,
      optionalRequestTimeoutMs,
    ),
    callReadRpcWithToken('list_admin_meetup_availability', accessToken, {}, optionalRequestTimeoutMs),
  ]);

  const meetups = await resolveAdminMeetups(meetupsResult, warnings);
  const availabilityRows = resolveAdminRows('정원 상태', availabilityResult, warnings);
  const applications = resolveAdminRows('신청', applicationsResult, warnings);

  return { meetups, meetupAvailability: availabilityRows, applications, warnings };
}

export async function fetchAdminOrders(accessToken) {
  const warnings = [];
  const [ordersResult, paymentsResult] = await Promise.allSettled([
    selectRowsWithToken(
      'orders',
      `?select=${adminOrderFields}&order=created_at.desc&limit=200`,
      accessToken,
      optionalRequestTimeoutMs,
    ),
    selectRowsWithToken(
      'payments',
      `?select=${adminPaymentFields}&order=created_at.desc&limit=200`,
      accessToken,
      optionalRequestTimeoutMs,
    ),
  ]);

  return {
    orders: resolveAdminRows('주문', ordersResult, warnings),
    payments: resolveAdminRows('결제', paymentsResult, warnings),
    warnings,
  };
}

export async function createAdminMeetup(accessToken, meetup) {
  const rows = await writeRowsWithToken(
    'meetups',
    `?select=${adminMeetupFields}`,
    accessToken,
    sanitizeAdminMeetupPayload(meetup, { includeId: true }),
    'POST',
  );

  return rows?.[0] || meetup;
}

export async function updateAdminMeetup(accessToken, meetupId, meetup) {
  const rows = await writeRowsWithToken(
    'meetups',
    `?id=eq.${encodeURIComponent(meetupId)}&select=${adminMeetupFields}`,
    accessToken,
    sanitizeAdminMeetupPayload(meetup),
    'PATCH',
  );

  if (!rows?.length) {
    throw new Error('수정할 모임을 찾지 못했습니다.');
  }

  return rows[0];
}

export async function uploadMeetupImage(accessToken, file, meetupId) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'jpg';
  const safeMeetupId = String(meetupId || 'meetup')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'meetup';
  const randomId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  const filePath = `${safeMeetupId}/${Date.now().toString(36)}-${randomId}.${extension}`;
  const response = await fetchWithTimeout(`${supabaseUrl}/storage/v1/object/${meetupImageBucket}/${filePath}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: file,
  }, 30000);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase storage upload failed: ${response.status} ${message}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${meetupImageBucket}/${filePath}`;
}

export async function deleteMeetupImage(accessToken, imageUrl) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/${meetupImageBucket}/`;

  if (!imageUrl || !String(imageUrl).startsWith(publicPrefix)) {
    return false;
  }

  const filePath = String(imageUrl).slice(publicPrefix.length);
  const response = await fetchWithTimeout(`${supabaseUrl}/storage/v1/object/${meetupImageBucket}/${filePath}`, {
    method: 'DELETE',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  }, 30000);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase storage delete failed: ${response.status} ${message}`);
  }

  return true;
}

export async function setAdminMeetupVisibility(accessToken, meetupId, isPublished) {
  return updateAdminMeetup(accessToken, meetupId, { is_published: isPublished });
}

export async function updateAdminApplicationStatus(accessToken, applicationId, status) {
  const rows = await writeRowsWithToken(
    'applications',
    `?id=eq.${encodeURIComponent(applicationId)}&select=${adminApplicationFields}`,
    accessToken,
    { status },
    'PATCH',
  );

  if (!rows?.length) {
    throw new Error('수정할 신청을 찾지 못했습니다.');
  }

  return rows[0];
}

export async function updateAdminOrderStatus(accessToken, orderId, status) {
  if (!['pending', 'cancelled', 'failed'].includes(status)) {
    throw new Error('수동으로 저장할 수 없는 주문 상태입니다.');
  }

  const rows = await writeRowsWithToken(
    'orders',
    `?id=eq.${encodeURIComponent(orderId)}&select=${adminOrderFields}`,
    accessToken,
    { status },
    'PATCH',
  );

  if (!rows?.length) {
    throw new Error('수정할 주문을 찾지 못했습니다.');
  }

  return rows[0];
}
