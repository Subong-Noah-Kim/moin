function normalizeOptionalCount(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}

function normalizeAvailability(row) {
  return {
    id: String(row.meetup_id || ''),
    availabilityKnown: true,
    capacity: normalizeOptionalCount(row.capacity),
    remainingSpots: normalizeOptionalCount(row.remaining_spots),
    effectiveRegistrationStatus: String(row.effective_registration_status || 'closed'),
    canRegister: row.can_register === true,
  };
}

export function mergeMeetupAvailability(items, availabilityRows, { requireAvailability = false } = {}) {
  const availabilityByMeetupId = new Map(
    availabilityRows
      .map(normalizeAvailability)
      .filter((availability) => availability.id)
      .map((availability) => [availability.id, availability]),
  );

  return items.map((item) => {
    const availability = availabilityByMeetupId.get(item.id);

    if (availability) {
      return { ...item, ...availability };
    }

    if (requireAvailability) {
      return {
        ...item,
        availabilityKnown: false,
        canRegister: false,
        effectiveRegistrationStatus: 'unknown',
        capacity: null,
        remainingSpots: null,
      };
    }

    return item;
  });
}

export function isRegistrationAvailable(item) {
  if (item?.availabilityKnown === false) {
    return false;
  }

  if (typeof item?.canRegister === 'boolean') {
    return item.canRegister;
  }

  return true;
}

export function getRegistrationStatusLabel(item) {
  if (item?.availabilityKnown === false) {
    return '접수 확인중';
  }

  if (item?.effectiveRegistrationStatus === 'closed') {
    return '신청 종료';
  }

  if (item?.effectiveRegistrationStatus === 'sold_out') {
    return '마감';
  }

  if (Number.isFinite(item?.remainingSpots)) {
    return `잔여 ${item.remainingSpots}석`;
  }

  if (item?.availabilityKnown === true) {
    return '접수중';
  }

  return item?.status || '신청 가능';
}

export function getRegistrationStatusDescription(item) {
  if (item?.availabilityKnown === false) {
    return '잔여석 정보를 확인하지 못해 신청과 결제를 잠시 막았습니다. 잠시 후 다시 시도해주세요.';
  }

  if (item?.effectiveRegistrationStatus === 'closed') {
    return '운영자가 접수를 닫아 새 신청과 테스트 결제를 받을 수 없습니다.';
  }

  if (item?.effectiveRegistrationStatus === 'sold_out') {
    return '정원이 모두 차서 새 신청과 테스트 결제를 받을 수 없습니다.';
  }

  if (Number.isFinite(item?.remainingSpots)) {
    return `현재 신청 가능한 자리는 ${item.remainingSpots}석입니다.`;
  }

  return '현재 신청과 테스트 결제를 진행할 수 있습니다.';
}

export function getPublicStatusClass(item) {
  if (item?.availabilityKnown === false) return 'is-checking';
  if (item?.effectiveRegistrationStatus === 'closed' || item?.effectiveRegistrationStatus === 'sold_out') {
    return 'is-urgent';
  }
  if (Number.isFinite(item?.remainingSpots)) return item.remainingSpots <= 2 ? 'is-urgent' : 'is-seat';
  if (item?.availabilityKnown === true) return 'is-open';

  const value = String(item?.status || '');
  if (value.includes('마감')) return 'is-urgent';
  if (value.includes('NEW')) return 'is-new';
  if (value.includes('자리')) return 'is-seat';
  return 'is-open';
}

export function getPaymentButtonTextForMeetup(item, { isPaid = false } = {}) {
  if (isPaid) return '테스트 결제 완료';
  if (item?.availabilityKnown === false) return '확인중';
  if (item?.effectiveRegistrationStatus === 'sold_out') return '마감';
  if (item?.effectiveRegistrationStatus === 'closed') return '신청 종료';
  if (item && !isRegistrationAvailable(item)) return '신청 불가';
  return '결제하기';
}
