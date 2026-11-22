alter table public.profiles
  add column if not exists preferred_pickup_spot text not null default 'Main Campus Adssu',
  add column if not exists gcash_account_name text,
  add column if not exists gcash_number text,
  add column if not exists gcash_qr_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_gcash_number_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_gcash_number_check
      check (gcash_number is null or gcash_number ~ '^09[0-9]{9}$');
  end if;
end;
$$;

create or replace function public.get_seller_checkout_defaults(p_seller_ids uuid[])
returns table (
  seller_id uuid,
  gcash_account_name text,
  gcash_number text,
  gcash_qr_url text,
  preferred_pickup_spot text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.gcash_account_name,
    profile.gcash_number,
    profile.gcash_qr_url,
    profile.preferred_pickup_spot
  from public.profiles as profile
  where profile.role = 'seller'
    and profile.id = any(p_seller_ids)
$$;

revoke all on function public.get_seller_checkout_defaults(uuid[]) from public, anon;
grant execute on function public.get_seller_checkout_defaults(uuid[]) to authenticated;

create or replace function public.can_read_seller_gcash_qr(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    join public.products as product on product.seller_id = profile.id
    where profile.gcash_qr_url = p_path
      and profile.role = 'seller'
      and product.status = 'published'
      and product.accepts_gcash
  )
$$;

revoke all on function public.can_read_seller_gcash_qr(text) from public, anon;
grant execute on function public.can_read_seller_gcash_qr(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('product-images', 'product-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('gcash-qrs', 'gcash-qrs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('sponsors', 'sponsors', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('id-documents', 'id-documents', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('valid-ids', 'valid-ids', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-receipts', 'payment-receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('review-photos', 'review-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public" on storage.objects
for select to public using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "avatars_update_own_folder" on storage.objects;
create policy "avatars_update_own_folder" on storage.objects
for update to authenticated using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "product_images_select_public" on storage.objects;
create policy "product_images_select_public" on storage.objects
for select to public using (bucket_id = 'product-images');

drop policy if exists "product_images_insert_owner_folder" on storage.objects;
create policy "product_images_insert_owner_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "product_images_update_owner_folder" on storage.objects;
create policy "product_images_update_owner_folder" on storage.objects
for update to authenticated using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "gcash_qrs_insert_owner_folder" on storage.objects;
create policy "gcash_qrs_insert_owner_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'gcash-qrs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "gcash_qrs_update_owner_folder" on storage.objects;
create policy "gcash_qrs_update_owner_folder" on storage.objects
for update to authenticated using (
  bucket_id = 'gcash-qrs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'gcash-qrs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "sponsors_select_public" on storage.objects;
create policy "sponsors_select_public" on storage.objects
for select to public using (bucket_id = 'sponsors');

drop policy if exists "sponsors_insert_owner_folder" on storage.objects;
create policy "sponsors_insert_owner_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'sponsors'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "sponsors_update_owner_folder" on storage.objects;
create policy "sponsors_update_owner_folder" on storage.objects
for update to authenticated using (
  bucket_id = 'sponsors'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'sponsors'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "id_documents_insert_owner_folder" on storage.objects;
create policy "id_documents_insert_owner_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'id-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "id_documents_select_owner_or_admin" on storage.objects;
create policy "id_documents_select_owner_or_admin" on storage.objects
for select to authenticated using (
  bucket_id = 'id-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
  )
);

drop policy if exists "id_documents_update_owner_folder" on storage.objects;
create policy "id_documents_update_owner_folder" on storage.objects
for update to authenticated using (
  bucket_id = 'id-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'id-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "valid_ids_insert_own_folder" on storage.objects;
create policy "valid_ids_insert_own_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'valid-ids'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "valid_ids_update_owner_folder" on storage.objects;
create policy "valid_ids_update_owner_folder" on storage.objects
for update to authenticated using (
  bucket_id = 'valid-ids'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'valid-ids'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "payment_receipts_insert_own_folder" on storage.objects;
create policy "payment_receipts_insert_own_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "payment_receipts_update_owner_folder" on storage.objects;
create policy "payment_receipts_update_owner_folder" on storage.objects
for update to authenticated using (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "review_photos_insert_own_folder" on storage.objects;
create policy "review_photos_insert_own_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'review-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "review_photos_select_public" on storage.objects;
create policy "review_photos_select_public" on storage.objects
for select to public using (bucket_id = 'review-photos');

drop policy if exists "review_photos_update_owner_folder" on storage.objects;
create policy "review_photos_update_owner_folder" on storage.objects
for update to authenticated using (
  bucket_id = 'review-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'review-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "gcash_qrs_read_published_product_or_owner" on storage.objects;
create policy "gcash_qrs_read_published_product_or_owner" on storage.objects
for select to authenticated using (
  bucket_id = 'gcash-qrs'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
    or exists (
      select 1
      from public.products as product
      where product.gcash_qr_url = name
        and product.status = 'published'
    )
    or public.can_read_seller_gcash_qr(name)
  )
);

drop policy if exists "sponsors_select_seller_requests" on public.sponsors;
create policy "sponsors_select_seller_requests" on public.sponsors
for select to authenticated
using (seller_id = (select auth.uid()));

drop policy if exists "sponsors_insert_seller_requests" on public.sponsors;
create policy "sponsors_insert_seller_requests" on public.sponsors
for insert to authenticated
with check (
  seller_id = (select auth.uid())
  and status = 'pending'
  and amount = 0
  and exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'seller'
  )
);
