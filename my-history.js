import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js?v=__ASSET_VERSION__';
import { buildHistoryItems } from './history-view.js?v=__ASSET_VERSION__';

const SESSION_KEY = 'momentclub:history-session';

const requestView = document.querySelector('[data-history-request-view]');
const resultView = document.querySelector('[data-history-result-view]');
const emailForm = document.querySelector('[data-history-email-form]');
const emailLabel = document.querySelector('[data-history-email]');
const listContainer = document.querySelector('[data-history-list]');
const statusElement = document.querySelector('[data-history-status]');
const signOutButton = document.querySelector('[data-history-signout]');

function setStatus(message) {
  statusElement.textContent = message;
}

function getPageUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function readSessionFromHash() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (!accessToken) return null;

  const expiresAt = Number(params.get('expires_at') || 0);
  const expiresIn = Number(params.get('expires_in') || 0);

  return {
    accessToken,
    expiresAt: expiresAt ? expiresAt * 1000 : Date.now() + (expiresIn || 3600) * 1000,
  };
}

function readStoredSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (!parsed?.accessToken || !parsed?.expiresAt) return null;
    if (parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function storeSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Best effort: the page still works for this load without storage.
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function showRequestView() {
  requestView.hidden = false;
  resultView.hidden = true;
}

function showResultView() {
  requestView.hidden = true;
  resultView.hidden = false;
}

async function requestMagicLink(email) {
  const redirect = encodeURIComponent(getPageUrl());
  const response = await fetch(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${redirect}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, create_user: true }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('확인 메일을 너무 자주 요청했어요. 잠시 후 다시 시도해 주세요.');
    }

    throw new Error('확인 메일을 보내지 못했어요. 이메일 주소를 확인하고 다시 시도해 주세요.');
  }
}

let currentSession = null;

async function requestOrderRefund(orderId, reason) {
  if (!currentSession) {
    throw new Error('세션이 만료되었어요. 다시 링크로 접속해 주세요.');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_order_refund`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${currentSession.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_order_id: orderId, p_reason: reason }),
  });

  if (!response.ok) {
    throw new Error('환불 요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
}

listContainer.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-refund-request]');
  if (!button) return;

  const orderId = button.dataset.refundRequest;
  if (!window.confirm('이 결제 건의 환불을 요청할까요? 운영자가 확인 후 처리합니다.')) {
    return;
  }

  const reason = window.prompt('환불 사유를 적어주세요. (선택)', '') || '';
  button.disabled = true;
  setStatus('환불 요청을 보내는 중입니다.');

  try {
    await requestOrderRefund(orderId, reason.trim());
    await loadHistory(currentSession);
    setStatus('환불 요청을 접수했어요. 운영자가 확인 후 처리해 드릴게요.');
  } catch (error) {
    console.error(error);
    button.disabled = false;
    setStatus(error.message);
  }
});

async function loadHistory(session) {
  currentSession = session;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_history`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      showRequestView();
      throw new Error('확인 링크가 만료되었어요. 이메일을 다시 입력해 주세요.');
    }

    throw new Error('이력을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  const result = await response.json();

  emailLabel.textContent = `${result.email} 님의 신청 이력`;
  listContainer.innerHTML = buildHistoryItems(result.items || []);
  showResultView();
  setStatus('');
}

emailForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = String(new FormData(emailForm).get('email') || '').trim();
  if (!email) return;

  const button = emailForm.querySelector('button');
  button.disabled = true;
  setStatus('확인 링크를 보내는 중입니다.');

  try {
    await requestMagicLink(email);
    setStatus('메일함을 확인해 주세요. 메일 속 링크를 누르면 이 페이지에 이력이 열립니다.');
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  } finally {
    button.disabled = false;
  }
});

signOutButton.addEventListener('click', () => {
  clearSession();
  currentSession = null;
  listContainer.innerHTML = '';
  emailLabel.textContent = '';
  showRequestView();
  setStatus('');
});

function readErrorFromHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  if (!params.get('error') && !params.get('error_code')) {
    return '';
  }

  const description = params.get('error_description') || '';

  return description.includes('expired') || params.get('error_code') === 'otp_expired'
    ? '확인 링크가 만료되었거나 이미 사용되었습니다. 이메일을 다시 입력해 새 링크를 받아주세요.'
    : `확인에 실패했습니다: ${description || params.get('error_code') || params.get('error')}`;
}

const hashSession = readSessionFromHash();
const hashError = readErrorFromHash();

if (hashSession) {
  storeSession(hashSession);
}

if (hashSession || hashError) {
  window.history.replaceState(null, '', getPageUrl());
}

const activeSession = hashSession || readStoredSession();

if (activeSession) {
  setStatus('이력을 불러오는 중입니다.');
  loadHistory(activeSession).catch((error) => {
    console.error(error);
    setStatus(error.message);
  });
} else {
  showRequestView();

  if (hashError) {
    setStatus(hashError);
  }
}
