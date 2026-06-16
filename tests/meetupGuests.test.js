import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readProjectFile(pathname) {
  return readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');
}

const MIGRATION = 'supabase/migrations/20260624000000_meetup_guests.sql';

test('migration creates an admin-only meetup_guests table', async () => {
  const sql = await readProjectFile(MIGRATION);

  assert.match(sql, /create table if not exists public\.meetup_guests/);
  assert.match(sql, /meetup_id text not null references public\.meetups\(id\) on delete cascade/);
  assert.match(sql, /name text not null/);
  assert.match(sql, /char_length\(trim\(name\)\) between 1 and 80/);
  assert.match(sql, /memo is null or char_length\(memo\) <= 200/);
  assert.match(sql, /create index if not exists meetup_guests_meetup_id_idx/);
  assert.match(sql, /alter table public\.meetup_guests enable row level security/);
  assert.match(sql, /grant select, insert, delete on public\.meetup_guests to authenticated/);
  assert.match(sql, /for select to authenticated\s+using \(public\.is_admin\(\)\)/);
  assert.match(sql, /for insert to authenticated\s+with check \(public\.is_admin\(\)\)/);
  assert.match(sql, /for delete to authenticated\s+using \(public\.is_admin\(\)\)/);
  // table grants must never expose guest rows to anon
  const tableSection = sql.slice(0, sql.indexOf('create or replace function'));
  assert.doesNotMatch(tableSection, /to anon/, 'guests must never be exposed to anon');
});

test('all seat functions fold in the manual guest count', async () => {
  const sql = await readProjectFile(MIGRATION);

  // every seat function references the guest table
  assert.match(sql, /create or replace function public\.list_public_meetup_availability/);
  assert.match(sql, /create or replace function public\.list_admin_meetup_availability/);
  assert.match(sql, /create or replace function public\.get_meetup_seat_snapshot/);
  assert.match(sql, /create or replace function public\.assert_meetup_can_register/);

  // remaining subtracts guests; sold-out adds guests to the order count
  assert.match(sql, /- coalesce\(guest_counts\.manual_guest_count, 0\)/);
  assert.match(sql, /v_active_order_count - v_manual_guest_count|v_active_order_count \+ v_manual_guest_count/);

  // admin availability exposes the breakdown count
  assert.match(sql, /manual_guest_count integer,/, 'admin RPC returns manual_guest_count');

  // the admin function's return type changes, so it must be dropped before recreate
  assert.match(sql, /drop function if exists public\.list_admin_meetup_availability\(\)/);

  // public RPC must NOT add a guest column (only the reduced remaining is public)
  const publicFn = sql.slice(
    sql.indexOf('create or replace function public.list_public_meetup_availability'),
    sql.indexOf('create or replace function public.list_admin_meetup_availability'),
  );
  assert.doesNotMatch(publicFn, /manual_guest_count integer/, 'public return signature stays count-free');
});

import {
  getRegistrationStatusLabel,
  getRegistrationStatusDescription,
} from '../public-availability.js';

test('public label shows capacity alongside remaining', () => {
  const withCapacity = { availabilityKnown: true, effectiveRegistrationStatus: 'open', capacity: 12, remainingSpots: 5 };
  assert.equal(getRegistrationStatusLabel(withCapacity), '정원 12명 · 잔여 5석');
  assert.match(getRegistrationStatusDescription(withCapacity), /정원 12명 중 5석/);

  // no capacity → unchanged behavior
  const noCapacity = { availabilityKnown: true, effectiveRegistrationStatus: 'open', capacity: null, remainingSpots: null };
  assert.equal(getRegistrationStatusLabel(noCapacity), '접수중');

  // sold out unchanged
  const soldOut = { availabilityKnown: true, effectiveRegistrationStatus: 'sold_out', capacity: 12, remainingSpots: 0 };
  assert.equal(getRegistrationStatusLabel(soldOut), '마감');
});

import {
  mergeAdminMeetupAvailability,
  getSeatBreakdownText,
} from '../admin-availability.js';

test('admin availability carries the guest count into the breakdown', () => {
  const merged = mergeAdminMeetupAvailability(
    [{ id: 'm1', title: '모임' }],
    [{ meetup_id: 'm1', capacity: 12, paid_order_count: 4, pending_order_count: 0, active_order_count: 4, manual_guest_count: 3, remaining_spots: 5, registration_status: 'open', effective_registration_status: 'open', can_register: true }],
  );
  const meetup = merged[0];
  assert.equal(meetup.manual_guest_count, 3);
  assert.match(getSeatBreakdownText(meetup), /게스트 3/);
  assert.match(getSeatBreakdownText(meetup), /확정 4/);
});

test('admin client exposes guest CRUD against meetup_guests', async () => {
  const client = await readProjectFile('supabase-client.js');

  assert.match(client, /export async function listMeetupGuests\(accessToken, meetupId\)/);
  assert.match(client, /export async function addMeetupGuest\(accessToken, meetupId, \{ name, memo \}\)/);
  assert.match(client, /export async function deleteMeetupGuest\(accessToken, guestId\)/);
  assert.match(client, /selectRowsWithToken\(\s*'meetup_guests'/);
  assert.match(client, /writeRowsWithToken\(\s*'meetup_guests'[\s\S]*?'POST'/);
  assert.match(client, /writeRowsWithToken\(\s*'meetup_guests'[\s\S]*?'DELETE'/);
});

test('admin meetup row exposes a guest-management button with the count', async () => {
  const { buildMeetupRows } = await import('../admin-render.js');
  const rows = buildMeetupRows([{
    id: 'm1', title: '모임', category: '문화', type: 'social',
    date_label: '6월', time_label: '19:00', location: '성수',
    price_label: '1,000원', price_amount: 1000, is_published: true,
    availability: { registrationStatus: 'open' }, manual_guest_count: 3,
  }]);
  assert.match(rows, /data-guests-meetup="m1"/);
  assert.match(rows, /게스트 3명/);
});

test('admin html has an accessible guest modal', async () => {
  const html = await readProjectFile('admin.html');
  assert.match(html, /data-guest-modal[^>]*aria-hidden="true"[^>]*inert|data-guest-modal[^>]*inert/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /data-guest-add-form/);
  assert.match(html, /data-guest-list/);
  assert.match(html, /data-guest-modal-close/);

  const css = await readProjectFile('admin.css');
  assert.match(css, /\.guest-modal/);
  assert.match(css, /\.guest-list/);
});

test('admin wires the guest modal to the client and refreshes seats', async () => {
  const admin = await readProjectFile('admin.js');

  assert.match(admin, /listMeetupGuests/);
  assert.match(admin, /addMeetupGuest/);
  assert.match(admin, /deleteMeetupGuest/);
  assert.match(admin, /data-guests-meetup/);
  assert.match(admin, /openModal\(guestModal,/, 'the guest modal uses the focus-trapping modal manager');
  assert.match(admin, /closeModal\(guestModal,/);
  // opening or mutating guests refreshes availability so the row seat summary updates
  assert.match(admin, /loadOperationalData\(\)/);
});

test('admin availability migration qualifies the guest CTE column (42702 regression)', async () => {
  // list_admin_meetup_availability is `language plpgsql`, so the RETURNS TABLE column
  // `meetup_id` shadows an unqualified `meetup_id` in the body. The guest_counts CTE must
  // qualify it as meetup_guests.meetup_id (like the sibling orders.meetup_id) or the
  // function raises 42702 "column reference meetup_id is ambiguous" at runtime.
  const fix = await readProjectFile(
    'supabase/migrations/20260625000000_fix_admin_availability_ambiguous_meetup_id.sql',
  );

  assert.match(fix, /create or replace function public\.list_admin_meetup_availability/);
  assert.match(fix, /select meetup_guests\.meetup_id, count\(\*\)/, 'guest CTE selects the qualified column');
  assert.match(fix, /group by meetup_guests\.meetup_id/, 'guest CTE groups by the qualified column');
  // must not reintroduce the bare references that caused the ambiguity
  assert.doesNotMatch(fix, /select meetup_id, count\(\*\)/);
  assert.doesNotMatch(fix, /group by meetup_id\b/);
});
