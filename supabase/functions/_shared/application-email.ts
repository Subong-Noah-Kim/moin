import { supabaseRequest } from './supabase.ts';
import { sendBrevoEmail } from './brevo-email.ts';

const HISTORY_URL = 'https://subong-noah-kim.github.io/moin/my-history.html';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildApplicationConfirmationEmail(
  { applicantName, meetupTitle }: { applicantName: string; meetupTitle: string },
) {
  const name = escapeHtml(applicantName);
  const title = escapeHtml(meetupTitle);
  const subject = `moin · ${meetupTitle} 신청이 접수되었어요`;
  const html = `
    <div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#191816">
      <h2 style="margin:0 0 12px">신청이 접수되었어요</h2>
      <p style="line-height:1.6">${name}님, <strong>${title}</strong> 신청이 정상적으로 접수되었습니다.</p>
      <p style="line-height:1.6;color:#6d6a62">운영자 검토 후 결과를 알려드릴게요. 승인되면 알림으로도 안내됩니다.</p>
      <p style="margin-top:20px">
        <a href="${HISTORY_URL}" style="display:inline-block;background:#1f6a53;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">내 신청 이력 보기</a>
      </p>
      <hr style="border:none;border-top:1px solid #ded8ca;margin:24px 0" />
      <p style="color:#9b968c;font-size:12px;line-height:1.5">이 메일은 moin 신청 확인용으로 발송되었습니다. 본인이 신청하지 않았다면 무시하셔도 됩니다.</p>
    </div>
  `;

  return { subject, html };
}

type ApplicationRow = {
  applicant_email?: unknown;
  applicant_name?: unknown;
  meetup_id?: unknown;
};

// Best-effort: a failed confirmation email must never break the application
// submission, so every error is swallowed and logged.
export async function notifyApplicationReceived(application: ApplicationRow | null | undefined) {
  try {
    const email = typeof application?.applicant_email === 'string'
      ? application.applicant_email.trim()
      : '';

    if (!email) {
      return;
    }

    const meetupId = typeof application?.meetup_id === 'string' ? application.meetup_id : '';
    let meetupTitle = '모임';

    if (meetupId) {
      const rows = (await supabaseRequest(
        `meetups?id=eq.${encodeURIComponent(meetupId)}&select=title&limit=1`,
      )) as Array<{ title?: string }>;
      meetupTitle = rows?.[0]?.title || meetupId;
    }

    const applicantName = typeof application?.applicant_name === 'string'
      ? application.applicant_name
      : '';
    const { subject, html } = buildApplicationConfirmationEmail({ applicantName, meetupTitle });

    await sendBrevoEmail({ to: email, toName: applicantName, subject, html });
  } catch (error) {
    console.error('application confirmation email failed', error);
  }
}
