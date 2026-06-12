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

async function loadHistory(session) {
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
  listContainer.innerHTML = '';
  emailLabel.textContent = '';
  showRequestView();
  setStatus('');
});

const hashSession = readSessionFromHash();

if (hashSession) {
  storeSession(hashSession);
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
}
