import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function readProjectFile(pathname) {
  return readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');
}

test('meetup edit form is wrapped in an accessible right-side drawer overlay', async () => {
  const html = await readProjectFile('admin.html');
  // a focus-trappable drawer overlay wraps the editor
  assert.match(html, /data-meetup-drawer[^>]*aria-hidden="true"[^>]*inert/);
  assert.match(html, /class="meetup-drawer-panel"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /data-meetup-drawer-close/);
  // the form lives inside the drawer and is no longer toggled by its own hidden attribute
  assert.match(html, /<form class="meetup-form" data-meetup-form>/);
  assert.doesNotMatch(html, /data-meetup-form hidden/);
});

test('admin.css gives the meetup drawer a right-side slide pattern and scroll lock', async () => {
  const css = await readProjectFile('admin.css');
  assert.match(css, /\.meetup-drawer-panel\b/);
  assert.match(css, /translateX\(104%\)/);
  assert.match(css, /\.meetup-drawer\[aria-hidden="false"\] \.meetup-drawer-panel/);
  assert.match(css, /body\.meetup-drawer-open/);
});

test('admin.js drives the meetup drawer through the shared modal manager', async () => {
  const admin = await readProjectFile('admin.js');
  assert.match(admin, /openModal\(meetupDrawer,/);
  assert.match(admin, /closeModal\(meetupDrawer,/);
  assert.match(admin, /trapFocus\(event, meetupDrawer\)/);
  // the inline hidden toggle is replaced by the modal manager
  assert.doesNotMatch(admin, /meetupForm\.hidden = (?:false|true)/);
});
