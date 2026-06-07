import {
  getPaymentButtonTextForMeetup,
  getRegistrationBlockReason,
  getRegistrationStatusDescription,
  getRegistrationStatusLabel,
  isRegistrationAvailable,
} from './public-availability.js?v=__ASSET_VERSION__';

export function getPublicMeetupActionState(item, { isPaid = false } = {}) {
  const canRegister = isRegistrationAvailable(item);
  const registrationLabel = getRegistrationStatusLabel(item);
  const registrationDescription = getRegistrationStatusDescription(item);
  const blockReason = getRegistrationBlockReason(item);

  return {
    canRegister,
    registrationLabel,
    registrationDescription,
    blockReason,
    canSubmitApplication: canRegister,
    canOpenCheckout: canRegister && !isPaid,
    paymentSummaryClass: [
      'payment-summary',
      isPaid ? 'is-paid' : '',
      !canRegister && !isPaid ? 'is-closed' : '',
    ].filter(Boolean).join(' '),
    paymentSummaryLabel: isPaid ? '결제 상태' : canRegister ? '참가비 결제' : '신청 상태',
    paymentSummaryTitle: isPaid
      ? '테스트 결제 확인 표시가 있는 모임입니다'
      : canRegister
        ? item?.price || ''
        : registrationLabel,
    paymentSummaryDescription: isPaid
      ? '이 브라우저에 테스트 결제 확인 표시가 저장되어 있어요.'
      : canRegister
        ? '토스 테스트 결제와 서버 승인 흐름을 확인합니다. 실제 출금은 없습니다.'
        : registrationDescription,
    paymentButtonText: getPaymentButtonTextForMeetup(item, { isPaid }),
    paymentButtonDisabled: isPaid || !canRegister,
  };
}
