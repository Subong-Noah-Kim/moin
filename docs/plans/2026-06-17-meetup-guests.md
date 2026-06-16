# Meetup Capacity Display + Named Virtual Guests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show `정원 N명 · 잔여 M석` on public meetup cards, and let an admin add/remove named virtual guests (each holding one seat) that reduce the remaining count everywhere.

**Architecture:** A new `meetup_guests` table holds named guests (one row = one seat). The four security-definer seat functions fold the per-meetup guest count into the existing `remaining = capacity − active_orders` math, so public display, admin view, the single-meetup snapshot, and the registration guard stay consistent. Guest names are admin-only (RLS); the public read exposes only the reduced remaining number. Admins manage guests through a focus-trapped modal opened from each meetup row.

**Tech Stack:** Supabase Postgres (plpgsql/SQL RPCs, RLS), vanilla ES modules, Node's built-in test runner, PostgREST.

**Design doc:** `docs/plans/2026-06-17-meetup-guests-design.md`

**Conventions (from the repo):**
- TDD: write the failing test, see it fail, implement, see it pass, commit.
- Migrations are timestamp-ordered files in `supabase/migrations/`. The latest is `20260623000000`; this feature uses **`20260624000000`** so it applies after existing ones.
- Run all JS tests with `npm test`. Run a single file with `node --test tests/<file>.test.js`.
- Apply migrations with `npx supabase db push`. Inspect the remote DB with the Management API query endpoint already used in this repo.
- Frontend deploys via GitHub Pages on push to `main`; no new files need adding to the workflow `cp` list (only existing files are modified).

---

## File Structure

| File | Responsibility | Create/Modify |
|------|----------------|---------------|
| `supabase/migrations/20260624000000_meetup_guests.sql` | Table + RLS + grants + the 4 updated seat functions | Create |
| `public-availability.js` | Public seat label now includes capacity | Modify |
| `admin-availability.js` | Admin seat breakdown includes guest count; normalize `manual_guest_count` | Modify |
| `supabase-client.js` | `listMeetupGuests` / `addMeetupGuest` / `deleteMeetupGuest` | Modify |
| `admin-render.js` | "게스트 N명" button on each meetup row | Modify |
| `admin.html` | Guest management modal markup | Modify |
| `admin.css` | Guest modal + list styles | Modify |
| `admin.js` | Guest modal open/close (modal-manager) + list/add/delete wiring | Modify |
| `tests/meetupGuests.test.js` | Unit + contract tests for the feature | Create |
| `tests/paymentSecurity.test.js` | Update the admin-availability contract pin | Modify |

---

## Task 1: Migration — `meetup_guests` table, RLS, grants

**Files:**
- Create: `supabase/migrations/20260624000000_meetup_guests.sql`
- Test: `tests/meetupGuests.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/meetupGuests.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/meetupGuests.test.js`
Expected: FAIL — `ENOENT` (migration file does not exist).

- [ ] **Step 3: Create the migration with the table + RLS**

Create `supabase/migrations/20260624000000_meetup_guests.sql`:

```sql
-- Named virtual guests: an admin can add guests who hold a seat without a real
-- order (offline/invited attendees). One row = one held seat. Names are
-- admin-only (RLS); the security-definer seat functions count guests so the
-- public only ever sees the reduced remaining number.

create table if not exists public.meetup_guests (
  id uuid primary key default gen_random_uuid(),
  meetup_id text not null references public.meetups(id) on delete cascade,
  name text not null,
  memo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint meetup_guests_name_length check (char_length(trim(name)) between 1 and 80),
  constraint meetup_guests_memo_length check (memo is null or char_length(memo) <= 200)
);

create index if not exists meetup_guests_meetup_id_idx on public.meetup_guests(meetup_id);

alter table public.meetup_guests enable row level security;

grant select, insert, delete on public.meetup_guests to authenticated;

drop policy if exists "admins read meetup guests" on public.meetup_guests;
create policy "admins read meetup guests"
on public.meetup_guests
for select to authenticated
using (public.is_admin());

drop policy if exists "admins add meetup guests" on public.meetup_guests;
create policy "admins add meetup guests"
on public.meetup_guests
for insert to authenticated
with check (public.is_admin());

drop policy if exists "admins delete meetup guests" on public.meetup_guests;
create policy "admins delete meetup guests"
on public.meetup_guests
for delete to authenticated
using (public.is_admin());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/meetupGuests.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260624000000_meetup_guests.sql tests/meetupGuests.test.js
git commit -m "Add admin-only meetup_guests table (named virtual guests)"
```

---

## Task 2: Migration — fold guest count into the four seat functions

The four seat functions each compute `remaining` independently. Append updated
versions to the **same** migration file so the guest count is applied
consistently. The admin function additionally returns `manual_guest_count`.

**Files:**
- Modify: `supabase/migrations/20260624000000_meetup_guests.sql` (append)
- Test: `tests/meetupGuests.test.js`
- Modify: `tests/paymentSecurity.test.js` (admin-availability contract pin)

- [ ] **Step 1: Write the failing test**

Append to `tests/meetupGuests.test.js`:

```js
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

  // public RPC must NOT add a guest column (only the reduced remaining is public)
  const publicFn = sql.slice(
    sql.indexOf('create or replace function public.list_public_meetup_availability'),
    sql.indexOf('create or replace function public.list_admin_meetup_availability'),
  );
  assert.doesNotMatch(publicFn, /manual_guest_count integer/, 'public return signature stays count-free');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/meetupGuests.test.js`
Expected: FAIL — the new function definitions are not in the migration yet.

- [ ] **Step 3: Append the four updated functions to the migration**

Append to `supabase/migrations/20260624000000_meetup_guests.sql`:

```sql
-- Public availability: subtract guests from remaining; guests count toward
-- sold_out. The RETURNS TABLE signature is unchanged (no guest column is
-- exposed publicly).
create or replace function public.list_public_meetup_availability()
returns table (
  meetup_id text,
  capacity integer,
  remaining_spots integer,
  effective_registration_status text,
  can_register boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with active_order_counts as (
    select
      orders.meetup_id,
      count(*)::integer as active_order_count
    from public.orders
    where orders.status in ('paid', 'demo_paid')
      or (
        orders.status = 'pending'
        and orders.expires_at > now()
      )
    group by orders.meetup_id
  ),
  guest_counts as (
    select meetup_id, count(*)::integer as manual_guest_count
    from public.meetup_guests
    group by meetup_id
  ),
  availability as (
    select
      meetups.id as meetup_id,
      meetups.capacity,
      coalesce(active_order_counts.active_order_count, 0)::integer as active_order_count,
      coalesce(guest_counts.manual_guest_count, 0)::integer as manual_guest_count,
      case
        when meetups.capacity is null then null
        else greatest(
          meetups.capacity
            - coalesce(active_order_counts.active_order_count, 0)
            - coalesce(guest_counts.manual_guest_count, 0),
          0
        )::integer
      end as remaining_spots,
      meetups.registration_status,
      case
        when meetups.registration_status = 'closed' then 'closed'
        when meetups.capacity is not null
          and (
            coalesce(active_order_counts.active_order_count, 0)
            + coalesce(guest_counts.manual_guest_count, 0)
          ) >= meetups.capacity then 'sold_out'
        else 'open'
      end as effective_registration_status
    from public.meetups
    left join active_order_counts on active_order_counts.meetup_id = meetups.id
    left join guest_counts on guest_counts.meetup_id = meetups.id
    where meetups.is_published = true
  )
  select
    availability.meetup_id,
    availability.capacity,
    availability.remaining_spots,
    availability.effective_registration_status,
    availability.effective_registration_status = 'open' as can_register
  from availability;
$$;

grant execute on function public.list_public_meetup_availability() to anon;
grant execute on function public.list_public_meetup_availability() to authenticated;
grant execute on function public.list_public_meetup_availability() to service_role;

-- Admin availability: same fold-in, plus manual_guest_count in the result for
-- the operator breakdown.
create or replace function public.list_admin_meetup_availability()
returns table (
  meetup_id text,
  capacity integer,
  paid_order_count integer,
  pending_order_count integer,
  active_order_count integer,
  manual_guest_count integer,
  remaining_spots integer,
  registration_status text,
  effective_registration_status text,
  can_register boolean,
  closed_at timestamptz,
  close_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
  with order_counts as (
    select
      orders.meetup_id,
      count(*) filter (where orders.status in ('paid', 'demo_paid'))::integer as paid_order_count,
      count(*) filter (
        where orders.status = 'pending'
          and orders.expires_at > now()
      )::integer as pending_order_count
    from public.orders
    group by orders.meetup_id
  ),
  guest_counts as (
    select meetup_id, count(*)::integer as manual_guest_count
    from public.meetup_guests
    group by meetup_id
  ),
  availability as (
    select
      meetups.id as meetup_id,
      meetups.capacity,
      coalesce(order_counts.paid_order_count, 0)::integer as paid_order_count,
      coalesce(order_counts.pending_order_count, 0)::integer as pending_order_count,
      (
        coalesce(order_counts.paid_order_count, 0)
        + coalesce(order_counts.pending_order_count, 0)
      )::integer as active_order_count,
      coalesce(guest_counts.manual_guest_count, 0)::integer as manual_guest_count,
      meetups.registration_status,
      meetups.closed_at,
      meetups.close_reason
    from public.meetups
    left join order_counts on order_counts.meetup_id = meetups.id
    left join guest_counts on guest_counts.meetup_id = meetups.id
  )
  select
    availability.meetup_id,
    availability.capacity,
    availability.paid_order_count,
    availability.pending_order_count,
    availability.active_order_count,
    availability.manual_guest_count,
    case
      when availability.capacity is null then null
      else greatest(
        availability.capacity
          - availability.active_order_count
          - availability.manual_guest_count,
        0
      )::integer
    end as remaining_spots,
    availability.registration_status,
    case
      when availability.registration_status = 'closed' then 'closed'
      when availability.capacity is not null
        and (availability.active_order_count + availability.manual_guest_count) >= availability.capacity then 'sold_out'
      else 'open'
    end as effective_registration_status,
    (
      availability.registration_status = 'open'
      and (
        availability.capacity is null
        or (availability.active_order_count + availability.manual_guest_count) < availability.capacity
      )
    ) as can_register,
    availability.closed_at,
    availability.close_reason
  from availability;
end;
$$;

grant execute on function public.list_admin_meetup_availability() to authenticated;
grant execute on function public.list_admin_meetup_availability() to service_role;

-- Single-meetup snapshot: include the guest count in the math and the payload.
create or replace function public.get_meetup_seat_snapshot(
  p_meetup_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups%rowtype;
  v_active_order_count integer;
  v_manual_guest_count integer;
  v_effective_registration_status text;
  v_remaining_spots integer;
begin
  select *
  into v_meetup
  from public.meetups
  where id = p_meetup_id
  limit 1;

  if not found then
    raise exception 'MEETUP_NOT_FOUND';
  end if;

  select count(*)::integer
  into v_active_order_count
  from public.orders
  where meetup_id = v_meetup.id
    and (
      status in ('paid', 'demo_paid')
      or (
        status = 'pending'
        and expires_at > now()
      )
    );

  select count(*)::integer
  into v_manual_guest_count
  from public.meetup_guests
  where meetup_id = v_meetup.id;

  if v_meetup.capacity is null then
    v_remaining_spots := null;
  else
    v_remaining_spots := greatest(v_meetup.capacity - v_active_order_count - v_manual_guest_count, 0);
  end if;

  if v_meetup.registration_status = 'closed' then
    v_effective_registration_status := 'closed';
  elsif v_meetup.capacity is not null
    and (v_active_order_count + v_manual_guest_count) >= v_meetup.capacity then
    v_effective_registration_status := 'sold_out';
  else
    v_effective_registration_status := 'open';
  end if;

  return jsonb_build_object(
    'meetup_id', v_meetup.id,
    'capacity', v_meetup.capacity,
    'active_order_count', v_active_order_count,
    'manual_guest_count', v_manual_guest_count,
    'remaining_spots', v_remaining_spots,
    'registration_status', v_meetup.registration_status,
    'effective_registration_status', v_effective_registration_status,
    'closed_at', v_meetup.closed_at,
    'close_reason', v_meetup.close_reason
  );
end;
$$;

-- Registration guard: guests count toward sold-out so they can reserve seats.
create or replace function public.assert_meetup_can_register(
  p_meetup_id text
)
returns public.meetups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups%rowtype;
  v_active_order_count integer;
  v_manual_guest_count integer;
begin
  select *
  into v_meetup
  from public.meetups
  where id = p_meetup_id
    and is_published = true
  for update;

  if not found then
    raise exception 'MEETUP_NOT_FOUND';
  end if;

  if v_meetup.registration_status = 'closed' then
    raise exception 'MEETUP_REGISTRATION_CLOSED';
  end if;

  select count(*)::integer
  into v_active_order_count
  from public.orders
  where meetup_id = v_meetup.id
    and (
      status in ('paid', 'demo_paid')
      or (
        status = 'pending'
        and expires_at > now()
      )
    );

  select count(*)::integer
  into v_manual_guest_count
  from public.meetup_guests
  where meetup_id = v_meetup.id;

  if v_meetup.capacity is not null
    and (v_active_order_count + v_manual_guest_count) >= v_meetup.capacity then
    raise exception 'MEETUP_SOLD_OUT';
  end if;

  return v_meetup;
end;
$$;
```

- [ ] **Step 2.5: Update the admin-availability contract pin in paymentSecurity.test.js**

The capacity-guard test asserts the admin availability function shape. Find the
test that reads `../supabase/migrations/20260607020000_capacity_read_contract.sql`
or pins `active_order_count` in `list_admin_meetup_availability`. It still passes
against the OLD migration file (unchanged), so no edit is required there. But the
test `admin capacity UI uses admin RPC and strips derived availability fields`
asserts the admin client requests specific columns — confirm it does not hard-pin
the returned column list against a snapshot that excludes `manual_guest_count`.
Run the suite in Step 4 and, if that test fails, add `manual_guest_count` to its
expected column assertions.

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test tests/meetupGuests.test.js`
Expected: PASS (2 tests).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. If `admin capacity UI ...` fails because of the new
`manual_guest_count` column, update that test's expectations and re-run.

- [ ] **Step 5: Apply the migration and verify at the DB level**

Run: `npx supabase db push`
Expected: `Applying migration 20260624000000_meetup_guests.sql... Finished`.

Then verify the math with a synthetic capacity meetup (use the Management API
query endpoint with the service-role pattern already used in this repo): insert a
test meetup with `capacity = 2`, call `get_meetup_seat_snapshot` → `remaining_spots = 2`;
insert one `meetup_guests` row → snapshot `remaining_spots = 1`, `manual_guest_count = 1`;
insert a second guest → `remaining_spots = 0`, `effective_registration_status = 'sold_out'`;
delete the guests and the meetup.
Expected: counts behave as described.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260624000000_meetup_guests.sql tests/meetupGuests.test.js tests/paymentSecurity.test.js
git commit -m "Fold the manual guest count into all four seat computations"
```

---

## Task 3: Public display — capacity in the seat label

**Files:**
- Modify: `public-availability.js`
- Test: `tests/meetupGuests.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/meetupGuests.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/meetupGuests.test.js`
Expected: FAIL — label is `잔여 5석`, not `정원 12명 · 잔여 5석`.

- [ ] **Step 3: Update the label + description helpers**

In `public-availability.js`, change the remaining branch of
`getRegistrationStatusLabel`:

```js
  if (Number.isFinite(item?.remainingSpots)) {
    if (Number.isFinite(item?.capacity)) {
      return `정원 ${item.capacity}명 · 잔여 ${item.remainingSpots}석`;
    }
    return `잔여 ${item.remainingSpots}석`;
  }
```

And the remaining branch of `getRegistrationStatusDescription`:

```js
  if (Number.isFinite(item?.remainingSpots)) {
    if (Number.isFinite(item?.capacity)) {
      return `정원 ${item.capacity}명 중 ${item.remainingSpots}석이 남아 있습니다.`;
    }
    return `현재 신청 가능한 자리는 ${item.remainingSpots}석입니다.`;
  }
```

(`capacity` is already normalized onto the item by `normalizeAvailability` and is
already returned by `list_public_meetup_availability`, so no other change is needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/meetupGuests.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public-availability.js tests/meetupGuests.test.js
git commit -m "Show capacity alongside remaining seats on public cards"
```

---

## Task 4: Admin seat breakdown — show guest count

**Files:**
- Modify: `admin-availability.js`
- Test: `tests/meetupGuests.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/meetupGuests.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/meetupGuests.test.js`
Expected: FAIL — `manual_guest_count` is dropped by `normalizeAdminAvailability` and the breakdown omits guests.

- [ ] **Step 3: Add manual_guest_count to normalize + breakdown**

In `admin-availability.js`, add to `normalizeAdminAvailability`'s returned object
(next to `pending_order_count`):

```js
    manual_guest_count: Number(row.manual_guest_count || 0),
```

And update `getSeatBreakdownText`:

```js
export function getSeatBreakdownText(meetup) {
  if (meetup.availability_known === false) {
    return '정원 상태를 다시 불러와야 합니다.';
  }

  return `확정 ${meetup.paid_order_count || 0} · 결제중 ${meetup.pending_order_count || 0} · 게스트 ${meetup.manual_guest_count || 0}`;
}
```

Also update the `availability_known === false` fallback object in
`mergeAdminMeetupAvailability` to include `manual_guest_count: null` (next to
`pending_order_count: null`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/meetupGuests.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-availability.js tests/meetupGuests.test.js
git commit -m "Surface the guest count in the admin seat breakdown"
```

---

## Task 5: Admin client — list/add/delete guests

**Files:**
- Modify: `supabase-client.js`
- Test: `tests/meetupGuests.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/meetupGuests.test.js`:

```js
test('admin client exposes guest CRUD against meetup_guests', async () => {
  const client = await readProjectFile('supabase-client.js');

  assert.match(client, /export async function listMeetupGuests\(accessToken, meetupId\)/);
  assert.match(client, /export async function addMeetupGuest\(accessToken, meetupId, \{ name, memo \}\)/);
  assert.match(client, /export async function deleteMeetupGuest\(accessToken, guestId\)/);
  assert.match(client, /selectRowsWithToken\(\s*'meetup_guests'/);
  assert.match(client, /writeRowsWithToken\(\s*'meetup_guests'[\s\S]*?'POST'/);
  assert.match(client, /writeRowsWithToken\(\s*'meetup_guests'[\s\S]*?'DELETE'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/meetupGuests.test.js`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Add the client functions**

In `supabase-client.js`, near the other admin helpers (e.g., after
`updateAdminOrderStatus`), add:

```js
const adminGuestFields = ['id', 'meetup_id', 'name', 'memo', 'created_at'].join(',');

export async function listMeetupGuests(accessToken, meetupId) {
  return selectRowsWithToken(
    'meetup_guests',
    `?meetup_id=eq.${encodeURIComponent(meetupId)}&select=${adminGuestFields}&order=created_at.asc`,
    accessToken,
  );
}

export async function addMeetupGuest(accessToken, meetupId, { name, memo }) {
  const rows = await writeRowsWithToken(
    'meetup_guests',
    `?select=${adminGuestFields}`,
    accessToken,
    { meetup_id: meetupId, name: String(name || '').trim(), memo: memo ? String(memo).trim() : null },
    'POST',
  );

  if (!rows?.length) {
    throw new Error('게스트를 추가하지 못했습니다.');
  }

  return rows[0];
}

export async function deleteMeetupGuest(accessToken, guestId) {
  await writeRowsWithToken(
    'meetup_guests',
    `?id=eq.${encodeURIComponent(guestId)}`,
    accessToken,
    {},
    'DELETE',
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/meetupGuests.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase-client.js tests/meetupGuests.test.js
git commit -m "Add admin client functions for meetup guest CRUD"
```

---

## Task 6: Meetup row "게스트 N명" button

**Files:**
- Modify: `admin-render.js`
- Test: `tests/meetupGuests.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/meetupGuests.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/meetupGuests.test.js`
Expected: FAIL — no `data-guests-meetup` button.

- [ ] **Step 3: Add the button to the meetup row actions**

In `admin-render.js`, inside `buildMeetupRows`, the `<div class="row-actions">`
currently holds the 수정/공개 buttons. Add a guest button:

```js
            <div class="row-actions">
              <button type="button" data-edit-meetup="${escapeHtml(meetup.id)}">수정</button>
              <button type="button" data-guests-meetup="${escapeHtml(meetup.id)}">게스트 ${escapeHtml(String(meetup.manual_guest_count ?? 0))}명</button>
              <button
                class="ghost-button"
                type="button"
                data-toggle-meetup="${escapeHtml(meetup.id)}"
                data-published="${meetup.is_published ? 'true' : 'false'}"
              >
                ${meetup.is_published ? '숨김' : '공개'}
              </button>
            </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/meetupGuests.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-render.js tests/meetupGuests.test.js
git commit -m "Add a guest-management button to each admin meetup row"
```

---

## Task 7: Guest modal markup + styles

**Files:**
- Modify: `admin.html`
- Modify: `admin.css`
- Test: `tests/meetupGuests.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/meetupGuests.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/meetupGuests.test.js`
Expected: FAIL — modal markup/styles absent.

- [ ] **Step 3: Add the modal markup to admin.html**

Add just before the closing `</body>` (or after the dashboard `</section>`),
alongside other top-level overlays:

```html
    <div class="guest-modal" data-guest-modal aria-hidden="true" hidden inert>
      <div class="guest-modal-backdrop" data-guest-modal-close></div>
      <article class="guest-modal-card" role="dialog" aria-modal="true" aria-labelledby="guestModalTitle" tabindex="-1">
        <button class="icon-button guest-modal-close" type="button" data-guest-modal-close aria-label="게스트 관리 닫기">×</button>
        <h3 id="guestModalTitle">게스트 관리</h3>
        <p class="guest-modal-subtitle" data-guest-modal-meetup></p>
        <form class="guest-add-form" data-guest-add-form>
          <input type="text" name="name" placeholder="이름" required maxlength="80" aria-label="게스트 이름" />
          <input type="text" name="memo" placeholder="메모(선택)" maxlength="200" aria-label="메모" />
          <button type="submit">추가</button>
        </form>
        <ul class="guest-list" data-guest-list></ul>
        <p class="guest-modal-status" data-guest-modal-status role="status" aria-live="polite"></p>
      </article>
    </div>
```

- [ ] **Step 4: Add styles to admin.css**

Append:

```css
.guest-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.guest-modal[hidden] {
  display: none;
}

.guest-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(25, 24, 22, 0.55);
}

.guest-modal-card {
  position: relative;
  z-index: 1;
  width: min(460px, 100%);
  max-height: 80vh;
  overflow-y: auto;
  background: var(--surface, #fff);
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 28px 80px rgba(28, 24, 18, 0.24);
}

.guest-modal-card h3 {
  margin: 0 0 6px;
}

.guest-modal-subtitle {
  margin: 0 0 16px;
  color: var(--muted, #6d6a62);
  font-size: 0.9rem;
}

.guest-modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
}

.guest-add-form {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  margin-bottom: 16px;
}

.guest-add-form input {
  min-height: 40px;
  border: 1px solid var(--line, #ded8ca);
  border-radius: 8px;
  padding: 0 10px;
}

.guest-add-form button {
  border: 0;
  border-radius: 8px;
  background: var(--green, #1f6a53);
  color: #fff;
  font-weight: 800;
  padding: 0 16px;
  cursor: pointer;
}

.guest-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.guest-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--line, #ded8ca);
  border-radius: 8px;
  padding: 10px 12px;
}

.guest-list .guest-memo {
  color: var(--muted, #6d6a62);
  font-size: 0.85rem;
}

.guest-list button {
  border: 0;
  background: transparent;
  color: var(--red, #9c3b2e);
  font-weight: 700;
  cursor: pointer;
}

.guest-modal-status {
  margin: 12px 0 0;
  color: var(--muted, #6d6a62);
  font-size: 0.85rem;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/meetupGuests.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin.html admin.css tests/meetupGuests.test.js
git commit -m "Add the admin guest-management modal markup and styles"
```

---

## Task 8: Guest modal wiring in admin.js

**Files:**
- Modify: `admin.js`
- Test: `tests/meetupGuests.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/meetupGuests.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/meetupGuests.test.js`
Expected: FAIL — no guest modal wiring.

- [ ] **Step 3: Wire the modal**

In `admin.js`:

(a) Extend the imports. Add to the `supabase-client.js` import block:

```js
  listMeetupGuests,
  addMeetupGuest,
  deleteMeetupGuest,
```

Add a new import for the modal manager (admin.js does not import it yet):

```js
import {
  closeModal,
  isModalOpen,
  openModal,
  trapFocus,
} from './modal-manager.js?v=__ASSET_VERSION__';
```

(b) Add element refs near the other `document.querySelector` refs:

```js
const guestModal = document.querySelector('[data-guest-modal]');
const guestModalMeetup = document.querySelector('[data-guest-modal-meetup]');
const guestList = document.querySelector('[data-guest-list]');
const guestAddForm = document.querySelector('[data-guest-add-form]');
const guestModalStatus = document.querySelector('[data-guest-modal-status]');
let guestModalMeetupId = null;
let guestModalRestoreFocus = null;
```

(c) Add the render/open/close/refresh functions (place them near the other
render helpers):

```js
function renderGuestList(guests) {
  if (!guests.length) {
    guestList.innerHTML = '<li class="guest-empty">아직 게스트가 없습니다.</li>';
    return;
  }

  guestList.innerHTML = guests
    .map(
      (guest) => `
        <li>
          <span>
            <strong>${escapeHtml(guest.name)}</strong>
            ${guest.memo ? `<span class="guest-memo"> · ${escapeHtml(guest.memo)}</span>` : ''}
          </span>
          <button type="button" data-delete-guest="${escapeHtml(guest.id)}">삭제</button>
        </li>
      `,
    )
    .join('');
}

async function refreshGuestList() {
  const guests = await listMeetupGuests(activeSession.accessToken, guestModalMeetupId);
  renderGuestList(Array.isArray(guests) ? guests : []);
  guestModalStatus.textContent = `게스트 ${Array.isArray(guests) ? guests.length : 0}명`;
}

async function openGuestModal(meetup) {
  if (!requireActiveSession(syncStatus, '다시 로그인한 뒤 진행해주세요.')) return;
  guestModalMeetupId = meetup.id;
  guestModalMeetup.textContent = meetup.title;
  guestList.innerHTML = '';
  guestModalStatus.textContent = '불러오는 중…';
  guestModalRestoreFocus = openModal(guestModal, 'guest-modal-open', document.activeElement, 'input[name="name"]');

  try {
    await refreshGuestList();
  } catch (error) {
    console.error(error);
    guestModalStatus.textContent = '게스트를 불러오지 못했습니다.';
  }
}

function closeGuestModal() {
  if (!isModalOpen(guestModal)) return;
  closeModal(guestModal, 'guest-modal-open', guestModalRestoreFocus);
  guestModalRestoreFocus = null;
  guestModalMeetupId = null;
}
```

(d) In the existing `meetupsBody.addEventListener('click', ...)` handler, handle
the guest button. Add at the top of the handler (before the `editButton` block):

```js
  const guestsButton = event.target.closest('[data-guests-meetup]');
  if (guestsButton) {
    const meetup = overview.meetups.find((item) => item.id === guestsButton.dataset.guestsMeetup);
    if (meetup) openGuestModal(meetup);
    return;
  }
```

(e) Add modal-level listeners (near the other `addEventListener` setup):

```js
document.querySelectorAll('[data-guest-modal-close]').forEach((element) => {
  element.addEventListener('click', closeGuestModal);
});

guestAddForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!requireActiveSession(guestModalStatus, '다시 로그인한 뒤 진행해주세요.')) return;

  const formData = new FormData(guestAddForm);
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  const memo = String(formData.get('memo') || '').trim();

  guestModalStatus.textContent = '추가 중…';
  try {
    await addMeetupGuest(activeSession.accessToken, guestModalMeetupId, { name, memo });
    guestAddForm.reset();
    await refreshGuestList();
    await loadOperationalData();
  } catch (error) {
    console.error(error);
    guestModalStatus.textContent = getAdminWriteErrorMessage(error);
  }
});

guestList.addEventListener('click', async (event) => {
  const deleteButton = event.target.closest('[data-delete-guest]');
  if (!deleteButton) return;
  if (!requireActiveSession(guestModalStatus, '다시 로그인한 뒤 진행해주세요.')) return;

  deleteButton.disabled = true;
  guestModalStatus.textContent = '삭제 중…';
  try {
    await deleteMeetupGuest(activeSession.accessToken, deleteButton.dataset.deleteGuest);
    await refreshGuestList();
    await loadOperationalData();
  } catch (error) {
    console.error(error);
    deleteButton.disabled = false;
    guestModalStatus.textContent = getAdminWriteErrorMessage(error);
  }
});

document.addEventListener('keydown', (event) => {
  if (!isModalOpen(guestModal)) return;
  if (event.key === 'Escape') {
    closeGuestModal();
    return;
  }
  if (event.key === 'Tab') {
    trapFocus(event, guestModal);
  }
});
```

(f) Add a body scroll-lock style to `admin.css`:

```css
body.guest-modal-open {
  overflow: hidden;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/meetupGuests.test.js`
Expected: PASS.

- [ ] **Step 5: Syntax check + full suite**

Run: `node --check admin.js && npm test`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add admin.js admin.css tests/meetupGuests.test.js
git commit -m "Wire the admin guest-management modal (list/add/delete + seat refresh)"
```

---

## Task 9: Browser smoke, deploy, live verification, cleanup

**Files:** none (verification only)

- [ ] **Step 1: Run the browser smoke**

Run: `npm run smoke:browser`
Expected: all checks pass, including `admin dashboard rendered`. The smoke's
mocked admin fixtures still render (the new `manual_guest_count` column is
optional in the fixtures). If the meetup row now throws because
`manual_guest_count` is missing from the smoke fixture, add `manual_guest_count: 0`
to the `meetup`/`availability` fixtures in `scripts/browser-smoke.mjs` and re-run.

- [ ] **Step 2: Push and let CI deploy**

```bash
git push origin main
```
Watch the Pages deploy run to success (it runs the smoke before publishing).

- [ ] **Step 3: Live verification on a capacity-set meetup**

Using the admin UI (or the Management API for the DB-level parts):
1. Pick or create a published meetup with `capacity` set (e.g., 2).
2. Confirm the public card shows `정원 2명 · 잔여 2석`.
3. In admin → 모임 → that row → "게스트 0명" → add a named guest.
4. Confirm: admin row breakdown shows `게스트 1`; the public card now shows
   `정원 2명 · 잔여 1석`.
5. Add a second guest → public card shows `마감`; a public application attempt is
   blocked (`MEETUP_SOLD_OUT`).
6. Delete a guest → public card returns to `잔여 1석`.

- [ ] **Step 4: Clean up any test data**

Delete the synthetic guests/meetup created for verification (Management API
delete), and confirm `select count(*) from meetup_guests` reflects only real data.

- [ ] **Step 5: Update the backlog**

Add a status note to `TODO.md` summarizing the deployed feature, commit, and push.

---

## Self-Review

**Spec coverage:**
- Part 1 (public `정원 N명 · 잔여 M석`) → Task 3. ✓
- Part 2 data model (`meetup_guests`) → Task 1. ✓
- Seat math fold-in across all four functions + admin `manual_guest_count` → Task 2. ✓
- Security (RLS admin-only, security-definer count, no anon) → Task 1 (table/RLS) + Task 2 (definer functions). ✓
- Admin client CRUD → Task 5. ✓
- Admin UI (row button + modal) → Tasks 6, 7, 8. ✓
- Admin seat breakdown (실/게스트) → Task 4. ✓
- Testing (unit + contract + live) → embedded per task + Task 9. ✓
- Out-of-scope items (no public names, no bulk import, 1 seat/guest) → respected (no tasks add them). ✓

**Placeholder scan:** No TBD/TODO; every code step shows the full code. ✓

**Type/name consistency:** `manual_guest_count` used consistently in SQL, admin
availability normalize, breakdown text, and the snapshot payload.
`data-guests-meetup` (row button) vs `data-guest-modal` / `data-guest-add-form` /
`data-delete-guest` (modal) are distinct and used consistently across Tasks 6–8.
Client functions `listMeetupGuests`/`addMeetupGuest`/`deleteMeetupGuest` match
between Task 5 (definition) and Task 8 (usage). ✓

**Note on the design's "(실주문 4 · 게스트 3)" phrasing:** implemented as the
existing admin breakdown helper extended to `확정 X · 결제중 Y · 게스트 Z`
(Task 4), which preserves the existing paid/pending split while adding guests —
same intent (operator sees the composition), consistent with the current UI.
