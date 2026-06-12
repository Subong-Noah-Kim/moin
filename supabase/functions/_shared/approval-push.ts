import { getRequiredEnv } from './supabase.ts';

// Best-effort hop to send-approval-push after an application is auto-accepted.
// The one-shot claim inside that function keeps overlapping callers
// (payment confirm, demo order, manual admin approval) duplicate-free.
export async function notifyApprovalPush(applicationId: unknown) {
  const id = typeof applicationId === 'string' ? applicationId.trim() : '';

  if (!id) {
    return;
  }

  try {
    const supabaseUrl = getRequiredEnv('SUPABASE_URL').replace(/\/$/, '');
    const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

    await fetch(`${supabaseUrl}/functions/v1/send-approval-push`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ applicationId: id }),
    });
  } catch (error) {
    console.error('approval push send failed after auto-accept', error);
  }
}
