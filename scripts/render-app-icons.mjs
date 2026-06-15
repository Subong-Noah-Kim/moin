import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chrome = chromeCandidates.find((candidate) => existsSync(candidate));
if (!chrome) {
  console.error('Chrome executable not found. Set CHROME_BIN to render app icons.');
  process.exit(1);
}

const renders = [
  { svg: 'icons/app-icon.svg', size: 192, out: 'icons/icon-192.png' },
  { svg: 'icons/app-icon.svg', size: 512, out: 'icons/icon-512.png' },
  { svg: 'icons/app-icon-fullbleed.svg', size: 512, out: 'icons/icon-maskable-512.png' },
  { svg: 'icons/app-icon-fullbleed.svg', size: 180, out: 'icons/apple-touch-icon-180.png' },
  { svg: 'icons/og-image.svg', width: 1200, height: 630, out: 'icons/og-image.png' },
];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDebugger(port, { timeoutMs = 15000 } = {}) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return response.json();
      lastError = new Error(`debugger endpoint returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(200);
  }

  throw lastError || new Error('Timed out waiting for Chrome debugger');
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
      this.ws.addEventListener('message', (event) => this.handleMessage(event.data));
    });
  }

  handleMessage(data) {
    const message = JSON.parse(data);

    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);

      if (message.error) {
        reject(new Error(`${message.error.message}: ${message.error.data || ''}`.trim()));
      } else {
        resolve(message.result || {});
      }

      return;
    }

    this.listeners.forEach((listener) => listener(message));
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    this.ws.send(JSON.stringify(payload));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  waitForEvent(sessionId, method, { timeoutMs = 15000 } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      const listener = (message) => {
        if (message.sessionId !== sessionId || message.method !== method) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(message.params || {});
      };

      this.listeners.add(listener);
    });
  }

  close() {
    this.ws?.close();
  }
}

async function renderIcon(connection, { svg, size, width, height, out }) {
  const renderWidth = width || size;
  const renderHeight = height || size;
  const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });

  try {
    await connection.send('Page.enable', {}, sessionId);
    await connection.send('Emulation.setDeviceMetricsOverride', {
      width: renderWidth,
      height: renderHeight,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId);
    await connection.send('Emulation.setDefaultBackgroundColorOverride', {
      color: { r: 0, g: 0, b: 0, a: 0 },
    }, sessionId);

    const load = connection.waitForEvent(sessionId, 'Page.loadEventFired');
    await connection.send('Page.navigate', { url: `file://${path.join(root, svg)}` }, sessionId);
    await load;

    const { data } = await connection.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: renderWidth, height: renderHeight, scale: 1 },
    }, sessionId);

    writeFileSync(path.join(root, out), Buffer.from(data, 'base64'));
    console.log(`Rendered ${out}`);
  } finally {
    await connection.send('Target.closeTarget', { targetId });
  }
}

const userDataDir = mkdtempSync(path.join(tmpdir(), 'moin-app-icons-'));
const debuggingPort = await getFreePort();
const browser = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  `--user-data-dir=${userDataDir}`,
  `--remote-debugging-port=${debuggingPort}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let connection;

try {
  const { webSocketDebuggerUrl } = await waitForDebugger(debuggingPort);
  connection = new CdpConnection(webSocketDebuggerUrl);
  await connection.connect();

  for (const render of renders) {
    await renderIcon(connection, render);
  }
} finally {
  connection?.close();
  if (browser.exitCode === null) {
    const exited = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill();
    await exited;
  }
  rmSync(userDataDir, { recursive: true, force: true });
}
