import * as webpush from 'jsr:@negrel/webpush';
import { getCorsHeaders, jsonResponse } from '../_shared/http.ts';
import { getRequiredEnv, supabaseRequest } from '../_shared/supabase.ts';

let appServerPromise: Promise<webpush.ApplicationServer> | null = null;

function getApplicationServer() {
  if (!appServerPromise) {
    appServerPromise = (async () => {
      const exportedKeys = JSON.parse(getRequiredEnv('VAPID_KEYS_JWK'));
      const vapidKeys = await webpush.importVapidKeys(exportedKeys, { extractable: false });

      return webpush.ApplicationServer.new({
        contactInformation: getRequiredEnv('VAPID_SUBJECT'),
        vapidKeys,
      });
    })();
  }

  return appServerPromise;
}

type ClaimedSubscription = { id: string; endpoint: string; p256dh: string; auth: string };

function getPushErrorStatus(error: unknown) {
  const candidate = (error as { response?: { status?: number }; status?: number }) || {};
  const status = candidate.response?.status ?? candidate.status;

  if (typeof status === 'number') {
    return status;
  }

  const message = error instanceof Error ? error.message : '';
  if (message.includes('404')) return 404;
  if (message.includes('410')) return 410;

  return 0;
}

async function deleteSubscription(id: string) {
  await supabaseRequest(`push_subscriptions?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

async function pushToSubscriptions(subscriptions: ClaimedSubscription[], message: string) {
  const appServer = await getApplicationServer();
  let sent = 0;
  let failed = 0;
  let expired = 0;

  for (const subscription of subscriptions) {
    try {
      const subscriber = appServer.subscribe({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      });
      await subscriber.pushTextMessage(message, {});
      sent += 1;
    } catch (error) {
      const status = getPushErrorStatus(error);

      if (status === 404 || status === 410) {
        expired += 1;
        await deleteSubscription(subscription.id).catch((cleanupError) => {
          console.error('failed to prune expired subscription', cleanupError);
        });
      } else {
        failed += 1;
        console.error('push send failed', error);
      }
    }
  }

  return { sent, failed, expired };
}

function isServiceRoleRequest(request: Request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

  return Boolean(token) && token === getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}

async function handleRefundPush(request: Request, applicationId: string) {
  // No one-shot claim here: the paid -> refunded transition only ever happens
  // once per order, so the caller fires exactly once. The gate that matters is
  // that only our own functions (service role) may trigger it.
  if (!isServiceRoleRequest(request)) {
    return jsonResponse({ error: '허용되지 않은 요청입니다.' }, 401);
  }

  const applications = (await supabaseRequest(
    `applications?id=eq.${encodeURIComponent(applicationId)}&select=id,meetup_id&limit=1`,
  )) as Array<{ id: string; meetup_id: string }>;
  const application = applications[0];

  if (!application) {
    return jsonResponse({ ok: true, result: { kind: 'refund', sent: 0, failed: 0, expired: 0 } });
  }

  const meetups = (await supabaseRequest(
    `meetups?id=eq.${encodeURIComponent(application.meetup_id)}&select=title&limit=1`,
  )) as Array<{ title?: string }>;
  const meetupTitle = meetups[0]?.title || '모임';

  const subscriptions = (await supabaseRequest(
    `push_subscriptions?application_id=eq.${encodeURIComponent(application.id)}&select=id,endpoint,p256dh,auth`,
  )) as ClaimedSubscription[];

  const message = JSON.stringify({
    title: '결제가 환불되었어요',
    body: `${meetupTitle} 결제가 환불 처리되었습니다. 궁금한 점은 운영자에게 문의해 주세요.`,
    url: './',
  });
  const outcome = await pushToSubscriptions(subscriptions, message);

  return jsonResponse({ ok: true, result: { kind: 'refund', ...outcome } });
}

async function handleRequest(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok');
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const payload = await request.json();
    const applicationId = String(payload.applicationId || '').trim();
    const kind = String(payload.kind || 'approval').trim();

    if (!applicationId) {
      return jsonResponse({ error: 'applicationId is required.' }, 400);
    }

    if (kind === 'refund') {
      return await handleRefundPush(request, applicationId);
    }

    const claim = await supabaseRequest('rpc/claim_approval_push', {
      method: 'POST',
      body: JSON.stringify({ p_application_id: applicationId }),
    });

    if (!claim?.claimed) {
      return jsonResponse({ ok: true, result: { claimed: false, sent: 0, failed: 0, expired: 0 } });
    }

    const subscriptions = (claim.subscriptions || []) as ClaimedSubscription[];
    const message = JSON.stringify({
      title: '신청이 승인되었어요',
      body: `${claim.meetup_title} 신청이 승인되었습니다. 모임에서 만나요!`,
      url: './',
    });
    const outcome = await pushToSubscriptions(subscriptions, message);

    return jsonResponse({ ok: true, result: { claimed: true, ...outcome } });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: '승인 알림 발송에 실패했습니다.' }, 500);
  }
}

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);
  const response = await handleRequest(request);

  Object.entries(corsHeaders).forEach(([name, value]) => {
    response.headers.set(name, value);
  });

  return response;
});
