import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getAmountFromMeetup } from '../supabase-client.js';

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

test('payment hardening migration locks anonymous Toss orders to meetup price and checkout token', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260606070000_harden_toss_payment_security.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /amount = coalesce/);
  assert.match(migration, /price_amount/);
  assert.match(migration, /checkout_token is not null/);
  assert.match(migration, /confirm_toss_payment_order/);
});

test('Toss confirmation function validates server amount and failure checkout token', async () => {
  const edgeFunction = await readFile(
    new URL('../supabase/functions/confirm-toss-payment/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(edgeFunction, /assertServerAmount/);
  assert.match(edgeFunction, /findMeetupForOrder/);
  assert.match(edgeFunction, /checkoutToken is required/);
  assert.match(edgeFunction, /confirm_toss_payment_order/);
});

test('public meetup rendering escapes dynamic content before writing HTML templates', async () => {
  const mainScript = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  assert.match(mainScript, /function escapeHtml/);
  assert.match(mainScript, /function escapeAttribute/);
  assert.match(mainScript, /function escapeImageUrl/);
  assert.match(mainScript, /createTagMarkup\(tags\) {\s+return tags\.map\(\(tag\) => `<span>\$\{escapeHtml\(tag\)\}<\/span>`\)/);
  assert.match(mainScript, /alt="\$\{escapeAttribute\(item\.title\)\}"/);
  assert.match(mainScript, /src="\$\{escapeImageUrl\(item\.image\)\}"/);
  assert.match(mainScript, /data-detail="\$\{escapeAttribute\(item\.id\)\}"/);
});

test('checkout waits for Toss SDK loading and prevents duplicate pending orders', async () => {
  const mainScript = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  assert.match(mainScript, /let tossSdkScriptPromise/);
  assert.match(mainScript, /await ensureTossSdkScript\(\)/);
  assert.match(mainScript, /script\.addEventListener\('load', handleLoad/);
  assert.match(mainScript, /script\.addEventListener\('error', handleError/);
  assert.match(mainScript, /let checkoutInProgress = false/);
  assert.match(mainScript, /if \(checkoutInProgress\)/);
  assert.match(mainScript, /shouldUnlockForm = false/);
});

test('drawer and checkout modal use inert focus traps with opener restoration', async () => {
  const [indexHtml, mainScript] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../main.js', import.meta.url), 'utf8'),
  ]);

  assert.match(indexHtml, /data-drawer hidden inert/);
  assert.match(indexHtml, /data-checkout-modal hidden inert/);
  assert.match(indexHtml, /class="drawer-panel"[^>]*tabindex="-1"/);
  assert.match(indexHtml, /class="checkout-panel"[^>]*tabindex="-1"/);
  assert.match(mainScript, /function trapFocus/);
  assert.match(mainScript, /function getTopOpenModal/);
  assert.match(mainScript, /drawerRestoreFocusElement/);
  assert.match(mainScript, /checkoutRestoreFocusElement/);
  assert.match(mainScript, /event\.key === 'Tab'/);
  assert.match(mainScript, /closeModal\(drawer, 'drawer-open', drawerRestoreFocusElement/);
  assert.match(mainScript, /closeModal\(checkoutModal, 'checkout-open', checkoutRestoreFocusElement/);
});

test('mobile bottom navigation is visible and tracks active sections', async () => {
  const [indexHtml, styles, mainScript] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../main.js', import.meta.url), 'utf8'),
  ]);

  assert.match(indexHtml, /styles\.css\?v=mobile-nav-5/);
  assert.match(indexHtml, /main\.js\?v=mobile-nav-5/);
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

test('admin tables collapse into labeled mobile cards', async () => {
  const [adminHtml, adminStyles, adminScript] = await Promise.all([
    readFile(new URL('../admin.html', import.meta.url), 'utf8'),
    readFile(new URL('../admin.css', import.meta.url), 'utf8'),
    readFile(new URL('../admin.js', import.meta.url), 'utf8'),
  ]);

  assert.match(adminHtml, /admin\.css\?v=admin-mobile-cards-1/);
  assert.match(adminHtml, /admin\.js\?v=admin-mobile-cards-1/);
  assert.match(adminScript, /<td data-label="접수">/);
  assert.match(adminScript, /<td data-label="관심 이유">/);
  assert.match(adminScript, /<td data-label="일시">/);
  assert.match(adminScript, /<td data-label="구매자">/);
  assert.match(adminScript, /<td data-label="수단">/);
  assert.match(adminScript, /<td data-label="관리">/);
  assert.match(adminStyles, /\.table-section thead\s*\{\s*display: none;/);
  assert.match(adminStyles, /\.table-section tbody\s*\{\s*display: grid;/);
  assert.match(adminStyles, /\.table-section td::before\s*\{\s*content: attr\(data-label\);/);
  assert.match(adminStyles, /\.row-actions\s*\{\s*width: 100%;/);
  assert.doesNotMatch(adminStyles, /position: sticky;\s*right: 0;/);
});
