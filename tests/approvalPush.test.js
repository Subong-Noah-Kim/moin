import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function readProjectFile(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

const MIGRATION = 'supabase/migrations/20260615000000_approval_push_notifications.sql';

test('push migration stores subscriptions behind token validation and RLS', async () => {
  const sql = await readProjectFile(MIGRATION);
  assert.match(sql, /create table if not exists public\.push_subscriptions/);
  assert.match(sql, /application_id uuid not null references public\.applications\(id\) on delete cascade/);
  assert.match(sql, /endpoint text not null unique/);
  assert.match(sql, /alter table public\.push_subscriptions enable row level security/);
  assert.match(sql, /create or replace function public\.register_push_subscription/);
  assert.match(sql, /APPLICATION_NOT_FOUND/);
  assert.match(sql, /assert_public_submission_rate_limit/);
  assert.match(sql, /'push_subscription'/);
  assert.match(sql, /on conflict \(endpoint\) do update/);
  assert.match(sql, /grant execute on function public\.register_push_subscription\(text, text, text, text, text\) to service_role/);
});

test('push config exposes a base64url VAPID application server key', async () => {
  const { PUSH_APPLICATION_SERVER_KEY } = await import('../push-config.js');
  assert.match(PUSH_APPLICATION_SERVER_KEY, /^[A-Za-z0-9_-]{40,}$/, 'must be base64url without padding');
  const generator = await readProjectFile('scripts/generate-vapid-keys.mjs');
  assert.match(generator, /generateKey\(\s*\{ name: 'ECDSA', namedCurve: 'P-256' \}/);
  assert.match(generator, /base64url/);
});

test('push migration claims approval sends atomically', async () => {
  const sql = await readProjectFile(MIGRATION);
  assert.match(sql, /add column if not exists approval_notified_at timestamptz/);
  assert.match(sql, /create or replace function public\.claim_approval_push/);
  assert.match(sql, /update public\.applications[\s\S]*?set approval_notified_at = now\(\)[\s\S]*?where[\s\S]*?status = 'accepted'[\s\S]*?approval_notified_at is null[\s\S]*?returning/);
  assert.match(sql, /grant execute on function public\.claim_approval_push\(uuid\) to service_role/);
});
