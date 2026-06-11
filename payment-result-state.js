const moneyFormatter = new Intl.NumberFormat('ko-KR');

export function createTossAuthSummary({ orderId, amount }, receivedAt = new Date()) {
  return {
    orderId,
    amount,
    receivedAt: typeof receivedAt?.toISOString === 'function' ? receivedAt.toISOString() : String(receivedAt || ''),
  };
}

export function formatPaymentResultAmount(value) {
  const amount = Number(value || 0);
  if (!amount) return '-';
  return `${moneyFormatter.format(amount)}원`;
}

export function getConfirmErrorMessage(error) {
  const message = error?.message || String(error);

  if (error?.code === 'APPLICATION_ALREADY_PAID' || message.includes('이미 결제가 완료된 신청')) {
    return '이미 결제가 완료된 신청입니다. 이전 결제가 정상 처리되어 추가 결제는 필요 없어요.';
  }

  if (message.includes('network request failed') || message.includes('Load failed')) {
    return 'Supabase Edge Function(confirm-toss-payment) 호출에 실패했습니다. 함수 배포와 CORS 응답을 확인해주세요.';
  }

  if (message.includes('Requested function was not found')) {
    return 'Supabase Edge Function(confirm-toss-payment)을 찾지 못했습니다. 함수 배포 상태를 확인해주세요.';
  }

  if (message.includes('TOSS_SECRET_KEY')) {
    return '결제 승인 서버 설정을 확인해주세요.';
  }

  return '결제 승인 처리에 실패했습니다. 잠시 후 다시 시도하거나 운영자에게 문의해주세요.';
}

export function getFailureStatusLabel(status) {
  if (status === 'cancelled') return '취소';
  if (status === 'failed') return '실패';
  return status || '실패';
}
