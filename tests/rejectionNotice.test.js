import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readProjectFile(pathname) {
  return readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');
}

const MIGRATION = 'supabase/migrations/20260622000000_rejection_notice.sql';

test('rejection migration claims once and returns email, name, title, subscriptions', async () => {
  const sql = await readProjectFile(MIGRATION);

  assert.match(sql, /add column if not exists rejection_notified_at timestamptz/);
  assert.match(sql, /create or replace function public\.claim_rejection_notice/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set rejection_notified_at = now\(\)/);
  assert.match(sql, /a\.status = 'rejected'/);
  assert.match(sql, /a\.rejection_notified_at is null/);
  assert.doesNotMatch(
    sql,
    /and exists \(\s*select 1\s*from public\.push_subscriptions/,
    'rejection must claim even without a push subscription, since the email still goes out',
  );
  assert.match(sql, /'applicant_email', v_application\.applicant_email/);
  assert.match(sql, /'applicant_name', v_application\.applicant_name/);
  assert.match(sql, /'meetup_title',/);
  assert.match(sql, /'subscriptions',/);
  assert.match(sql, /grant execute on function public\.claim_rejection_notice\(uuid\) to service_role/);
  assert.doesNotMatch(sql, /to authenticated|to anon/);
});

test('rejection email is polite, escapes input, and links to other meetups', async () => {
  const fn = await readProjectFile('supabase/functions/_shared/application-email.ts');

  assert.match(fn, /export function buildApplicationRejectionEmail/);
  assert.match(
    fn,
    /buildApplicationRejectionEmail[\s\S]*?escapeHtml\(applicantName\)[\s\S]*?escapeHtml\(meetupTitle\)/,
    'applicant input must be escaped in the rejection email',
  );
  assert.match(fn, /함께하지 못/, 'the copy must be gentle, not a blunt rejection');
  assert.match(fn, /신청 결과/);
});

test('send-approval-push handles a rejection kind: claim, email, then push', async () => {
  const fn = await readProjectFile('supabase/functions/send-approval-push/index.ts');

  assert.match(fn, /kind === 'rejection'/);
  assert.match(fn, /rpc\/claim_rejection_notice/);
  assert.match(fn, /buildApplicationRejectionEmail/);
  assert.match(fn, /sendBrevoEmail/);
  assert.match(
    fn,
    /handleRejectionNotice[\s\S]*?claim_rejection_notice[\s\S]*?sendBrevoEmail[\s\S]*?pushToSubscriptions/,
    'the email goes out (always, if present) and then the best-effort push',
  );
});

test('admin sends a rejection notice when an application is rejected', async () => {
  const [client, admin, status] = await Promise.all([
    readProjectFile('supabase-client.js'),
    readProjectFile('admin.js'),
    readProjectFile('admin-status.js'),
  ]);

  assert.match(client, /export async function sendRejectionNotice\(applicationId\)/);
  assert.match(client, /kind: 'rejection'/);

  assert.match(admin, /sendRejectionNotice/);
  assert.match(admin, /nextStatus === 'rejected'/);
  assert.match(admin, /getRejectionNoticeSummaryMessage/);

  assert.match(status, /export function getRejectionNoticeSummaryMessage/);
  const { getRejectionNoticeSummaryMessage } = await import('../admin-status.js');
  assert.match(getRejectionNoticeSummaryMessage({ skipped: true }), /저장 완료/);
  assert.match(getRejectionNoticeSummaryMessage({ claimed: false }), /보낼 안내가 없어요/);
  assert.match(getRejectionNoticeSummaryMessage({ claimed: true, emailed: 1, sent: 1 }), /안내 메일 발송/);
});
