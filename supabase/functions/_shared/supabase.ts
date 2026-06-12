export function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export async function readJson(response: Response) {
  const bodyText = await response.text();

  try {
    return bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return bodyText;
  }
}

export async function supabaseRequest(path: string, options: RequestInit = {}) {
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
