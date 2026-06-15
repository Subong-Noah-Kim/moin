import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readProjectFile(pathname) {
  return readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');
}

const MIGRATION = 'supabase/migrations/20260623000000_user_refund_requests.sql';

test('refund-request migration adds columns and a session-verified request RPC', async () => {
  const sql = await readProjectFile(MIGRATION);

  assert.match(sql, /add column if not exists refund_requested_at timestamptz/);
  assert.match(sql, /add column if not exists refund_request_reason text/);

  assert.match(sql, /create or replace function public\.request_order_refund\(\s*p_order_id uuid,\s*p_reason text\s*\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /auth\.jwt\(\)\s*->>\s*'email'/, 'identity comes from the magic-link session');
  assert.match(
    sql,
    /lower\(v_application\.applicant_email\) <> v_email|v_owner_email <> v_email/,
    'a user may only request refunds for their own orders',
  );
  assert.match(sql, /status not in \('paid', 'demo_paid'\)/, 'only completed payments are refund-requestable');
  assert.match(sql, /refund_requested_at is not null/, 'requests must be idempotent');
  assert.match(sql, /grant execute on function public\.request_order_refund\(uuid, text\) to authenticated/);

  // history now exposes the order id and the requested flag
  assert.match(sql, /create or replace function public\.get_my_history/);
  assert.match(sql, /'id', o\.id/);
  assert.match(sql, /'refund_requested_at', o\.refund_requested_at/);
});

test('history view shows a refund-request button only on completed, un-requested orders', async () => {
  const { buildHistoryItems } = await import('../history-view.js');

  const render = (order) => buildHistoryItems([{ application: { meetup_title: 'm', status: 'accepted', created_at: '2026-06-15T10:00:00+09:00' }, orders: [order] }]);

  const paid = render({ id: 'o-paid', status: 'paid', amount: 1000, created_at: '2026-06-15T10:00:00+09:00' });
  assert.match(paid, /data-refund-request="o-paid"/);

  const demo = render({ id: 'o-demo', status: 'demo_paid', amount: 1000, created_at: '2026-06-15T10:00:00+09:00' });
  assert.match(demo, /data-refund-request="o-demo"/);

  const requested = render({ id: 'o-req', status: 'paid', amount: 1000, created_at: '2026-06-15T10:00:00+09:00', refund_requested_at: '2026-06-15T11:00:00+09:00' });
  assert.doesNotMatch(requested, /data-refund-request="o-req"/, 'an already-requested order shows status, not the button');
  assert.match(requested, /환불 요청됨/);

  const pending = render({ id: 'o-pend', status: 'pending', amount: 1000, created_at: '2026-06-15T10:00:00+09:00' });
  assert.doesNotMatch(pending, /data-refund-request/, 'pending orders are not refundable');

  const refunded = render({ id: 'o-ref', status: 'refunded', amount: 1000, created_at: '2026-06-15T10:00:00+09:00' });
  assert.doesNotMatch(refunded, /data-refund-request/, 'refunded orders cannot be requested again');
});

test('history page wires the refund request to the session-authenticated RPC', async () => {
  const script = await readProjectFile('my-history.js');

  assert.match(script, /data-refund-request/);
  assert.match(script, /rpc\/request_order_refund/);
  assert.match(script, /Authorization: `Bearer \$\{[^}]*accessToken\}`/, 'the request must carry the session token');
  assert.match(script, /confirm\(/, 'refund requests need explicit user confirmation');
});

test('admin order rows flag a pending refund request', async () => {
  const client = await readProjectFile('supabase-client.js');
  assert.match(client, /refund_requested_at/, 'admin order fetch includes the request flag');

  const renderModule = await readProjectFile('admin-render.js');
  assert.match(renderModule, /refund_requested_at/);
  assert.match(renderModule, /환불 요청/);

  const { buildOrderRows } = await import('../admin-render.js');
  const rows = buildOrderRows(
    [{ id: 'o1', meetup_id: 'm', amount: 1000, status: 'paid', provider: 'tosspayments', created_at: '2026-06-15T10:00:00+09:00', refund_requested_at: '2026-06-15T11:00:00+09:00', refund_request_reason: '일정이 안 맞아요' }],
    { getMeetupTitle: (id) => id, getPaymentForOrder: () => undefined },
  );
  assert.match(rows, /환불 요청됨/, 'a requested order is flagged for the operator');
  assert.match(rows, /일정이 안 맞아요/, 'the reason is shown to the operator');
});
