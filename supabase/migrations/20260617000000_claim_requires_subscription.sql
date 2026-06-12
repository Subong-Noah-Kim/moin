-- claim_approval_push used to set approval_notified_at as soon as an accepted
-- application was claimed, even when it had zero push subscriptions. Approving
-- before the applicant opted in burned the one-shot claim, so a later opt-in
-- could never be notified. Only consume the claim when there is something to send.

create or replace function public.claim_approval_push(
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
  set approval_notified_at = now()
  where a.id = p_application_id
    and a.status = 'accepted'
    and a.approval_notified_at is null
    and exists (
      select 1
      from public.push_subscriptions s
      where s.application_id = a.id
    )
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
    'meetup_title', coalesce(v_meetup_title, '모임'),
    'subscriptions', v_subscriptions
  );
end;
$$;

revoke all on function public.claim_approval_push(uuid) from public;
grant execute on function public.claim_approval_push(uuid) to service_role;
