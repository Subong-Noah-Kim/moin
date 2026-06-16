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
  assert.doesNotMatch(sql, /to anon/, 'guests must never be exposed to anon');
});
