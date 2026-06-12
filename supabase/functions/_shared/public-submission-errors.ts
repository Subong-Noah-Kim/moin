// One lookup table drives the status, code, and user message for every known
// public submission RPC error. Order matters: the first match wins.
const errorMappings = [
  { match: 'PUBLIC_SUBMISSION_RATE_LIMITED', status: 429, code: 'PUBLIC_SUBMISSION_RATE_LIMITED', message: '짧은 시간 안에 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
  { match: 'EMAIL_REQUIRED', status: 400, code: 'EMAIL_REQUIRED', message: '신청 확인을 위해 이메일을 입력해 주세요.' },
  { match: 'EMAIL_INVALID', status: 400, code: 'EMAIL_INVALID', message: '이메일 주소 형식을 확인해 주세요.' },
  { match: 'APPLICATION_REQUIRED', status: 409, code: 'APPLICATION_REQUIRED', message: '신청서를 먼저 제출한 뒤 결제할 수 있습니다.' },
  { match: 'APPLICATION_NOT_FOUND', status: 404, code: 'APPLICATION_NOT_FOUND', message: '신청 내역을 찾지 못했습니다. 신청서를 다시 제출해 주세요.' },
  { match: 'APPLICATION_ALREADY_PAID', status: 409, code: 'APPLICATION_ALREADY_PAID', message: '이미 결제가 완료된 신청입니다.' },
  { match: 'APPLICATION_NOT_PAYABLE', status: 409, code: 'APPLICATION_NOT_PAYABLE', message: '이 신청은 결제할 수 없는 상태입니다. 운영자에게 문의해 주세요.' },
  { match: 'APPLICATION_MEETUP_MISMATCH', status: 409, code: 'APPLICATION_MEETUP_MISMATCH', message: '신청한 모임과 결제하려는 모임이 다릅니다.' },
  { match: 'MEETUP_SOLD_OUT', status: 409, code: 'MEETUP_SOLD_OUT', message: '모임 정원이 마감되었습니다. 다른 모임을 확인해 주세요.' },
  { match: 'MEETUP_REGISTRATION_CLOSED', status: 409, code: 'MEETUP_REGISTRATION_CLOSED', message: '이 모임은 지금 신청을 받지 않습니다.' },
  { match: 'MEETUP_NOT_FOUND', status: 400, code: 'MEETUP_NOT_FOUND', message: '신청 가능한 모임을 찾지 못했습니다.' },
];

export function mapPublicSubmissionError(error: unknown) {
  const raw = error instanceof Error ? error.message : '';
  const mapping = errorMappings.find(({ match }) => raw.includes(match));

  if (mapping) {
    const { status, code, message } = mapping;
    return { status, code, message };
  }

  return {
    status: 400,
    code: undefined,
    message: raw || '공개 신청/주문 생성에 실패했습니다.',
  };
}
