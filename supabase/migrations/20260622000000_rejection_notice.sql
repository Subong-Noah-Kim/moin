-- Applicants used to hear nothing when not selected. claim_rejection_notice
-- mirrors claim_approval_push but for the 'rejected' status, and — unlike the
-- approval claim — it does NOT require a push subscription, because the email
-- still goes out. The one-shot rejection_notified_at flag keeps it idempotent.

alter table public.applications
  add column if not exists rejection_notified_at timestamptz;

create or replace function public.claim_rejection_notice(
  p_application_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications%rowtype;
  v_meetup_title text;
  v_subscriptions jsonb;
begin
  update public.applications a
  set rejection_notified_at = now()
  where a.id = p_application_id
    and a.status = 'rejected'
    and a.rejection_notified_at is null
  returning * into v_application;

  if v_application.id is null then
    return jsonb_build_object('claimed', false, 'subscriptions', '[]'::jsonb);
  end if;

  select title into v_meetup_title
  from public.meetups
  where id = v_application.meetup_id;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', s.id,
      'endpoint', s.endpoint,
      'p256dh', s.p256dh,
      'auth', s.auth
    )),
    '[]'::jsonb
  ) into v_subscriptions
  from public.push_subscriptions s
  where s.application_id = v_application.id;

  return jsonb_build_object(
    'claimed', true,
    'applicant_email', v_application.applicant_email,
    'applicant_name', v_application.applicant_name,
    'meetup_title', coalesce(v_meetup_title, '모임'),
    'subscriptions', v_subscriptions
  );
end;
$$;

revoke all on function public.claim_rejection_notice(uuid) from public;
grant execute on function public.claim_rejection_notice(uuid) to service_role;
