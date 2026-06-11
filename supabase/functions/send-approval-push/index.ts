import * as webpush from 'jsr:@negrel/webpush';

const allowedOrigins = new Set([
  'https://subong-noah-kim.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const defaultAllowedOrigin = 'https://subong-noah-kim.github.io';

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';

  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : defaultAllowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

async function readJson(response: Response) {
  const bodyText = await response.text();

  try {
    return bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return bodyText;
  }
}

async function supabaseRequest(path: string, options: RequestInit = {}) {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const headers = new Headers(options.headers);

  headers.set('apikey', serviceRoleKey);
  headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers,
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      typeof body === 'string'
        ? body
        : body?.message || `Supabase request failed: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  return body;
}

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

    if (!applicationId) {
      return jsonResponse({ error: 'applicationId is required.' }, 400);
    }

    const claim = await supabaseRequest('rpc/claim_approval_push', {
      method: 'POST',
      body: JSON.stringify({ p_application_id: applicationId }),
    });

    if (!claim?.claimed) {
      return jsonResponse({ ok: true, result: { claimed: false, sent: 0, failed: 0, expired: 0 } });
    }

    const appServer = await getApplicationServer();
    const subscriptions = (claim.subscriptions || []) as ClaimedSubscription[];
    const message = JSON.stringify({
      title: '신청이 승인되었어요',
      body: `${claim.meetup_title} 신청이 승인되었습니다. 모임에서 만나요!`,
      url: './',
    });

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

    return jsonResponse({ ok: true, result: { claimed: true, sent, failed, expired } });
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
