import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readProjectFile(pathname) {
  return readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');
}

test('brevo transport posts to the transactional API, is best-effort, and no-ops without a key', async () => {
  const fn = await readProjectFile('supabase/functions/_shared/brevo-email.ts');

  assert.match(fn, /https:\/\/api\.brevo\.com\/v3\/smtp\/email/);
  assert.match(fn, /'api-key'/, 'authentication must use the Brevo api-key header');
  assert.match(fn, /Deno\.env\.get\('BREVO_API_KEY'\)/);
  assert.match(
    fn,
    /if \(!apiKey\)[\s\S]{0,120}return/,
    'a missing key must skip sending, not throw, so deploy-before-key is safe',
  );
  assert.match(fn, /htmlContent/);
  assert.match(fn, /sender/);
  assert.match(fn, /BREVO_SENDER_EMAIL/);
  assert.match(
    fn,
    /try \{[\s\S]*?\} catch/,
    'send failures must never propagate to the caller',
  );
});

test('application confirmation builds an escaped Korean email and links to history', async () => {
  const fn = await readProjectFile('supabase/functions/_shared/application-email.ts');

  assert.match(fn, /export function buildApplicationConfirmationEmail/);
  assert.match(fn, /접수/, 'the subject/body must say the application was received');
  assert.match(fn, /function escapeHtml/);
  assert.match(
    fn,
    /escapeHtml\([\s\S]*?applicantName/,
    'applicant name is user input and must be HTML-escaped in the email body',
  );
  assert.match(fn, /escapeHtml\([\s\S]*?meetupTitle|meetupTitle[\s\S]*?escapeHtml/);
  assert.match(fn, /my-history\.html/, 'the email must link to the history page');

  assert.match(fn, /export async function notifyApplicationReceived/);
  assert.match(fn, /meetups\?id=eq\./, 'the meetup title is fetched for the email');
  assert.match(
    fn,
    /try \{[\s\S]*?\} catch/,
    'a failed confirmation email must never break application submission',
  );
  assert.match(
    fn,
    /applicant_email/,
    'no email is sent when the application has no email on file',
  );
});

test('public submission sends a confirmation after creating an application', async () => {
  const fn = await readProjectFile('supabase/functions/create-public-submission/index.ts');

  assert.match(fn, /import \{ notifyApplicationReceived \} from '\.\.\/_shared\/application-email\.ts'/);
  assert.match(
    fn,
    /createApplication\(payload, visitorHash\);[\s\S]{0,200}notifyApplicationReceived\(/,
    'the confirmation fires only after the application row exists',
  );
});
