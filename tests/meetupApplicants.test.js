import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function readProjectFile(pathname) {
  return readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');
}

test('each meetup row has an applicants button carrying the per-meetup count', async () => {
  const { buildMeetupRows } = await import('../admin-render.js');
  const rows = buildMeetupRows([{
    id: 'm1', title: '취향 살롱', category: '문화', type: 'social',
    date_label: '6월 13일', time_label: '19:00', location: '성수',
    price_label: '1,000원', price_amount: 1000, is_published: true,
    applicant_count: 5,
  }]);
  assert.match(rows, /data-applicants-meetup="m1"/);
  assert.match(rows, /신청자 5명/);
});

test('buildMeetupApplicantList renders applicant name, status badge, interest and an empty fallback', async () => {
  const { buildMeetupApplicantList } = await import('../admin-render.js');
  const list = buildMeetupApplicantList([
    { id: 'a1', applicant_name: '김무진', interest: '이름이 마음에 들어요', status: 'accepted', created_at: '2026-06-16T03:20:00+09:00' },
    { id: 'a2', applicant_name: '<b>해커</b>', interest: null, status: 'rejected', created_at: '2026-06-16T04:00:00+09:00' },
  ]);
  assert.match(list, /김무진/);
  assert.match(list, /승인/); // accepted label
  assert.match(list, /is-accepted/);
  assert.match(list, /이름이 마음에 들어요/);
  assert.match(list, /거절/); // rejected label
  assert.match(list, /&lt;b&gt;해커&lt;\/b&gt;/); // name is escaped

  assert.match(buildMeetupApplicantList([]), /아직 신청자가 없습니다/);
});

test('admin.html has an accessible per-meetup applicant drawer', async () => {
  const html = await readProjectFile('admin.html');
  assert.match(html, /data-applicant-drawer[^>]*aria-hidden="true"[^>]*inert/);
  assert.match(html, /data-applicant-list/);
  assert.match(html, /data-applicant-drawer-close/);
});

test('admin.js opens the applicant drawer from the meetup row via the modal manager', async () => {
  const admin = await readProjectFile('admin.js');
  assert.match(admin, /buildMeetupApplicantList/);
  assert.match(admin, /data-applicants-meetup/);
  assert.match(admin, /openModal\(applicantDrawer,/);
  assert.match(admin, /closeModal\(applicantDrawer,/);
  assert.match(admin, /trapFocus\(event, applicantDrawer\)/);
});
