import { escapeHtml } from './escape-html.js?v=__ASSET_VERSION__';
import { getAmountFromMeetup } from './supabase-client.js?v=__ASSET_VERSION__';

export const fallbackMeetups = [
  {
    id: 'salon-night',
    type: 'regular',
    category: '문화',
    title: '토요일 밤의 취향 살롱',
    desc: '좋아하는 영화와 책 한 장면에서 시작해 서로의 생활 감각을 발견하는 4회 모임입니다.',
    host: '이지안',
    hostRole: '문화 기획자',
    status: '4자리 남음',
    date: '6월 13일',
    time: '토요일 19:00',
    location: '성수',
    price: '148,000원',
    tags: ['영화', '책', '대화'],
    image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80',
    schedule: ['취향을 여는 질문', '장면과 문장 나누기', '나만의 큐레이션 만들기', '작은 상영회와 회고'],
  },
  {
    id: 'city-walk',
    type: 'regular',
    category: '라이프',
    title: '서울 골목 산책 기록단',
    desc: '주말마다 다른 동네를 걸으며 사진, 지도, 짧은 글로 도시의 분위기를 수집합니다.',
    host: '문하린',
    hostRole: '로컬 에디터',
    status: '2자리 남음',
    date: '6월 14일',
    time: '일요일 10:30',
    location: '서촌',
    price: '132,000원',
    tags: ['산책', '사진', '기록'],
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
    schedule: ['동네 관찰법', '사진 산책', '기록 편집', '개인 루트 공유'],
  },
  {
    id: 'taste-table',
    type: 'social',
    category: '미식',
    title: '낯선 사람들의 저녁 식탁',
    desc: '한 가지 재료를 주제로 요리와 이야기를 준비해오는 느슨한 포트럭 다이닝입니다.',
    host: '최윤재',
    hostRole: '푸드 큐레이터',
    status: '마감 임박',
    date: '6월 18일',
    time: '목요일 20:00',
    location: '연남',
    price: '42,000원',
    tags: ['포트럭', '대화', '친목'],
    image: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=900&q=80',
    schedule: ['웰컴 테이블', '재료 이야기', '한 접시 소개', '다음 식탁 정하기'],
  },
  {
    id: 'career-lab',
    type: 'regular',
    category: '커리어',
    title: '일하는 나를 다시 설계하는 워크숍',
    desc: '일의 기준, 강점, 협업 방식을 정리하고 다음 분기의 작은 실험을 설계합니다.',
    host: '강서윤',
    hostRole: '조직 코치',
    status: 'NEW',
    date: '6월 20일',
    time: '토요일 14:00',
    location: '강남',
    price: '165,000원',
    tags: ['커리어', '워크숍', '회고'],
    image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80',
    schedule: ['일의 기준 찾기', '강점 인터뷰', '협업 지도', '90일 실험 설계'],
  },
  {
    id: 'music-room',
    type: 'event',
    category: '음악',
    title: '취중 음감회: 조명이 낮아지는 시간',
    desc: '각자 준비한 노래 한 곡을 듣고, 그 음악이 머무는 기억을 천천히 나눕니다.',
    host: '오민준',
    hostRole: '뮤직 라이터',
    status: '6자리 남음',
    date: '6월 21일',
    time: '일요일 19:30',
    location: '합정',
    price: '35,000원',
    tags: ['음악', '원데이', '바'],
    image: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=900&q=80',
    schedule: ['오늘의 플레이리스트', '곡과 기억 소개', '페어 토크', '마지막 신청곡'],
  },
  {
    id: 'writing-studio',
    type: 'regular',
    category: '창작',
    title: '처음 쓰는 짧은 소설 스튜디오',
    desc: '인물, 장면, 갈등을 작게 연습하며 100일 안에 한 편의 짧은 이야기를 완성합니다.',
    host: '박노을',
    hostRole: '소설가',
    status: '1자리 남음',
    date: '6월 27일',
    time: '토요일 15:00',
    location: '망원',
    price: '176,000원',
    tags: ['글쓰기', '창작', '합평'],
    image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80',
    schedule: ['장면의 씨앗', '인물 만들기', '첫 문장과 갈등', '낭독과 퇴고'],
  },
  {
    id: 'gallery-loop',
    type: 'event',
    category: '전시',
    title: '전시 보는 눈을 키우는 오후',
    desc: '작품을 오래 바라보는 방법과 감상 언어를 익히는 소규모 갤러리 투어입니다.',
    host: '정다원',
    hostRole: '독립 큐레이터',
    status: 'NEW',
    date: '6월 28일',
    time: '일요일 13:00',
    location: '삼청',
    price: '39,000원',
    tags: ['전시', '투어', '감상'],
    image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80',
    schedule: ['관람 전 질문', '전시 동선 걷기', '작품 감상 노트', '카페 리뷰'],
  },
  {
    id: 'dating-values',
    type: 'social',
    category: '관계',
    title: '가치관 카드로 시작하는 소개 모임',
    desc: '빠른 자기소개 대신 선택과 이유를 통해 서로의 결을 알아가는 8인 대화 모임입니다.',
    host: '한유리',
    hostRole: '관계 콘텐츠 에디터',
    status: '마감 임박',
    date: '7월 1일',
    time: '수요일 20:00',
    location: '을지로',
    price: '49,000원',
    tags: ['친목', '대화', '가치관'],
    image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80',
    schedule: ['가치관 카드 선택', '페어 대화', '그룹 토크', '애프터 신청'],
  },
];

export function createFallbackOrder() {
  return new Map(fallbackMeetups.map((item, index) => [item.id, index]));
}

export function formatPrice(amount) {
  return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
}

export function normalizePriceLabel(priceLabel, amount) {
  const trimmed = String(priceLabel || '').trim();

  if (!trimmed) {
    return formatPrice(amount);
  }

  if (/^\d+$/.test(trimmed)) {
    return formatPrice(trimmed);
  }

  return trimmed;
}

export function escapeAttribute(value) {
  return escapeHtml(value);
}

export function escapeImageUrl(value) {
  return escapeAttribute(isPublicImageUrl(value) ? value : fallbackMeetups[0].image);
}

export function isPublicImageUrl(value) {
  const rawValue = String(value || '').trim();

  if (!/^https?:\/\//i.test(rawValue)) {
    return false;
  }

  try {
    const url = new URL(rawValue);
    return Boolean(url.hostname && url.hostname.includes('.'));
  } catch {
    return false;
  }
}

export function getCategoryFallbackImage(category) {
  if (category === '음악') {
    return fallbackMeetups.find((item) => item.category === '음악')?.image || fallbackMeetups[0].image;
  }

  return fallbackMeetups[0].image;
}

export function normalizeMeetup(row) {
  const fallback = fallbackMeetups.find((item) => item.id === row.id) || fallbackMeetups[0];
  const category = row.category || fallback.category;
  const priceAmount = Number.isFinite(Number(row.price_amount))
    ? Number(row.price_amount)
    : getAmountFromMeetup(fallback);

  return {
    id: row.id,
    type: row.type || fallback.type,
    category,
    title: row.title || fallback.title,
    desc: row.description || fallback.desc,
    host: row.host_name || fallback.host,
    hostRole: row.host_role || fallback.hostRole,
    statusLabel: row.status_label || fallback.status,
    status: row.status_label || fallback.status,
    date: row.date_label || fallback.date,
    time: row.time_label || fallback.time,
    location: row.location || fallback.location,
    priceAmount,
    price: normalizePriceLabel(row.price_label, priceAmount),
    tags: Array.isArray(row.tags) ? row.tags : fallback.tags,
    image: isPublicImageUrl(row.image_url) ? row.image_url : getCategoryFallbackImage(category),
    schedule: Array.isArray(row.schedule) ? row.schedule.filter(Boolean) : fallback.schedule,
    reviews: Array.isArray(row.reviews) ? row.reviews.filter((review) => review && review.quote) : [],
    availabilityKnown: null,
    canRegister: true,
    effectiveRegistrationStatus: 'open',
    capacity: null,
    remainingSpots: null,
  };
}

export function sortMeetupsByFallbackOrder(items) {
  const order = createFallbackOrder();
  return [...items].sort((a, b) => {
    const orderA = order.get(a.id) ?? 999;
    const orderB = order.get(b.id) ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title, 'ko-KR');
  });
}

export function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [
    item.title,
    item.desc,
    item.host,
    item.hostRole,
    item.category,
    item.location,
    ...item.tags,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function createTagMarkup(tags) {
  return tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');
}

export function createReviewsMarkup(reviews) {
  if (!Array.isArray(reviews)) {
    return '';
  }

  return reviews
    .filter((review) => review && review.quote)
    .map((review) => `
      <figure class="review-card">
        <blockquote>${escapeHtml(review.quote)}</blockquote>
        ${review.audience ? `<figcaption>— ${escapeHtml(review.audience)}</figcaption>` : ''}
      </figure>
    `)
    .join('');
}
