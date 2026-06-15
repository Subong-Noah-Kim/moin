import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fallbackMeetups,
  formatPrice,
  normalizePriceLabel,
  isPublicImageUrl,
  escapeImageUrl,
  matchesSearch,
  sortMeetupsByFallbackOrder,
  normalizeMeetup,
  createTagMarkup,
} from '../public-meetup.js';

test('formatPrice and normalizePriceLabel produce KRW labels', () => {
  assert.equal(formatPrice(148000), '148,000원');
  assert.equal(formatPrice(null), '0원');
  assert.equal(normalizePriceLabel('', 10000), '10,000원');
  assert.equal(normalizePriceLabel('12000', 0), '12,000원');
  assert.equal(normalizePriceLabel('무료', 0), '무료');
});

test('isPublicImageUrl only accepts http(s) hosts', () => {
  assert.equal(isPublicImageUrl('https://example.com/a.jpg'), true);
  assert.equal(isPublicImageUrl('javascript:alert(1)'), false);
  assert.equal(isPublicImageUrl('/local.png'), false);
  assert.equal(isPublicImageUrl(''), false);
});

test('escapeImageUrl falls back for unsafe urls', () => {
  assert.equal(escapeImageUrl('https://cdn.example.com/x.jpg'), 'https://cdn.example.com/x.jpg');
  const fallback = escapeImageUrl('javascript:alert(1)');
  assert.ok(!fallback.includes('javascript'), 'an unsafe url is replaced by a fallback image');
  assert.ok(fallback.startsWith('https://'));
});

test('matchesSearch scans title/host/tags case-insensitively', () => {
  const item = { title: '재즈의 밤', desc: '', host: '수봉', hostRole: '', category: '음악', location: '성수', tags: ['라이브'] };
  assert.equal(matchesSearch(item, ''), true);
  assert.equal(matchesSearch(item, '재즈'), true);
  assert.equal(matchesSearch(item, '라이브'), true);
  assert.equal(matchesSearch(item, '없는단어'), false);
});

test('normalizeMeetup maps row fields and falls back for missing ones', () => {
  const fb = fallbackMeetups[0];

  const custom = normalizeMeetup({
    id: fb.id,
    title: '커스텀 제목',
    price_amount: 25000,
    price_label: '',
    image_url: 'https://img.example.com/y.jpg',
    tags: ['x'],
  });
  assert.equal(custom.title, '커스텀 제목');
  assert.equal(custom.priceAmount, 25000);
  assert.equal(custom.price, '25,000원');
  assert.equal(custom.image, 'https://img.example.com/y.jpg');
  assert.deepEqual(custom.tags, ['x']);
  assert.equal(custom.canRegister, true);

  const sparse = normalizeMeetup({ id: fb.id });
  assert.equal(sparse.title, fb.title);
  assert.equal(sparse.image, fb.image, 'an unsafe/missing url falls back to a category image');
});

test('createTagMarkup escapes tag text', () => {
  assert.equal(createTagMarkup(['<b>']), '<span>&lt;b&gt;</span>');
});

test('sortMeetupsByFallbackOrder orders by the fallback order', () => {
  const second = { id: fallbackMeetups[1].id, title: 'b' };
  const first = { id: fallbackMeetups[0].id, title: 'a' };
  const sorted = sortMeetupsByFallbackOrder([second, first]);
  assert.equal(sorted[0].id, fallbackMeetups[0].id);
});
