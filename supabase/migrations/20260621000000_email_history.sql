-- Account-free history: applications now carry the applicant's email so a
-- magic-link session (Supabase Auth OTP) can look up its own applications and
-- orders on any device. No passwords, no profile table - the verified email in
-- the JWT is the identity.

alter table public.applications
  add column if not exists applicant_email text;

-- The new parameter would create an ambiguous overload for PostgREST, so the
-- old 4-arg version must be dropped before creating the 5-arg version. The new
-- parameter defaults to null, so the previous edge function keeps working
-- during the deploy window.
drop function if exists public.create_public_application(text, text, text, text);

create or replace function public.create_public_application(
  p_visitor_hash text,
  p_meetup_id text,
  p_applicant_name text,
  p_interest text,
  p_applicant_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups%rowtype;
  v_application public.applications%rowtype;
  v_name text := trim(coalesce(p_applicant_name, ''));
  v_interest text := trim(coalesce(p_interest, ''));
  v_email text := lower(trim(coalesce(p_applicant_email, '')));
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if char_length(v_name) not between 1 and 80 then
    raise exception 'applicant name must be between 1 and 80 characters';
  end if;

  if char_length(v_interest) not between 1 and 500 then
    raise exception 'interest must be between 1 and 500 characters';
  end if;

  if v_email <> '' then
    if char_length(v_email) not between 5 and 320
      or position('@' in v_email) < 2
      or position('@' in v_email) = char_length(v_email) then
      raise exception 'EMAIL_INVALID: applicant email is malformed';
    end if;
  end if;

  perform public.expire_stale_pending_orders(100);

  v_meetup := public.assert_meetup_can_register(p_meetup_id);

  perform public.assert_public_submission_rate_limit(
    trim(p_visitor_hash),
    'application',
    v_meetup.id,
    20,
    interval '10 minutes',
    2,
    interval '10 minutes'
  );

  insert into public.applications (
    meetup_id,
    applicant_name,
    interest,
    applicant_email,
    source,
    confirmation_token
  ) values (
    v_meetup.id,
    v_name,
    v_interest,
    nullif(v_email, ''),
    'edge-function',
    v_token
  )
  returning * into v_application;

  return jsonb_build_object('application', to_jsonb(v_application));
end;
$$;

revoke all on function public.create_public_application(text, text, text, text, text) from public;
grant execute on function public.create_public_application(text, text, text, text, text) to service_role;

-- History lookup for the verified magic-link session. Identity comes from the
-- JWT email; the payload deliberately excludes every token column.
create or replace function public.get_my_history()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_items jsonb;
begin
  if v_email = '' then
    raise exception 'EMAIL_SESSION_REQUIRED: no verified email in session';
  end if;

  select coalesce(jsonb_agg(item order by item -> 'application' ->> 'created_at' desc), '[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'application', jsonb_build_object(
        'id', a.id,
        'meetup_id', a.meetup_id,
        'meetup_title', coalesce(m.title, a.meetup_id),
        'applicant_name', a.applicant_name,
        'status', a.status,
        'created_at', a.created_at
      ),
      'orders', coalesce((
        select jsonb_agg(jsonb_build_object(
          'status', o.status,
          'amount', o.amount,
          'created_at', o.created_at
        ) order by o.created_at desc)
        from public.orders o
        where o.application_id = a.id
      ), '[]'::jsonb)
    ) as item
    from public.applications a
    left join public.meetups m on m.id = a.meetup_id
    where a.applicant_email is not null
      and lower(a.applicant_email) = v_email
  ) ranked;

  return jsonb_build_object('email', v_email, 'items', v_items);
end;
$$;

revoke all on function public.get_my_history() from public;
grant execute on function public.get_my_history() to authenticated;
