import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function readProjectFile(pathname) {
  return readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');
}

test('the clickable seat cell is the manage entry point and shows the applicant count', async () => {
  const { buildMeetupRows } = await import('../admin-render.js');
  const rows = buildMeetupRows([{
    id: 'm1', title: '취향 살롱', category: '문화', type: 'social',
    date_label: '6월 13일', time_label: '19:00', location: '성수',
    price_label: '1,000원', price_amount: 1000, is_published: true,
    applicant_count: 5, manual_guest_count: 2,
  }]);
  // the seat cell itself is the button that opens the manage drawer
  assert.match(rows, /class="seat-summary" data-manage-meetup="m1"/);
  assert.match(rows, /신청 5명/);
  assert.match(rows, /게스트 2/); // guest count in the seat breakdown
  // no separate manage button remains in the row actions
  assert.doesNotMatch(rows, /row-actions[\s\S]*data-manage-meetup/);
});

test('buildMeetupApplicantList renders an editable status select, interest and an empty fallback', async () => {
  const { buildMeetupApplicantList } = await import('../admin-render.js');
  const list = buildMeetupApplicantList([
    { id: 'a1', applicant_name: '김무진', interest: '이름이 마음에 들어요', status: 'accepted', created_at: '2026-06-16T03:20:00+09:00' },
    { id: 'a2', applicant_name: '<b>해커</b>', interest: null, status: 'submitted', created_at: '2026-06-16T04:00:00+09:00' },
  ]);
  assert.match(list, /김무진/);
  assert.match(list, /data-application-status="a1"/); // status is editable
  assert.match(list, /data-current-status="accepted"/);
  assert.match(list, /승인/); // accepted option label present in the select
  assert.match(list, /거절/); // rejected option also available
  assert.match(list, /이름이 마음에 들어요/);
  assert.match(list, /&lt;b&gt;해커&lt;\/b&gt;/); // name is escaped

  assert.match(buildMeetupApplicantList([]), /아직 신청자가 없습니다/);
});

test('admin.html has one accessible manage drawer with applicant and guest sections', async () => {
  const html = await readProjectFile('admin.html');
  assert.match(html, /data-manage-drawer[^>]*aria-hidden="true"[^>]*inert/);
  assert.match(html, /data-applicant-list/);
  assert.match(html, /data-applicant-section-title/);
  assert.match(html, /data-guest-add-form/);
  assert.match(html, /data-guest-list/);
  assert.match(html, /data-manage-drawer-close/);
});

test('admin.js opens the manage drawer and edits applicant status from within it', async () => {
  const admin = await readProjectFile('admin.js');
  assert.match(admin, /buildMeetupApplicantList/);
  assert.match(admin, /data-manage-meetup/);
  assert.match(admin, /openModal\(manageDrawer,/);
  assert.match(admin, /closeModal\(manageDrawer,/);
  assert.match(admin, /trapFocus\(event, manageDrawer\)/);
  // status changes are handled from both the 신청 tab and the drawer applicant list
  assert.match(admin, /applicantList\.addEventListener\('change', handleApplicationStatusChange\)/);
});
