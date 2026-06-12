import { getCorsHeaders, jsonResponse } from '../_shared/http.ts';
import { getRequiredEnv, supabaseRequest } from '../_shared/supabase.ts';
import { notifyApprovalPush } from '../_shared/approval-push.ts';
import { mapPublicSubmissionError } from '../_shared/public-submission-errors.ts';

type PublicSubmissionAction = 'application' | 'toss_order' | 'demo_order' | 'push_subscription';

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfIp = request.headers.get('cf-connecting-ip');
  const source = forwardedFor || realIp || cfIp || 'unknown';

  return source.split(',')[0]?.trim() || 'unknown';
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function getVisitorHash(request: Request) {
  const salt = getRequiredEnv('PUBLIC_SUBMISSION_HASH_SALT');
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';

  return sha256Hex(`${salt}:${ip}:${userAgent}`);
}

function getText(payload: Record<string, unknown>, key: string) {
  return String(payload[key] || '').trim();
}

const checkoutPaymentMethods = ['간편결제', '카드', '계좌이체'];

function getPaymentMethod(payload: Record<string, unknown>) {
  const paymentMethod = getText(payload, 'paymentMethod');

  return checkoutPaymentMethods.includes(paymentMethod) ? paymentMethod : '간편결제';
}

function getAction(payload: Record<string, unknown>): PublicSubmissionAction {
  const action = getText(payload, 'action') as PublicSubmissionAction;

  if (!['application', 'toss_order', 'demo_order', 'push_subscription'].includes(action)) {
    throw new Error('Unsupported public submission action.');
  }

  return action;
}

async function createApplication(payload: Record<string, unknown>, visitorHash: string) {
  return supabaseRequest('rpc/create_public_application', {
    method: 'POST',
    body: JSON.stringify({
      p_visitor_hash: visitorHash,
      p_meetup_id: getText(payload, 'meetupId'),
      p_applicant_name: getText(payload, 'name'),
      p_interest: getText(payload, 'interest'),
    }),
  });
}

async function registerPushSubscription(payload: Record<string, unknown>, visitorHash: string) {
  return supabaseRequest('rpc/register_push_subscription', {
    method: 'POST',
    body: JSON.stringify({
      p_visitor_hash: visitorHash,
      p_application_token: getText(payload, 'applicationToken'),
      p_endpoint: getText(payload, 'endpoint'),
      p_p256dh: getText(payload, 'p256dh'),
      p_auth: getText(payload, 'auth'),
    }),
  });
}

async function createOrder(
  action: Extract<PublicSubmissionAction, 'toss_order' | 'demo_order'>,
  payload: Record<string, unknown>,
  visitorHash: string,
) {
  return supabaseRequest('rpc/create_public_order', {
    method: 'POST',
    body: JSON.stringify({
      p_visitor_hash: visitorHash,
      p_action: action,
      p_meetup_id: getText(payload, 'meetupId'),
      p_buyer_name: getText(payload, 'payerName'),
      p_payment_method: getPaymentMethod(payload),
      p_provider_order_id: getText(payload, 'providerOrderId') || null,
      p_checkout_token: getText(payload, 'checkoutToken') || null,
      p_application_token: getText(payload, 'applicationToken') || null,
    }),
  });
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
    const action = getAction(payload);
    const visitorHash = await getVisitorHash(request);
    let result;
    if (action === 'application') {
      result = await createApplication(payload, visitorHash);
    } else if (action === 'push_subscription') {
      result = await registerPushSubscription(payload, visitorHash);
    } else {
      result = await createOrder(action, payload, visitorHash);

      if (action === 'demo_order') {
        const order = (result as { order?: { application_id?: unknown } })?.order;
        await notifyApprovalPush(order?.application_id);
      }
    }

    return jsonResponse({
      ok: true,
      result,
    });
  } catch (error) {
    console.error(error);
    const { status, code, message } = mapPublicSubmissionError(error);

    return jsonResponse({ error: message, code }, status);
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
