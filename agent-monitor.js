const liveStatusUrl = './AGENTIC_LIVE_STATUS.json';
const fallbackPollIntervalMs = 5000;

const state = {
  requestId: 0,
  timerId: null,
  isPaused: false,
  pollIntervalMs: fallbackPollIntervalMs,
};

const monitorState = document.querySelector('[data-monitor-state]');
const refreshButton = document.querySelector('[data-refresh-live]');
const togglePollingButton = document.querySelector('[data-toggle-polling]');
const liveSummary = document.querySelector('[data-live-summary]');
const agentList = document.querySelector('[data-agent-list]');
const eventList = document.querySelector('[data-event-list]');
const agentCount = document.querySelector('[data-agent-count]');
const eventCount = document.querySelector('[data-event-count]');
const updatedAt = document.querySelector('[data-updated-at]');
const pollingNote = document.querySelector('[data-polling-note]');

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const statusLabels = {
  running: '진행중',
  idle: '대기',
  blocked: '막힘',
  review: '검토',
  paused: '일시중지',
  done: '완료',
};

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

  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return String(value);
  }
}

function getStatusClass(status) {
  if (status === 'running') return 'running';
  if (status === 'blocked') return 'blocked';
  if (status === 'review') return 'review';
  if (status === 'paused') return 'paused';
  return 'idle';
}

function renderMessage(message) {
  liveSummary.innerHTML = '';
  agentList.innerHTML = `<article class="agent-card"><p>${escapeHtml(message)}</p></article>`;
  eventList.innerHTML = '';
  agentCount.textContent = '0명';
  eventCount.textContent = '0개';
}

function renderLiveStatus(data) {
  const agents = Array.isArray(data.agents) ? data.agents : [];
  const events = Array.isArray(data.events) ? data.events : [];
  const summary = data.summary || {};
  const activeAgents = summary.activeAgents ?? agents.filter((agent) => agent.status === 'running').length;
  const blockedAgents = summary.blockedAgents ?? agents.filter((agent) => agent.status === 'blocked').length;
  const waitingAgents = summary.waitingAgents ?? agents.filter((agent) => agent.status === 'idle').length;
  const currentFocus = summary.currentFocus || data.currentFocus || '-';

  state.pollIntervalMs = Number(data.monitor?.pollIntervalMs || fallbackPollIntervalMs);
  updatedAt.textContent = `업데이트 ${formatDate(data.updatedAt)}`;
  agentCount.textContent = `${agents.length}명`;
  eventCount.textContent = `${events.length}개`;
  liveSummary.innerHTML = [
    ['진행 Agent', activeAgents],
    ['대기 Agent', waitingAgents],
    ['막힘', blockedAgents],
    ['현재 초점', currentFocus],
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

  agentList.innerHTML =
    agents
      .map(
        (agent) => `
          <article class="agent-card">
            <header>
              <div>
                <strong>${escapeHtml(agent.name)}</strong>
                <small>${escapeHtml(agent.role || '-')} · ${formatDate(agent.updatedAt)}</small>
              </div>
              <span class="pill is-${escapeHtml(getStatusClass(agent.status))}">
                ${escapeHtml(statusLabels[agent.status] || agent.status || '대기')}
              </span>
            </header>
            <p>${escapeHtml(agent.currentTask || '미할당')}</p>
            ${agent.next ? `<p><span class="pill">Next</span> ${escapeHtml(agent.next)}</p>` : ''}
            ${agent.blocker ? `<p><span class="pill is-blocked">Blocker</span> ${escapeHtml(agent.blocker)}</p>` : ''}
          </article>
        `,
      )
      .join('') || '<article class="agent-card"><p>Agent 상태가 없습니다.</p></article>';

  eventList.innerHTML =
    events
      .map(
        (event) => `
          <article class="event-item">
            <header>
              <div>
                <strong>${escapeHtml(event.title || '-')}</strong>
                <small>${formatDate(event.time)} · ${escapeHtml(event.agent || 'system')}</small>
              </div>
              <span class="pill is-${escapeHtml(getStatusClass(event.level))}">
                ${escapeHtml(event.level || 'info')}
              </span>
            </header>
            <p>${escapeHtml(event.body || '')}</p>
          </article>
        `,
      )
      .join('') || '<article class="event-item"><p>최근 작업 기록이 없습니다.</p></article>';
}

async function fetchLiveStatus() {
  const response = await fetch(`${liveStatusUrl}?t=${Date.now()}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Live status fetch failed: ${response.status}`);
  }

  return response.json();
}

async function loadLiveStatus() {
  const requestId = ++state.requestId;
  refreshButton.disabled = true;
  monitorState.textContent = '확인 중';

  try {
    const data = await fetchLiveStatus();

    if (requestId !== state.requestId) {
      return;
    }

    renderLiveStatus(data);
    monitorState.textContent = state.isPaused ? '자동 갱신 일시중지' : '자동 갱신 중';
  } catch (error) {
    console.error(error);

    if (requestId !== state.requestId) {
      return;
    }

    renderMessage('로컬 현황 파일을 불러오지 못했습니다.');
    monitorState.textContent = '확인 실패';
  } finally {
    if (requestId === state.requestId) {
      refreshButton.disabled = false;
      schedulePolling();
    }
  }
}

function clearPolling() {
  if (state.timerId) {
    window.clearTimeout(state.timerId);
    state.timerId = null;
  }
}

function schedulePolling() {
  clearPolling();

  if (state.isPaused || document.visibilityState !== 'visible') {
    pollingNote.textContent = state.isPaused ? '자동 갱신이 일시중지되었습니다.' : '백그라운드에서는 자동 갱신을 멈춥니다.';
    return;
  }

  const seconds = Math.max(1, Math.round(state.pollIntervalMs / 1000));
  pollingNote.textContent = `${seconds}초마다 로컬 현황을 다시 확인합니다.`;
  state.timerId = window.setTimeout(loadLiveStatus, state.pollIntervalMs);
}

refreshButton.addEventListener('click', () => {
  void loadLiveStatus();
});

togglePollingButton.addEventListener('click', () => {
  state.isPaused = !state.isPaused;
  togglePollingButton.textContent = state.isPaused ? '자동 갱신 재개' : '자동 갱신 중지';
  monitorState.textContent = state.isPaused ? '자동 갱신 일시중지' : '자동 갱신 중';

  if (state.isPaused) {
    clearPolling();
    pollingNote.textContent = '자동 갱신이 일시중지되었습니다.';
    return;
  }

  void loadLiveStatus();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !state.isPaused) {
    void loadLiveStatus();
    return;
  }

  schedulePolling();
});

void loadLiveStatus();
