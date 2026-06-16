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
