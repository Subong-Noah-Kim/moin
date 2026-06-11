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

type PublicSubmissionAction = 'application' | 'toss_order' | 'demo_order' | 'push_subscription';

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

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';

  if (message.includes('PUBLIC_SUBMISSION_RATE_LIMITED')) {
    return 429;
  }

  if (message.includes('APPLICATION_REQUIRED')) {
    return 409;
  }

  if (message.includes('APPLICATION_NOT_FOUND')) {
    return 404;
  }

  if (
    message.includes('APPLICATION_ALREADY_PAID') ||
    message.includes('APPLICATION_NOT_PAYABLE') ||
    message.includes('APPLICATION_MEETUP_MISMATCH')
  ) {
    return 409;
  }

  if (message.includes('MEETUP_SOLD_OUT') || message.includes('MEETUP_REGISTRATION_CLOSED')) {
    return 409;
  }

  return 400;
}

function getErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';

  if (message.includes('PUBLIC_SUBMISSION_RATE_LIMITED')) {
    return 'PUBLIC_SUBMISSION_RATE_LIMITED';
  }

  if (message.includes('APPLICATION_REQUIRED')) {
    return 'APPLICATION_REQUIRED';
  }

  if (message.includes('APPLICATION_NOT_FOUND')) {
    return 'APPLICATION_NOT_FOUND';
  }

  if (message.includes('APPLICATION_ALREADY_PAID')) {
    return 'APPLICATION_ALREADY_PAID';
  }

  if (message.includes('APPLICATION_NOT_PAYABLE')) {
    return 'APPLICATION_NOT_PAYABLE';
  }

  if (message.includes('APPLICATION_MEETUP_MISMATCH')) {
    return 'APPLICATION_MEETUP_MISMATCH';
  }

  if (message.includes('MEETUP_SOLD_OUT')) {
    return 'MEETUP_SOLD_OUT';
  }

  if (message.includes('MEETUP_REGISTRATION_CLOSED')) {
    return 'MEETUP_REGISTRATION_CLOSED';
  }

  if (message.includes('MEETUP_NOT_FOUND')) {
    return 'MEETUP_NOT_FOUND';
  }

  return undefined;
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';

  if (message.includes('PUBLIC_SUBMISSION_RATE_LIMITED')) {
    return '짧은 시간 안에 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (message.includes('APPLICATION_REQUIRED')) {
    return '신청서를 먼저 제출한 뒤 결제할 수 있습니다.';
  }

  if (message.includes('APPLICATION_NOT_FOUND')) {
    return '신청 내역을 찾지 못했습니다. 신청서를 다시 제출해 주세요.';
  }

  if (message.includes('APPLICATION_ALREADY_PAID')) {
    return '이미 결제가 완료된 신청입니다.';
  }

  if (message.includes('APPLICATION_NOT_PAYABLE')) {
    return '이 신청은 결제할 수 없는 상태입니다. 운영자에게 문의해 주세요.';
  }

  if (message.includes('APPLICATION_MEETUP_MISMATCH')) {
    return '신청한 모임과 결제하려는 모임이 다릅니다.';
  }

  if (message.includes('MEETUP_SOLD_OUT')) {
    return '모임 정원이 마감되었습니다. 다른 모임을 확인해 주세요.';
  }

  if (message.includes('MEETUP_REGISTRATION_CLOSED')) {
    return '이 모임은 지금 신청을 받지 않습니다.';
  }

  if (message.includes('MEETUP_NOT_FOUND')) {
    return '신청 가능한 모임을 찾지 못했습니다.';
  }

  return message || '공개 신청/주문 생성에 실패했습니다.';
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
    }

    return jsonResponse({
      ok: true,
      result,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(
      {
        error: getErrorMessage(error),
        code: getErrorCode(error),
      },
      getErrorStatus(error),
    );
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
