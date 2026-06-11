-- Rate limit windows are at most 10 minutes, so attempt rows older than an
-- hour can never influence a decision. Shorten the opportunistic cleanup
-- from one day to one hour to keep the attempts table small.

create or replace function public.assert_public_submission_rate_limit(
  p_visitor_hash text,
  p_action text,
  p_meetup_id text,
  p_global_limit integer,
  p_global_window interval,
  p_action_limit integer,
  p_action_window interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_global_count integer;
  v_action_count integer;
begin
  if p_visitor_hash is null or char_length(trim(p_visitor_hash)) < 32 then
    raise exception 'visitor hash is required';
  end if;

  if p_action not in ('application', 'toss_order', 'demo_order') then
    raise exception 'unsupported public submission action';
  end if;

  delete from public.public_submission_attempts
  where created_at < now() - interval '1 hour';

  select count(*)
  into v_global_count
  from public.public_submission_attempts
  where visitor_hash = p_visitor_hash
    and created_at >= now() - p_global_window;

  if v_global_count >= p_global_limit then
    raise exception 'PUBLIC_SUBMISSION_RATE_LIMITED';
  end if;

  select count(*)
  into v_action_count
  from public.public_submission_attempts
  where visitor_hash = p_visitor_hash
    and action = p_action
    and meetup_id is not distinct from p_meetup_id
    and created_at >= now() - p_action_window;

  if v_action_count >= p_action_limit then
    raise exception 'PUBLIC_SUBMISSION_RATE_LIMITED';
  end if;

  insert into public.public_submission_attempts (
    visitor_hash,
    action,
    meetup_id
  ) values (
    p_visitor_hash,
    p_action,
    p_meetup_id
  );
end;
$$;

revoke all on function public.assert_public_submission_rate_limit(text, text, text, integer, interval, integer, interval) from public;
grant execute on function public.assert_public_submission_rate_limit(text, text, text, integer, interval, integer, interval) to service_role;
