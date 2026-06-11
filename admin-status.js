export const applicationStatuses = ['submitted', 'reviewing', 'accepted', 'rejected', 'cancelled'];

const applicationStatusLabels = {
  submitted: '접수',
  reviewing: '검토중',
  accepted: '승인',
  rejected: '거절',
  cancelled: '취소',
};

export const orderStatuses = ['pending', 'cancelled', 'failed'];

const orderStatusLabels = {
  pending: '입금대기',
  demo_paid: '데모결제',
  paid: '결제완료',
  cancelled: '취소',
  failed: '실패',
};

const paymentStatusLabels = {
  paid: '기록 있음',
  cancelled: '취소 기록',
  failed: '실패 기록',
  refunded: '환불',
  partial_refunded: '부분 환불',
};

const agentStatusLabels = {
  running: '진행중',
  idle: '대기',
  blocked: '막힘',
  done: '완료',
};

const taskStatusLabels = {
  proposed: '제안',
  approved: '승인',
  assigned: '할당',
  in_progress: '진행중',
  needs_review: '검토 필요',
  rejected: '반려',
  deferred: '보류',
  done_local: '로컬 완료',
  deployed: '배포 완료',
};

function createStatusOptions(statuses, labelGetter, currentStatus) {
  return statuses.map((status) => ({
    value: status,
    label: labelGetter(status),
    selected: status === currentStatus,
  }));
}

export function getApplicationStatusLabel(status) {
  return applicationStatusLabels[status] || status || '-';
}

export function getApplicationStatusOptions(currentStatus) {
  return createStatusOptions(applicationStatuses, getApplicationStatusLabel, currentStatus);
}

export function getOrderStatusLabel(status) {
  return orderStatusLabels[status] || status || '-';
}

export function getOrderStatusOptions(currentStatus) {
  return createStatusOptions(orderStatuses, getOrderStatusLabel, currentStatus);
}

export function getPaymentStatusLabel(status) {
  return paymentStatusLabels[status] || status || '결제 기록';
}

export function getAgentStatusLabel(status) {
  return agentStatusLabels[status] || status || '-';
}

export function getTaskStatusLabel(status) {
  return taskStatusLabels[status] || status || '-';
}

export function getStatusClass(status) {
  return String(status || 'idle').replace(/[^a-z0-9_-]/gi, '_');
}

export function canManuallyUpdateOrderStatus(status) {
  return orderStatuses.includes(status);
}

export function getApprovalPushSummaryMessage(summary) {
  const base = '신청 상태 승인 저장 완료';

  if (!summary || summary.skipped) {
    return base;
  }

  if (!summary.claimed) {
    return `${base} · 보낼 알림이 없어요`;
  }

  const parts = [];
  if (summary.sent > 0) parts.push(`승인 알림 ${summary.sent}건 발송`);
  if (summary.failed > 0) parts.push(`알림 발송 실패 ${summary.failed}건`);
  if (!parts.length) parts.push('보낼 알림이 없어요');

  return [base, ...parts].join(' · ');
}
