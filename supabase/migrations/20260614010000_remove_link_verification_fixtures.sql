-- One-off data cleanup: remove the two live-verification fixtures created
-- while rolling out the application-order link feature (applicant names
-- 연동검증 and 잠금검증, 2026-06-12). Ids are exact, so this migration is
-- a no-op on any database that does not contain these fixture rows.

delete from public.orders
where id in (
  'a21262cf-f61e-472c-9324-45f8204a25fd',
  'cdf5318e-523d-4daa-83f0-7c05f8167283'
);

delete from public.applications
where id in (
  '56080439-091e-4819-b2ef-b758580e4814',
  '82e03c8d-93bc-46cf-b1fa-d181c98de55b'
);
