import { getCorsHeaders, jsonResponse } from '../_shared/http.ts';
import { getRequiredEnv, readJson, supabaseRequest } from '../_shared/supabase.ts';
import { notifyApprovalPush } from '../_shared/approval-push.ts';

type OrderRow = {
  id: string;
  meetup_id: string;
  buyer_name: string | null;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  payment_method: string | null;
  provider_order_id: string | null;
  checkout_token: string | null;
  expires_at: string | null;
  application_id: string | null;
};

type MeetupRow = {
  id: string;
  price_amount: number;
};

type FailurePayload = {
  orderId: string;
  checkoutToken: string;
  code: string;
  message: string;
};

function getTossAuthorization() {
  const secretKey = getRequiredEnv('TOSS_SECRET_KEY');
  return `Basic ${btoa(`${secretKey}:`)}`;
}

async function confirmWithToss(paymentKey: string, orderId: string, amount: number) {
  const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: getTossAuthorization(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paymentKey,
      orderId,
      amount,
    }),
  });
  const body = await readJson(response);

  if (!response.ok) {
    const error = new Error(
      typeof body === 'string'
        ? body
        : body?.message || `Toss confirm failed: ${response.status}`,
    );
    error.name = body?.code || 'TOSS_CONFIRM_FAILED';
    throw error;
  }

  return body;
}

function assertPaymentPayload(payload: Record<string, unknown>) {
  const paymentKey = String(payload.paymentKey || '').trim();
  const orderId = String(payload.orderId || '').trim();
  const amount = Number(payload.amount);

  if (!paymentKey || !orderId || !Number.isInteger(amount) || amount <= 0) {
    throw new Error('paymentKey, orderId, amount are required.');
  }

  return { paymentKey, orderId, amount };
}

function assertFailurePayload(payload: Record<string, unknown>): FailurePayload {
  const orderId = String(payload.orderId || '').trim();
  const checkoutToken = String(payload.checkoutToken || '').trim();
  const code = String(payload.code || 'PAYMENT_FAILED').trim();
  const message = String(payload.message || '').trim();

  if (!orderId) {
    throw new Error('orderId is required.');
  }

  if (!checkoutToken) {
    throw new Error('checkoutToken is required.');
  }

  return { orderId, checkoutToken, code, message };
}

async function findTossOrder(orderId: string) {
  const query = new URLSearchParams({
    provider_order_id: `eq.${orderId}`,
    provider: 'eq.tosspayments',
    select:
      'id,meetup_id,buyer_name,amount,currency,status,provider,payment_method,provider_order_id,checkout_token,expires_at,application_id',
    limit: '2',
  });
  const rows = (await supabaseRequest(`orders?${query.toString()}`)) as OrderRow[];

  if (!rows.length) {
    throw new Error('주문을 찾지 못했습니다.');
  }

  if (rows.length > 1) {
    throw new Error('같은 토스 주문번호가 중복으로 저장되어 있습니다.');
  }

  return rows[0];
}

async function findMeetupForOrder(order: OrderRow) {
  const query = new URLSearchParams({
    id: `eq.${order.meetup_id}`,
    select: 'id,price_amount',
    limit: '1',
  });
  const rows = (await supabaseRequest(`meetups?${query.toString()}`)) as MeetupRow[];

  if (!rows.length) {
    throw new Error('주문에 연결된 모임을 찾지 못했습니다.');
  }

  return rows[0];
}

async function assertServerAmount(order: OrderRow, amount: number) {
  const meetup = await findMeetupForOrder(order);

  if (order.amount !== meetup.price_amount || amount !== meetup.price_amount || order.currency !== 'KRW') {
    return jsonResponse({ error: '결제 금액 또는 통화가 서버 모임 가격과 다릅니다.' }, 409);
  }

  return null;
}

function getFailureStatus(code: string, message: string) {
  const value = `${code} ${message}`.toUpperCase();

  if (
    value.includes('CANCEL') ||
    value.includes('CANCELED') ||
    value.includes('CANCELLED') ||
    value.includes('ABORT') ||
    value.includes('USER_CANCEL') ||
    value.includes('취소')
  ) {
    return 'cancelled';
  }

  return 'failed';
}

function getPaymentMethod(tossPayment: Record<string, unknown>, order: OrderRow) {
  return String(tossPayment.method || order.payment_method || '토스페이먼츠');
}

function redactOrder(order: OrderRow) {
  const { checkout_token: _checkoutToken, ...safeOrder } = order;
  return safeOrder;
}

function isExpiredPendingOrder(order: OrderRow) {
  if (order.status !== 'pending' || !order.expires_at) {
    return false;
  }

  const expiresAt = Date.parse(order.expires_at);

  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function markOrderFinalStatus(order: OrderRow, status: 'cancelled' | 'failed') {
  const query = new URLSearchParams({
    id: `eq.${order.id}`,
    select: 'id,meetup_id,buyer_name,amount,currency,status,provider,payment_method,provider_order_id,checkout_token,expires_at,application_id',
  });

  const rows = (await supabaseRequest(`orders?${query.toString()}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ status }),
  })) as OrderRow[];

  return rows[0];
}

async function findPaidOrderForApplication(applicationId: string | null, excludeOrderId: string) {
  if (!applicationId) {
    return null;
  }

  const query = new URLSearchParams({
    application_id: `eq.${applicationId}`,
    status: 'in.(paid,demo_paid)',
    id: `neq.${excludeOrderId}`,
    select: 'id,status',
    limit: '1',
  });
  const rows = (await supabaseRequest(`orders?${query.toString()}`)) as Array<{ id: string }>;

  return rows[0] || null;
}

async function findPaymentByKey(paymentKey: string) {
  if (!paymentKey) {
    return null;
  }

  const query = new URLSearchParams({
    provider_payment_key: `eq.${paymentKey}`,
    select: 'id,order_id,meetup_id,amount,currency,status,provider,payment_method,provider_payment_key,paid_at',
    limit: '1',
  });
  const rows = await supabaseRequest(`payments?${query.toString()}`);

  return Array.isArray(rows) ? rows[0] || null : null;
}

function getTossPaidAt(tossPayment: Record<string, unknown>) {
  const approvedAt = String(tossPayment.approvedAt || '');
  return approvedAt || new Date().toISOString();
}

async function confirmOrderAndPayment(order: OrderRow, tossPayment: Record<string, unknown>) {
  const result = await supabaseRequest('rpc/confirm_toss_payment_order', {
    method: 'POST',
    body: JSON.stringify({
      p_order_id: order.id,
      p_payment_method: getPaymentMethod(tossPayment, order),
      p_provider_payment_key: String(tossPayment.paymentKey || ''),
      p_paid_at: getTossPaidAt(tossPayment),
      p_raw_payload: tossPayment,
    }),
  });

  return result as { order?: Record<string, unknown>; payment?: Record<string, unknown> };
}

async function handleFailureResult(payload: Record<string, unknown>) {
  const { orderId, checkoutToken, code, message } = assertFailurePayload(payload);
  const order = await findTossOrder(orderId);

  if (order.checkout_token !== checkoutToken) {
    return jsonResponse({ error: '주문 확인 토큰이 일치하지 않습니다.' }, 403);
  }

  if (order.status === 'paid') {
    return jsonResponse({
      ok: true,
      ignored: true,
      order: redactOrder(order),
    });
  }

  if (order.status !== 'pending') {
    return jsonResponse({
      ok: true,
      alreadyRecorded: true,
      order: redactOrder(order),
    });
  }

  const status = getFailureStatus(code, message);
  const updatedOrder = await markOrderFinalStatus(order, status);

  return jsonResponse({
    ok: true,
    order: redactOrder(updatedOrder),
    failure: {
      code,
      message,
      status,
    },
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
    const action = String(payload.action || 'confirm');

    if (action === 'record-failure') {
      return await handleFailureResult(payload);
    }

    const { paymentKey, orderId, amount } = assertPaymentPayload(payload);
    const order = await findTossOrder(orderId);

    const amountError = await assertServerAmount(order, amount);

    if (amountError) {
      return amountError;
    }

    if (order.status === 'paid') {
      return jsonResponse({
        ok: true,
        alreadyConfirmed: true,
        order: redactOrder(order),
        payment: await findPaymentByKey(paymentKey),
      });
    }

    if (order.status !== 'pending') {
      return jsonResponse({ error: `주문 상태가 결제 승인 대상이 아닙니다: ${order.status}` }, 409);
    }

    if (isExpiredPendingOrder(order)) {
      const updatedOrder = await markOrderFinalStatus(order, 'failed');

      return jsonResponse({
        error: '결제 가능 시간이 만료되었습니다. 다시 신청해 주세요.',
        code: 'ORDER_EXPIRED',
        order: redactOrder(updatedOrder),
      }, 409);
    }

    const paidSibling = await findPaidOrderForApplication(order.application_id, order.id);

    if (paidSibling) {
      return jsonResponse({
        error: '이미 결제가 완료된 신청입니다.',
        code: 'APPLICATION_ALREADY_PAID',
      }, 409);
    }

    const tossPayment = await confirmWithToss(paymentKey, orderId, amount);
    const result = await confirmOrderAndPayment(order, tossPayment);

    await notifyApprovalPush(result.order?.application_id);

    return jsonResponse({
      ok: true,
      order: result.order || null,
      payment: result.payment || null,
    });
  } catch (error) {
    console.error(error);

    const message = error instanceof Error ? error.message : '';

    // The race loser of two concurrent confirms hits the paid-per-application
    // unique index after capture; tell the user the payment already succeeded.
    if (message.includes('orders_single_paid_per_application_idx')) {
      return jsonResponse({
        error: '이미 결제가 완료된 신청입니다.',
        code: 'APPLICATION_ALREADY_PAID',
      }, 409);
    }

    return jsonResponse(
      {
        error: message || '결제 승인 처리에 실패했습니다.',
        code: error instanceof Error ? error.name : undefined,
      },
      400,
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
