insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meetup-images',
  'meetup-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can read meetup images" on storage.objects;
create policy "public can read meetup images"
on storage.objects
for select
to public
using (bucket_id = 'meetup-images');

drop policy if exists "admins can upload meetup images" on storage.objects;
create policy "admins can upload meetup images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meetup-images'
  and public.is_admin()
);

drop policy if exists "admins can update meetup images" on storage.objects;
create policy "admins can update meetup images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'meetup-images'
  and public.is_admin()
)
with check (
  bucket_id = 'meetup-images'
  and public.is_admin()
);
