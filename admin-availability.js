function normalizeOptionalInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeAdminAvailability(row) {
  return {
    meetup_id: String(row.meetup_id || ''),
    capacity: normalizeOptionalInteger(row.capacity),
    paid_order_count: Number(row.paid_order_count || 0),
    pending_order_count: Number(row.pending_order_count || 0),
    active_order_count: Number(row.active_order_count || 0),
    remaining_spots: row.remaining_spots === null ? null : Number(row.remaining_spots),
    registration_status: String(row.registration_status || 'open'),
    effective_registration_status: String(row.effective_registration_status || 'open'),
    can_register: row.can_register === true,
    closed_at: row.closed_at || null,
    close_reason: row.close_reason || '',
    availability_known: true,
  };
}

export function mergeAdminMeetupAvailability(meetups, availabilityRows = []) {
  const availabilityByMeetupId = new Map(
    availabilityRows
      .map(normalizeAdminAvailability)
      .filter((availability) => availability.meetup_id)
      .map((availability) => [availability.meetup_id, availability]),
  );

  return meetups.map((meetup) => {
    const availability = availabilityByMeetupId.get(meetup.id);

    if (availability) {
      return { ...meetup, ...availability };
    }

    return {
      ...meetup,
      availability_known: false,
      effective_registration_status: 'unknown',
      can_register: false,
      paid_order_count: null,
      pending_order_count: null,
      active_order_count: null,
      remaining_spots: null,
    };
  });
}

export function getSeatStatusLabel(meetup) {
  if (meetup.availability_known === false) return '확인 지연';
  if (meetup.effective_registration_status === 'closed') return '신청 종료';
  if (meetup.effective_registration_status === 'sold_out') return '마감';
  return '접수 가능';
}

export function getSeatStatusClass(meetup) {
  if (meetup.availability_known === false) return 'is-deferred';
  if (meetup.effective_registration_status === 'closed' || meetup.effective_registration_status === 'sold_out') {
    return 'is-failed';
  }
  if (Number.isFinite(meetup.remaining_spots) && meetup.remaining_spots <= 2) return 'is-pending';
  return 'is-published';
}

export function getSeatSummaryText(meetup) {
  if (meetup.availability_known === false) {
    return meetup.capacity ? `정원 ${meetup.capacity}명 · 잔여 확인 지연` : '잔여 확인 지연';
  }

  if (!meetup.capacity) {
    return '무제한';
  }

  return `잔여 ${meetup.remaining_spots}/${meetup.capacity}`;
}

export function getSeatBreakdownText(meetup) {
  if (meetup.availability_known === false) {
    return '정원 상태를 다시 불러와야 합니다.';
  }

  return `확정 ${meetup.paid_order_count || 0} · 결제중 ${meetup.pending_order_count || 0}`;
}
