const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PublicSubmissionAction = 'application' | 'toss_order' | 'demo_order';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
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
  const salt = Deno.env.get('PUBLIC_SUBMISSION_HASH_SALT') || getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
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

  if (!['application', 'toss_order', 'demo_order'].includes(action)) {
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
    }),
  });
}

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';

  if (message.includes('PUBLIC_SUBMISSION_RATE_LIMITED')) {
    return 429;
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const payload = await request.json();
    const action = getAction(payload);
    const visitorHash = await getVisitorHash(request);
    const result = action === 'application'
      ? await createApplication(payload, visitorHash)
      : await createOrder(action, payload, visitorHash);

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
});
