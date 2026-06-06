create extension if not exists pgcrypto;

create table if not exists public.meetups (
  id text primary key,
  type text not null check (type in ('regular', 'event', 'social')),
  category text not null,
  title text not null,
  description text not null,
  host_name text not null,
  host_role text not null,
  status_label text not null,
  date_label text not null,
  time_label text not null,
  location text not null,
  price_amount integer not null check (price_amount >= 0),
  price_label text not null,
  tags text[] not null default '{}',
  image_url text not null,
  schedule text[] not null default '{}',
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  meetup_id text not null references public.meetups(id) on update cascade on delete restrict,
  applicant_name text not null check (char_length(applicant_name) between 1 and 80),
  interest text not null check (char_length(interest) between 1 and 500),
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'accepted', 'rejected', 'cancelled')),
  source text not null default 'web',
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  meetup_id text not null references public.meetups(id) on update cascade on delete restrict,
  buyer_name text,
  amount integer not null check (amount >= 0),
  currency text not null default 'KRW',
  status text not null default 'pending' check (status in ('pending', 'demo_paid', 'paid', 'cancelled', 'failed')),
  provider text not null default 'demo',
  payment_method text,
  provider_order_id text,
  source text not null default 'web',
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on update cascade on delete restrict,
  meetup_id text not null references public.meetups(id) on update cascade on delete restrict,
  amount integer not null check (amount >= 0),
  currency text not null default 'KRW',
  status text not null check (status in ('paid', 'cancelled', 'failed', 'refunded', 'partial_refunded')),
  provider text not null,
  payment_method text,
  provider_payment_key text,
  paid_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists applications_meetup_id_idx on public.applications(meetup_id);
create index if not exists orders_meetup_id_idx on public.orders(meetup_id);
create index if not exists payments_order_id_idx on public.payments(order_id);

grant usage on schema public to anon;
grant select on public.meetups to anon;
grant insert on public.applications to anon;
grant insert on public.orders to anon;

alter table public.meetups enable row level security;
alter table public.applications enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;

drop policy if exists "published meetups are readable" on public.meetups;
create policy "published meetups are readable"
on public.meetups
for select
to anon
using (is_published = true);

drop policy if exists "visitors can submit applications" on public.applications;
create policy "visitors can submit applications"
on public.applications
for insert
to anon
with check (
  status = 'submitted'
  and char_length(applicant_name) between 1 and 80
  and char_length(interest) between 1 and 500
);

drop policy if exists "visitors can create demo orders" on public.orders;
create policy "visitors can create demo orders"
on public.orders
for insert
to anon
with check (
  status in ('pending', 'demo_paid')
  and amount >= 0
  and currency = 'KRW'
);

insert into public.meetups (
  id,
  type,
  category,
  title,
  description,
  host_name,
  host_role,
  status_label,
  date_label,
  time_label,
  location,
  price_amount,
  price_label,
  tags,
  image_url,
  schedule
) values
(
  'salon-night',
  'regular',
  '문화',
  '토요일 밤의 취향 살롱',
  '좋아하는 영화와 책 한 장면에서 시작해 서로의 생활 감각을 발견하는 4회 모임입니다.',
  '이지안',
  '문화 기획자',
  '4자리 남음',
  '6월 13일',
  '토요일 19:00',
  '성수',
  148000,
  '148,000원',
  array['영화', '책', '대화'],
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80',
  array['취향을 여는 질문', '장면과 문장 나누기', '나만의 큐레이션 만들기', '작은 상영회와 회고']
),
(
  'city-walk',
  'regular',
  '라이프',
  '서울 골목 산책 기록단',
  '주말마다 다른 동네를 걸으며 사진, 지도, 짧은 글로 도시의 분위기를 수집합니다.',
  '문하린',
  '로컬 에디터',
  '2자리 남음',
  '6월 14일',
  '일요일 10:30',
  '서촌',
  132000,
  '132,000원',
  array['산책', '사진', '기록'],
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
  array['동네 관찰법', '사진 산책', '기록 편집', '개인 루트 공유']
),
(
  'taste-table',
  'social',
  '미식',
  '낯선 사람들의 저녁 식탁',
  '한 가지 재료를 주제로 요리와 이야기를 준비해오는 느슨한 포트럭 다이닝입니다.',
  '최윤재',
  '푸드 큐레이터',
  '마감 임박',
  '6월 18일',
  '목요일 20:00',
  '연남',
  42000,
  '42,000원',
  array['포트럭', '대화', '친목'],
  'https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=900&q=80',
  array['웰컴 테이블', '재료 이야기', '한 접시 소개', '다음 식탁 정하기']
),
(
  'career-lab',
  'regular',
  '커리어',
  '일하는 나를 다시 설계하는 워크숍',
  '일의 기준, 강점, 협업 방식을 정리하고 다음 분기의 작은 실험을 설계합니다.',
  '강서윤',
  '조직 코치',
  'NEW',
  '6월 20일',
  '토요일 14:00',
  '강남',
  165000,
  '165,000원',
  array['커리어', '워크숍', '회고'],
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80',
  array['일의 기준 찾기', '강점 인터뷰', '협업 지도', '90일 실험 설계']
),
(
  'music-room',
  'event',
  '음악',
  '취중 음감회: 조명이 낮아지는 시간',
  '각자 준비한 노래 한 곡을 듣고, 그 음악이 머무는 기억을 천천히 나눕니다.',
  '오민준',
  '뮤직 라이터',
  '6자리 남음',
  '6월 21일',
  '일요일 19:30',
  '합정',
  35000,
  '35,000원',
  array['음악', '원데이', '바'],
  'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=900&q=80',
  array['오늘의 플레이리스트', '곡과 기억 소개', '페어 토크', '마지막 신청곡']
),
(
  'writing-studio',
  'regular',
  '창작',
  '처음 쓰는 짧은 소설 스튜디오',
  '인물, 장면, 갈등을 작게 연습하며 100일 안에 한 편의 짧은 이야기를 완성합니다.',
  '박노을',
  '소설가',
  '1자리 남음',
  '6월 27일',
  '토요일 15:00',
  '망원',
  176000,
  '176,000원',
  array['글쓰기', '창작', '합평'],
  'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80',
  array['장면의 씨앗', '인물 만들기', '첫 문장과 갈등', '낭독과 퇴고']
),
(
  'gallery-loop',
  'event',
  '전시',
  '전시 보는 눈을 키우는 오후',
  '작품을 오래 바라보는 방법과 감상 언어를 익히는 소규모 갤러리 투어입니다.',
  '정다원',
  '독립 큐레이터',
  'NEW',
  '6월 28일',
  '일요일 13:00',
  '삼청',
  39000,
  '39,000원',
  array['전시', '투어', '감상'],
  'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80',
  array['관람 전 질문', '전시 동선 걷기', '작품 감상 노트', '카페 리뷰']
),
(
  'dating-values',
  'social',
  '관계',
  '가치관 카드로 시작하는 소개 모임',
  '빠른 자기소개 대신 선택과 이유를 통해 서로의 결을 알아가는 8인 대화 모임입니다.',
  '한유리',
  '관계 콘텐츠 에디터',
  '마감 임박',
  '7월 1일',
  '수요일 20:00',
  '을지로',
  49000,
  '49,000원',
  array['친목', '대화', '가치관'],
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80',
  array['가치관 카드 선택', '페어 대화', '그룹 토크', '애프터 신청']
)
on conflict (id) do update set
  type = excluded.type,
  category = excluded.category,
  title = excluded.title,
  description = excluded.description,
  host_name = excluded.host_name,
  host_role = excluded.host_role,
  status_label = excluded.status_label,
  date_label = excluded.date_label,
  time_label = excluded.time_label,
  location = excluded.location,
  price_amount = excluded.price_amount,
  price_label = excluded.price_label,
  tags = excluded.tags,
  image_url = excluded.image_url,
  schedule = excluded.schedule,
  is_published = true;
