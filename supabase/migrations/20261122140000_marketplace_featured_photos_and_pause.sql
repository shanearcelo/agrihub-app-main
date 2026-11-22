begin;

alter table public.products
  add column if not exists image_urls jsonb not null default '[]'::jsonb,
  add column if not exists featured_status text not null default 'none',
  add column if not exists featured_days smallint,
  add column if not exists featured_expires_at timestamptz,
  add column if not exists featured_receipt_path text,
  add column if not exists featured_reference_number text;

update public.products
set image_urls = case
  when image_url is null or btrim(image_url) = '' then '[]'::jsonb
  else jsonb_build_array(image_url)
end
where image_urls = '[]'::jsonb;

update public.products
set featured_status = 'active',
    featured_days = coalesce(featured_days, 3),
    featured_expires_at = coalesce(featured_expires_at, now() + interval '3 days')
where is_featured = true;

alter table public.products
  add constraint products_image_urls_array_check
    check (jsonb_typeof(image_urls) = 'array'),
  add constraint products_featured_status_check
    check (featured_status in ('none', 'unpaid', 'active')),
  add constraint products_featured_days_check
    check (featured_days is null or featured_days in (3, 7));

alter table public.products
  drop constraint if exists products_status_check;
alter table public.products
  add constraint products_status_check
    check (status in ('draft', 'published', 'paused', 'sold_out', 'archived'));

commit;
