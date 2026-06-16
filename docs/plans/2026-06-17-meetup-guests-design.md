# Meetup capacity display + named virtual guests — Design

Date: 2026-06-17

## Goal

Two related capabilities for meetup (content) capacity:

1. **Display improvement (Part 1)** — public cards/detail show the capacity
   alongside remaining seats as plain text: `정원 12명 · 잔여 5석`.
2. **Named virtual guests (Part 2)** — an admin can add individual named guests
   (name + optional memo) to a meetup. Each guest holds **one seat**, reducing
   the remaining count everywhere (public display *and* the registration guard),
   and can be removed individually. Guest **names are admin-only**; the public
   only ever sees the reduced remaining number.

## Background (existing system)

Capacity/remaining already exists and is wired end to end:

- `meetups.capacity` (nullable integer; null = unlimited). Set via the admin
  meetup form (`admin-meetup-form.js`).
- Four security-definer functions each compute remaining from
  `capacity − active_order_count` (active = orders in `paid`/`demo_paid`, plus
  non-expired pending Toss holds), clamped at 0, with a `sold_out` status:
  - `get_meetup_seat_snapshot(meetup_id)`
  - `list_public_meetup_availability()` — already returns `capacity`,
    `remaining_spots`, `effective_registration_status`
  - `list_admin_meetup_availability()` — already returns `capacity`,
    `active_order_count`, `remaining_spots`
  - `assert_meetup_can_register(meetup_id)` — registration guard (blocks
    over-capacity submissions)
- Public cards render `잔여 N석` / `마감` / `접수중` (`public-availability.js`);
  admin shows `잔여 N/정원` (`admin-availability.js`).

The feature appears "missing" only because most live meetups have no capacity
set (so they show `접수중`). No DB change is needed to expose `capacity`
publicly — it is already returned by `list_public_meetup_availability`.

## Part 1 — Public display

- `public-availability.js`: normalize `capacity` from the availability row, and
  when capacity is set, render `정원 {capacity}명 · 잔여 {remaining}석` (no
  progress bar). Keep `마감` when sold out and `접수중` when capacity is null.
- This is a pure label-composition change in `getRegistrationStatusLabel` (and
  the matching description helper), unit-testable without the DOM.

## Part 2 — Named virtual guests

### Data model

New table `public.meetup_guests`:

| column      | type        | notes                                            |
|-------------|-------------|--------------------------------------------------|
| id          | uuid pk     | `default gen_random_uuid()`                      |
| meetup_id   | text        | `references public.meetups(id) on delete cascade`|
| name        | text        | `not null`, `check (char_length(trim(name)) between 1 and 80)` |
| memo        | text        | nullable, `check (char_length(memo) <= 200)`     |
| created_by  | uuid        | `default auth.uid()` (audit)                     |
| created_at  | timestamptz | `default now()`                                  |

One row = one held seat. Index on `meetup_id`.

### Seat math integration (single source of truth for the count)

Add the guest count to **every** place remaining is computed, so the public
display, the admin view, the single-meetup snapshot, and the registration guard
stay consistent:

- `remaining_spots = greatest(capacity − active_order_count − manual_guest_count, 0)`
- `sold_out` when `active_order_count + manual_guest_count >= capacity`

Implementation: a per-meetup guest count (a small `manual_guest_count` CTE/scalar
subquery over `meetup_guests`) folded into each of the four functions. The admin
availability function additionally **returns `manual_guest_count`** so the admin
UI can show the breakdown.

Meetups with `capacity = null` (unlimited): guests are still stored and listed,
but `remaining_spots` stays `null` (guests don't constrain an unlimited meetup).

Over-capacity: adding guests beyond capacity is allowed (admin override);
`remaining_spots` clamps at 0 and the meetup reads as `마감`.

### Security

- `meetup_guests` has RLS enabled with **no anon access**. Admin CRUD mirrors the
  existing meetups pattern: `grant select, insert, delete on public.meetup_guests
  to authenticated`, with policies `using/with check (public.is_admin())` for
  select/insert/delete. Anon receives no grant.
- The four seat functions are `security definer`, so they count `meetup_guests`
  internally and expose **only the number** — guest names never reach the public
  read contract.

### Admin client + UI

- `supabase-client.js`: `listMeetupGuests(accessToken, meetupId)`,
  `addMeetupGuest(accessToken, meetupId, { name, memo })`,
  `deleteMeetupGuest(accessToken, guestId)` — direct PostgREST CRUD on
  `meetup_guests` with the admin token (RLS enforces `is_admin()`).
- **Admin → Meetups tab**: each meetup row gets a **"게스트 N명"** button. It opens
  a **modal** (reusing the shared `modal-manager` for focus trap/Escape/restore,
  consistent with the drawer/checkout/install modals) showing:
  - the guest list for that meetup (name · memo · 삭제 button per row),
  - an add form (name required, memo optional),
  - on add/delete, refresh the list and re-fetch availability so the row's seat
    summary updates.
- `admin-availability.js` seat summary becomes
  `잔여 5/12 (실주문 4 · 게스트 3)` when capacity is set, using the new
  `manual_guest_count` from the admin availability row. Pure helper, unit-tested.

## Testing

- **Pure helpers** (unit): public label `정원 N명 · 잔여 M석` composition; admin
  seat-summary breakdown with `manual_guest_count`; guest payload validation.
- **Migration/RPC contract** (source pins): `meetup_guests` table + RLS policies
  + grants; each seat function folds in `manual_guest_count`; admin availability
  returns `manual_guest_count`.
- **Admin UI** (source pins): the "게스트" button + modal markup, the
  add/delete wiring through the new client functions.
- **Live verification**: on a capacity-set test meetup — add a named guest →
  public `잔여` drops by 1 and admin breakdown shows `게스트 1` → fill to capacity →
  public reads `마감` and a public registration attempt is blocked → delete the
  guest → `잔여` restored. Then clean up the test rows.

## Out of scope

- No public visibility of guest names (privacy).
- No bulk import / CSV of guests.
- No per-guest seat weighting (each guest = exactly 1 seat).
- No automatic conversion between a real application/order and a virtual guest.
