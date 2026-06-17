import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function readProjectFile(pathname) {
  return readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');
}

test('createReviewsMarkup renders quote + audience, escapes, and drops quote-less entries', async () => {
  const { createReviewsMarkup } = await import('../public-meetup.js');
  const markup = createReviewsMarkup([
    { audience: '혼자 오는 분', quote: '편하게 어울렸어요 <3' },
    { audience: '', quote: '인용만 있어요' },
    { audience: '버려질 항목', quote: '' },
  ]);
  assert.match(markup, /편하게 어울렸어요 &lt;3/); // escaped
  assert.match(markup, /— 혼자 오는 분/);
  assert.match(markup, /인용만 있어요/);
  assert.doesNotMatch(markup, /버려질 항목/); // no quote -> dropped

  assert.equal(createReviewsMarkup([]), '');
  assert.equal(createReviewsMarkup(null), '');
  assert.equal(createReviewsMarkup(undefined), '');
});

test('normalizeMeetup carries reviews and defaults to empty', async () => {
  const { normalizeMeetup } = await import('../public-meetup.js');
  const withReviews = normalizeMeetup({ id: 'x', reviews: [{ audience: 'a', quote: 'q' }, { quote: '' }] });
  assert.deepEqual(withReviews.reviews, [{ audience: 'a', quote: 'q' }]);
  assert.deepEqual(normalizeMeetup({ id: 'y', reviews: null }).reviews, []);
});

test('splitAdminMeetupReviews parses "audience | quote" lines', async () => {
  const { splitAdminMeetupReviews } = await import('../admin-meetup-form.js');
  assert.deepEqual(
    splitAdminMeetupReviews('글쓰기 입문 | 첫 문장을 뗐어요\n인용만\n  \n| 대상 없이 인용만'),
    [
      { audience: '글쓰기 입문', quote: '첫 문장을 뗐어요' },
      { audience: '', quote: '인용만' },
      { audience: '', quote: '대상 없이 인용만' },
    ],
  );
  assert.deepEqual(splitAdminMeetupReviews(''), []);
});

test('reviews migration adds the column and exposes it via the public RPC', async () => {
  const sql = await readProjectFile('supabase/migrations/20260626000000_meetup_reviews.sql');
  assert.match(sql, /add column if not exists reviews jsonb/);
  assert.match(sql, /drop function if exists public\.list_public_meetups\(\)/);
  assert.match(sql, /returns table[\s\S]*reviews jsonb/);
  assert.match(sql, /meetups\.reviews/);
});

test('admin form and public detail wire up the reviews field', async () => {
  const html = await readProjectFile('admin.html');
  assert.match(html, /<textarea name="reviews"/);

  const main = await readProjectFile('main.js');
  assert.match(main, /createReviewsMarkup\(item\.reviews\)/);
  assert.match(main, /이런 분께 추천해요/);
});
