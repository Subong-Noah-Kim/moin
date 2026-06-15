import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function readProjectFile(pathname) {
  return readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');
}

test('the install guide is an accessible modal (focus trap, escape, restore)', async () => {
  const html = await readProjectFile('index.html');

  // Starts inert + aria-hidden so the modal manager can flip it open/closed.
  assert.match(
    html,
    /data-install-guide[^>]*aria-hidden="true"[^>]*inert|data-install-guide[^>]*inert[^>]*aria-hidden="true"/,
  );
  assert.match(html, /class="install-guide-card" role="dialog" aria-modal="true"/);

  const main = await readProjectFile('main.js');
  assert.match(main, /openModal\(installGuide,/, 'opening goes through the focus-trapping modal manager');
  assert.match(main, /closeModal\(installGuide,/, 'closing restores focus via the modal manager');
  assert.match(
    main,
    /function getTopOpenModal\(\)[\s\S]*?isModalOpen\(installGuide\)/,
    'Tab is trapped inside the guide while it is open',
  );
  assert.match(
    main,
    /isModalOpen\(installGuide\)[\s\S]{0,140}closeInstallGuide\(\)/,
    'Escape closes the guide',
  );
});

test('dynamic status text is announced through live regions', async () => {
  const admin = await readProjectFile('admin.html');
  assert.match(admin, /data-login-status[^>]*role="status"|role="status"[^>]*data-login-status/);
  assert.match(admin, /data-sync-status[^>]*role="status"|role="status"[^>]*data-sync-status/);
  assert.match(admin, /data-meetup-form-status[^>]*role="status"|role="status"[^>]*data-meetup-form-status/);

  const payment = await readProjectFile('payment-result.html');
  assert.match(payment, /data-confirm-status[^>]*role="status"|role="status"[^>]*data-confirm-status/);
  assert.match(payment, /data-fail-sync-status[^>]*role="status"|role="status"[^>]*data-fail-sync-status/);
});
