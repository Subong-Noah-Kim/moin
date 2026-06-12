import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readProjectFile(pathname) {
  return readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');
}

const MIGRATION = 'supabase/migrations/20260621000000_email_history.sql';

test('applications store an applicant email for contact and history lookup', async () => {
  const sql = await readProjectFile(MIGRATION);

  assert.match(sql, /add column if not exists applicant_email text/);
  assert.match(
    sql,
    /drop function if exists public\.create_public_application\(text, text, text, text\)/,
    'the old 4-arg overload must be dropped to avoid PostgREST ambiguity',
  );
  assert.match(sql, /p_applicant_email text default null/);
  assert.match(
    sql,
    /position\('@' in v_email\)/,
    'the RPC must sanity-check the email shape server-side',
  );
  assert.match(
    sql,
    /lower\(trim\(coalesce\(p_applicant_email/,
    'emails must be stored lowercased for case-insensitive lookup',
  );
});

test('get_my_history returns only the callers applications without secrets', async () => {
  const sql = await readProjectFile(MIGRATION);

  assert.match(sql, /create or replace function public\.get_my_history\(\)/);
  assert.match(sql, /security definer/);
  assert.match(
    sql,
    /auth\.jwt\(\)\s*->>\s*'email'/,
    'identity must come from the verified magic-link session, not from a parameter',
  );
  assert.match(sql, /grant execute on function public\.get_my_history\(\) to authenticated/);
  assert.doesNotMatch(
    sql.slice(sql.indexOf('get_my_history')),
    /confirmation_token|checkout_token/,
    'history payloads must never leak tokens',
  );
});

test('public submission function requires and forwards a valid applicant email', async () => {
  const fn = await readProjectFile('supabase/functions/create-public-submission/index.ts');

  assert.match(fn, /p_applicant_email/);
  assert.match(fn, /EMAIL_REQUIRED/);
  assert.match(fn, /EMAIL_INVALID/);

  const errors = await readProjectFile('supabase/functions/_shared/public-submission-errors.ts');
  assert.match(errors, /match: 'EMAIL_REQUIRED', status: 400/);
  assert.match(errors, /match: 'EMAIL_INVALID', status: 400/);
  assert.match(errors, /이메일/);
});

test('application form collects the email and submits it', async () => {
  const { createPublicApplicationPayload } = await import('../public-form.js');

  const payload = createPublicApplicationPayload(
    new Map([
      ['name', ' 수봉 '],
      ['interest', '관심'],
      ['email', ' Sub@Example.COM '],
    ]),
  );
  assert.equal(payload.email, 'Sub@Example.COM');

  const main = await readProjectFile('main.js');
  assert.match(main, /type="email"/);
  assert.match(main, /name="email"/);
  assert.match(main, /autocomplete="email"/);
  assert.match(main, /신청 확인과 모임 안내에만 사용해요/);
});

test('history page requests a magic link and reads the session from the callback hash', async () => {
  const html = await readProjectFile('my-history.html');
  assert.match(html, /my-history\.js\?v=__ASSET_VERSION__/);
  assert.match(html, /styles\.css\?v=__ASSET_VERSION__/);
  assert.match(html, /data-history-email-form/);
  assert.match(html, /data-history-list/);

  const script = await readProjectFile('my-history.js');
  assert.match(script, /auth\/v1\/otp/);
  assert.match(script, /create_user: true/);
  assert.match(script, /redirect_to/);
  assert.match(script, /access_token/);
  assert.match(script, /rpc\/get_my_history/);
  assert.match(script, /replaceState/, 'session tokens must be cleaned from the URL after capture');

  const index = await readProjectFile('index.html');
  assert.match(index, /my-history\.html/, 'the public site must link to the history page');
});

test('history view builder escapes content and covers empty and paid states', async () => {
  const { buildHistoryItems, getHistoryStatusText } = await import('../history-view.js');

  const markup = buildHistoryItems([
    {
      application: {
        meetup_title: '취향 <살롱>',
        applicant_name: '수봉',
        status: 'accepted',
        created_at: '2026-06-13T10:00:00+09:00',
      },
      orders: [
        { status: 'paid', amount: 1000, created_at: '2026-06-13T10:05:00+09:00' },
      ],
    },
  ]);
  assert.match(markup, /취향 &lt;살롱&gt;/);
  assert.match(markup, /승인/);
  assert.match(markup, /1,000원/);
  assert.doesNotMatch(markup, /<살롱>/);

  assert.match(buildHistoryItems([]), /신청 내역이 없습니다/);
  assert.equal(getHistoryStatusText('submitted'), '검토 중');
  assert.equal(getHistoryStatusText('accepted'), '승인');
  assert.equal(getHistoryStatusText('rejected'), '미선정');
});

test('pages deploy ships the history page and modules', async () => {
  const workflow = await readProjectFile('.github/workflows/deploy-pages.yml');

  assert.match(workflow, /cp my-history\.html dist\//);
  assert.match(workflow, /cp my-history\.js dist\//);
  assert.match(workflow, /cp history-view\.js dist\//);
});
