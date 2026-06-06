# moin

moin은 독일어 인사말과, 취향이 같은 사람들이 모인 곳이라는 한국어 발음을 함께 담은 모임 플랫폼입니다.

취향 기반 정기 모임, 원데이 이벤트, 오픈 예정 알림을 탐색하는 정적 웹앱입니다. 특정 브랜드의 문구, 로고, 이미지 자산은 사용하지 않고 기능 구조와 UX 패턴만 참고해 만든 데모입니다.

## 로컬 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

## 포함된 기능

- 모임 카드 리스트
- 카테고리 필터
- 관심사 검색
- 관심 모임 저장
- 오픈 예정 알림 토글
- 상세 드로어
- 신청 저장 폼
- 데모 결제 플로우
- 토스페이먼츠 테스트 결제 승인
- Supabase 신청/주문/결제 기록 저장
- Supabase 모임 목록 불러오기
- 관리자 대시보드
- 관리자 주문/결제 기록 확인
- 모바일 하단 내비게이션

## Supabase 연결

1. Supabase 프로젝트를 만든 뒤 SQL editor에서 `supabase/migrations/20260605000000_initial_schema.sql`을 실행합니다.
2. `supabase-config.js`에 프로젝트 URL과 public anon key를 입력합니다.
3. 다시 배포하면 모임 목록을 Supabase에서 불러오고, 신청서와 데모 결제 주문이 Supabase에 저장됩니다.

브라우저에는 public anon key만 넣어야 합니다. service role key는 결제 승인 서버나 Edge Function에서만 사용하세요.

## 토스페이먼츠 테스트 연동

`toss-config.js`의 `TOSS_CLIENT_KEY`에 토스페이먼츠 개발자센터에서 받은 테스트 클라이언트 키를 넣으면 결제 모달의 버튼이 토스 테스트 결제창을 엽니다.

결제 버튼을 누르면 Supabase `orders` 테이블에 `status = 'pending'`, `provider = 'tosspayments'` 주문이 먼저 저장되고, 토스 성공/실패 결과는 `payment-result.html`에서 확인합니다.

실제 결제 완료 처리는 브라우저에서 하지 않습니다. Supabase Edge Function이 토스 결제 승인 API를 호출하고, 승인 결과로 `orders.status`와 `payments`를 업데이트합니다.

### 결제 승인 Edge Function

`supabase/functions/confirm-toss-payment`는 토스 성공 리다이렉트로 받은 `paymentKey`, `orderId`, `amount`를 검증하고 토스 결제 승인 API를 호출합니다. 승인 성공 시 `orders.status = 'paid'`로 바꾸고 `payments`에 결제 기록을 추가합니다. 토스 결제창 취소나 실패 리다이렉트가 발생하면 같은 함수가 해당 주문을 `cancelled` 또는 `failed`로 정리합니다.

Supabase SQL editor에서 `supabase/migrations/20260606040000_toss_payment_confirmation.sql`을 실행한 뒤, Supabase CLI로 함수와 시크릿을 배포합니다.

결제 보안 보강을 위해 `supabase/migrations/20260606070000_harden_toss_payment_security.sql`도 실행해야 합니다. 이 마이그레이션은 공개 주문 생성 정책을 서버 모임 가격 기준으로 제한하고, 결제 실패/취소 기록에 주문 확인 토큰을 요구하며, 주문 결제완료 처리와 결제 기록 저장을 하나의 DB 함수로 묶습니다.

```bash
supabase secrets set TOSS_SECRET_KEY=토스_테스트_시크릿키
supabase functions deploy confirm-toss-payment --no-verify-jwt
```

`TOSS_SECRET_KEY`는 브라우저 코드나 GitHub 저장소에 넣지 마세요. Supabase Edge Function secret으로만 저장해야 합니다.

## 관리자 화면

관리자 화면은 `admin.html`입니다. 신청자와 주문 데이터는 Supabase Auth 로그인 후 `admins` 테이블에 등록된 계정만 볼 수 있습니다.

1. Supabase SQL editor에서 `supabase/migrations/20260606000000_admin_dashboard.sql`을 실행합니다.
2. Supabase Authentication에서 관리자 이메일/비밀번호 유저를 만듭니다.
3. SQL editor에서 관리자 유저를 등록합니다.

```sql
insert into public.admins (user_id, email)
select id, email
from auth.users
where email = '관리자이메일@example.com';
```

Supabase 초대 메일을 사용할 때는 Authentication > URL Configuration에서 Site URL을 관리자 페이지로 맞춰야 합니다.

```text
https://subong-noah-kim.github.io/moin/admin.html
```

초대한 계정도 `admins` 테이블에 등록해야 관리자 데이터를 볼 수 있습니다.

```sql
insert into public.admins (user_id, email)
select id, email
from auth.users
where email = '초대받은이메일@example.com'
on conflict do nothing;
```

모임 사진 업로드를 사용하려면 Supabase SQL editor에서 `supabase/migrations/20260606060000_meetup_image_storage.sql`을 실행합니다. 이후 관리자 화면에서 이미지 파일을 선택하면 `meetup-images` Storage 버킷에 업로드되고 공개 URL이 자동 저장됩니다.

## 테스트

```bash
npm test
```
