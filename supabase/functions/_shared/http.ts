const allowedOrigins = new Set([
  'https://subong-noah-kim.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const defaultAllowedOrigin = 'https://subong-noah-kim.github.io';

export function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';

  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : defaultAllowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
