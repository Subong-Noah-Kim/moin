import { getRequiredEnv, readJson } from './supabase.ts';

// Best-effort hop to send-approval-push. For the approval kind, the one-shot
// claim inside that function keeps overlapping callers (payment confirm, demo
// order, manual admin approval) duplicate-free. For the refund kind, the
// paid -> refunded transition itself only happens once per order.
async function notifyPush(applicationId: unknown, kind: 'approval' | 'refund') {
  const id = typeof applicationId === 'string' ? applicationId.trim() : '';

  if (!id) {
    return null;
  }

  try {
    const supabaseUrl = getRequiredEnv('SUPABASE_URL').replace(/\/$/, '');
    const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch(`${supabaseUrl}/functions/v1/send-approval-push`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(kind === 'refund' ? { applicationId: id, kind } : { applicationId: id }),
    });
    const body = await readJson(response);

    if (!response.ok) {
      console.error(`${kind} push send failed`, body);
      return null;
    }

    return (body as { result?: Record<string, unknown> })?.result || null;
  } catch (error) {
    console.error(`${kind} push send failed`, error);
    return null;
  }
}

export async function notifyApprovalPush(applicationId: unknown) {
  return notifyPush(applicationId, 'approval');
}

export function notifyRefundPush(applicationId: unknown) {
  return notifyPush(applicationId, 'refund');
}
