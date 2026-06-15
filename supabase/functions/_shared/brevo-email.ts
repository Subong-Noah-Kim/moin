// Transactional email transport via Brevo's HTTP API. The HTTP API avoids the
// SMTP IP-allowlist (525) restriction entirely and is more robust from an edge
// function than opening a raw SMTP connection. Sends are best-effort: callers
// must never fail because an email could not be delivered.

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

type BrevoEmail = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
};

export async function sendBrevoEmail({ to, toName, subject, html }: BrevoEmail) {
  const apiKey = Deno.env.get('BREVO_API_KEY');

  if (!apiKey) {
    console.error('BREVO_API_KEY is not configured; skipping email send.');
    return { skipped: true };
  }

  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') || 'soobong1217@gmail.com';
  const senderName = Deno.env.get('BREVO_SENDER_NAME') || 'moin';

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('Brevo email send failed', response.status, body);
      return { ok: false, status: response.status };
    }

    return { ok: true };
  } catch (error) {
    console.error('Brevo email send threw', error);
    return { ok: false };
  }
}
