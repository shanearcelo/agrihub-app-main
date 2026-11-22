-- Run after supabase/migrations/20261117000000_agrihub_supabase.sql.
-- Adds public read access for active listings, verified seller profiles,
-- and currently active sponsor banners without exposing private profile data.
begin;

alter table public.profiles
  add column if not exists preferred_pickup_spot text not null default 'Main Campus Adssu',
  add column if not exists notification_preferences jsonb not null
    default '{"orders": true, "messages": true}'::jsonb,
  add column if not exists course_year text,
  add column if not exists course text,
  add column if not exists id_number text,
  add column if not exists id_verification_completed boolean not null default true,
  add column if not exists is_registered boolean not null default false;

-- Backfill existing profiles as registered if they already have department or admin role
update public.profiles
set is_registered = true
where role = 'admin' or (department is not null and btrim(department) <> '');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(coalesce(new.email, ''));
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'buyer');
  is_admin_user boolean := (normalized_email = 'admin@adssu.edu.ph');
  has_registration_data boolean := (
    new.raw_user_meta_data->>'role' is not null and
    new.raw_user_meta_data->>'department' is not null
  );
begin
  insert into public.profiles (
    id, full_name, email, institutional_email, role, department,
    avatar_url, is_verified, verification_status, id_verification_completed,
    is_registered
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    nullif(normalized_email, ''),
    nullif(normalized_email, ''),
    case
      when is_admin_user then 'admin'
      when requested_role = 'seller' then 'seller'
      else 'buyer'
    end,
    new.raw_user_meta_data->>'department',
    new.raw_user_meta_data->>'avatar_url',
    requested_role <> 'seller' or is_admin_user,
    case
      when requested_role = 'seller' and not is_admin_user then 'pending'
      else 'verified'
    end,
    is_admin_user,
    case
      when is_admin_user or has_registration_data then true
      else false
    end
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(profiles.full_name, ''), excluded.full_name),
    email = coalesce(profiles.email, excluded.email),
    institutional_email = coalesce(profiles.institutional_email, excluded.institutional_email),
    avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url);
  return new;
end;
$$;

create or replace function public.set_registration_profile(
  p_role text,
  p_full_name text,
  p_department text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_role not in ('buyer', 'seller') then raise exception 'Invalid registration role'; end if;
  if exists (select 1 from public.products where seller_id = uid)
    or exists (select 1 from public.orders where buyer_id = uid or seller_id = uid) then
    raise exception 'The account role can no longer be changed';
  end if;
  update public.profiles
  set role = p_role,
      full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
      department = nullif(btrim(p_department), ''),
      is_registered = true,
      is_verified = (p_role = 'buyer'),
      verification_status = case when p_role = 'seller' then 'pending' else 'verified' end,
      id_verification_completed = false
  where id = uid and role <> 'admin';
  if not found then raise exception 'Profile not found or role cannot be changed'; end if;
end;
$$;

drop function if exists public.submit_valid_id(text);
drop function if exists public.submit_valid_id(text, text);
drop function if exists public.submit_valid_id(text, text, text);
create or replace function public.submit_valid_id(
  p_path text,
  p_course_year text,
  p_id_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  user_role text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> uid::text then
    raise exception 'Invalid ID image path';
  end if;
  if nullif(btrim(p_course_year), '') is null then raise exception 'Program is required'; end if;
  if nullif(btrim(p_id_number), '') is null then raise exception 'School ID number is required'; end if;
  select role into user_role from public.profiles where id = uid;
  if user_role not in ('buyer', 'seller') then raise exception 'Profile not found'; end if;
  update public.profiles
  set valid_id_url = p_path,
      id_document_url = p_path,
      course = nullif(btrim(p_course_year), ''),
      course_year = nullif(btrim(p_course_year), ''),
      id_number = nullif(btrim(p_id_number), ''),
      id_verification_completed = true,
      verification_status = 'pending',
      is_verified = false,
      verified_at = null,
      verification_rejection_reason = null
  where id = uid;
end;
$$;

create or replace function public.skip_buyer_id_verification()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set id_verification_completed = true
  where id = auth.uid()
    and role = 'buyer';
  if not found then
    raise exception 'Only buyers can skip ID verification';
  end if;
end;
$$;

create or replace function public.review_seller_verification(
  p_seller_id uuid,
  p_status text,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_status not in ('verified', 'rejected') then
    raise exception 'Invalid verification status';
  end if;
  if p_status = 'verified' and not exists (
    select 1
    from public.profiles
    where id = p_seller_id
      and role = 'seller'
      and (
        nullif(btrim(id_document_url), '') is not null
        or nullif(btrim(valid_id_url), '') is not null
      )
      and nullif(btrim(coalesce(course_year, '')), '') is not null
  ) then
    raise exception 'Seller must submit a front ID and Course & Year before approval';
  end if;

  update public.profiles
  set verification_status = p_status,
      is_verified = (p_status = 'verified'),
      verified_at = case when p_status = 'verified' then now() else null end,
      verification_rejection_reason =
        case when p_status = 'rejected' then p_rejection_reason else null end
  where id = p_seller_id and role = 'seller';
  if not found then
    raise exception 'Seller profile not found';
  end if;

  insert into public.notifications(user_id, title, body, type, reference_id)
  values (
    p_seller_id,
    case
      when p_status = 'verified' then 'Seller account verified'
      else 'Seller verification update'
    end,
    case
      when p_status = 'verified'
        then 'Your seller account is now verified and can publish harvests.'
      else coalesce(p_rejection_reason, 'Your seller verification needs attention.')
    end,
    'verification',
    p_seller_id
  );
end;
$$;

create or replace function public.review_buyer_verification(
  p_buyer_id uuid,
  p_status text,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_status is null or p_status not in ('verified', 'rejected') then
    raise exception 'Invalid verification status';
  end if;
  if p_status = 'verified' and not exists (
    select 1
    from public.profiles
    where id = p_buyer_id
      and role = 'buyer'
      and (
        nullif(btrim(id_document_url), '') is not null
        or nullif(btrim(valid_id_url), '') is not null
      )
  ) then
    raise exception 'Buyer must submit a front ID before approval';
  end if;

  update public.profiles
  set verification_status = p_status,
      is_verified = (p_status = 'verified'),
      verified_at = case when p_status = 'verified' then now() else null end,
      verification_rejection_reason =
        case when p_status = 'rejected' then p_rejection_reason else null end
  where id = p_buyer_id and role = 'buyer';
  if not found then
    raise exception 'Buyer profile not found';
  end if;

  insert into public.notifications(user_id, title, body, type, reference_id)
  values (
    p_buyer_id,
    case
      when p_status = 'verified' then 'Buyer ID verified'
      else 'Buyer ID review update'
    end,
    case
      when p_status = 'verified'
        then 'Your optional student ID has been verified.'
      else coalesce(
        p_rejection_reason,
        'Your student ID was not approved. You may continue using the marketplace.'
      )
    end,
    'verification',
    p_buyer_id
  );
end;
$$;

create table if not exists public.buyer_favorites (
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (buyer_id, product_id)
);
create index if not exists buyer_favorites_product_idx
  on public.buyer_favorites(product_id);
alter table public.buyer_favorites enable row level security;
revoke all on public.buyer_favorites from anon, public;
grant select, insert, delete on public.buyer_favorites to authenticated;

create or replace function public.respect_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preferences jsonb;
begin
  select notification_preferences
  into preferences
  from public.profiles
  where id = new.user_id;

  if new.type = 'message'
    and coalesce(preferences -> 'messages', 'true'::jsonb) = 'false'::jsonb then
    return null;
  end if;
  if new.type in ('order', 'payment')
    and coalesce(preferences -> 'orders', 'true'::jsonb) = 'false'::jsonb then
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_respect_preferences on public.notifications;
create trigger notifications_respect_preferences
  before insert on public.notifications
  for each row execute function public.respect_notification_preferences();
revoke all on function public.respect_notification_preferences()
  from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sponsors enable row level security;

-- Remove inherited/public privileges, then grant back only intended reads.
revoke all on table public.profiles, public.products, public.sponsors
  from anon, public;
grant select on table public.products to anon, authenticated;
grant select (
  id,
  title,
  subtitle,
  duration_days,
  banner_color,
  image_url,
  seller_id,
  status,
  created_at,
  updated_at
) on table public.sponsors to anon;
grant select on table public.sponsors to authenticated;
grant select on table public.profiles
  to authenticated;
grant update (preferred_pickup_spot, notification_preferences, course_year, course)
  on public.profiles to authenticated;

-- Anonymous clients may read only these non-sensitive profile fields.
grant select (
  id,
  full_name,
  avatar_url,
  is_verified,
  is_sponsored,
  store_name,
  store_address,
  department,
  role,
  verification_status
) on table public.profiles to anon;

grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
  on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
  on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (
    (id = (select auth.uid()) and role in ('buyer', 'seller'))
    or public.is_admin()
  );

drop policy if exists "profiles_select_public_verified_sellers"
  on public.profiles;
create policy "profiles_select_public_verified_sellers"
  on public.profiles
  for select
  to anon, authenticated
  using (
    role = 'seller'
    and is_verified
    and verification_status = 'verified'
  );

-- The public store feed excludes sold-out listings; owners and admins can
-- still see their own listings and manage them under the existing write rules.
drop policy if exists "products_select_published_or_owner"
  on public.products;
create policy "products_select_published_or_owner"
  on public.products
  for select
  to anon, authenticated
  using (
    (status = 'published' and available_stock > 0)
    or seller_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1
      from public.buyer_favorites favorite
      where favorite.product_id = products.id
        and favorite.buyer_id = (select auth.uid())
    )
  );

drop policy if exists "buyer_favorites_select_owner" on public.buyer_favorites;
create policy "buyer_favorites_select_owner"
  on public.buyer_favorites
  for select to authenticated
  using (buyer_id = (select auth.uid()));
drop policy if exists "buyer_favorites_insert_owner" on public.buyer_favorites;
create policy "buyer_favorites_insert_owner"
  on public.buyer_favorites
  for insert to authenticated
  with check (buyer_id = (select auth.uid()));
drop policy if exists "buyer_favorites_delete_owner" on public.buyer_favorites;
create policy "buyer_favorites_delete_owner"
  on public.buyer_favorites
  for delete to authenticated
  using (buyer_id = (select auth.uid()));

-- A sponsor banner remains public only while its approval is active and its
-- duration has not elapsed since its most recent update/approval.
drop policy if exists "sponsors_select_approved_or_admin"
  on public.sponsors;
create policy "sponsors_select_approved_or_admin"
  on public.sponsors
  for select
  to anon, authenticated
  using (
    (
      status = 'approved'
      and updated_at + duration_days * interval '1 day' > now()
    )
    or public.is_admin()
  );

-- Preserve the audited admin-only sponsor mutation policies.
drop policy if exists "sponsors_insert_admin" on public.sponsors;
create policy "sponsors_insert_admin"
  on public.sponsors
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "sponsors_update_admin" on public.sponsors;
create policy "sponsors_update_admin"
  on public.sponsors
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "sponsors_delete_admin" on public.sponsors;
create policy "sponsors_delete_admin"
  on public.sponsors
  for delete
  to authenticated
  using (public.is_admin());

-- The invoker view respects the profile RLS policy and exposes no contact,
-- identity-document, or semester-payment columns.
create or replace view public.public_seller_profiles
with (security_barrier = true, security_invoker = true)
as
select
  id,
  full_name,
  avatar_url,
  is_verified,
  is_sponsored,
  store_name,
  store_address,
  department
from public.profiles
where role = 'seller'
  and is_verified
  and verification_status = 'verified';

grant select on public.public_seller_profiles to anon, authenticated;

-- Seller semester payments are the source of truth for booth-fee approval.
alter table public.seller_semester_payments
  alter column receipt_path drop not null;
alter table public.seller_semester_payments
  drop constraint if exists seller_semester_payments_amount_check;
alter table public.seller_semester_payments
  add constraint seller_semester_payments_amount_check
  check (amount in (20, 30, 50));
alter table public.seller_semester_payments enable row level security;
grant select on public.seller_semester_payments to authenticated;

drop policy if exists "seller_fee_select_owner_or_admin"
  on public.seller_semester_payments;
create policy "seller_fee_select_owner_or_admin"
  on public.seller_semester_payments
  for select to authenticated
  using (seller_id = (select auth.uid()) or public.is_admin());

create or replace function public.review_order_payment(
  p_order_id uuid,
  p_approved boolean,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
begin
  select *
  into order_row
  from public.orders
  where id = p_order_id
  for update;

  if not found
    or auth.uid() is distinct from order_row.seller_id
    or order_row.payment_method <> 'gcash'
    or order_row.payment_status <> 'pending_verification' then
    raise exception 'No pending GCash receipt exists for this seller';
  end if;

  if p_approved then
    if order_row.order_status <> 'pending' then
      raise exception 'A cancelled order cannot have its receipt approved';
    end if;
    update public.orders
    set payment_status = 'paid',
        rejection_reason = null
    where id = p_order_id;
    return;
  end if;

  if order_row.order_status not in ('pending', 'cancelled') then
    raise exception 'Only a pending or cancelled order can have its receipt rejected';
  end if;

  if order_row.order_status = 'pending' then
    update public.products as product
    set available_stock = product.available_stock + item_totals.quantity,
        reserved_stock = product.reserved_stock - item_totals.quantity,
        status = case
          when product.status = 'sold_out'
            and product.available_stock + item_totals.quantity > 0
            then 'published'
          else product.status
        end
    from (
      select product_id, sum(quantity) as quantity
      from public.order_items
      where order_id = p_order_id
        and product_id is not null
      group by product_id
    ) as item_totals
    where product.id = item_totals.product_id;
  end if;

  update public.orders
  set payment_status = 'rejected',
      rejection_reason = coalesce(
        p_rejection_reason,
        'Payment receipt rejected by the seller.'
      ),
      order_status = case
        when order_row.order_status = 'pending' then 'cancelled'
        else order_row.order_status
      end
  where id = p_order_id;
end;
$$;

revoke all on function public.review_order_payment(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.review_order_payment(uuid, boolean, text)
  to authenticated;

-- Existing installment and storage policies are restated here so this fix
-- script can also repair deployments where those policies were removed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'valid-ids',
  'valid-ids',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "valid_ids_insert_own_folder" on storage.objects;
create policy "valid_ids_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'valid-ids'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "valid_ids_read_owner_or_admin" on storage.objects;
create policy "valid_ids_read_owner_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'valid-ids'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
    )
  );
drop policy if exists "valid_ids_delete_owner_or_admin" on storage.objects;
create policy "valid_ids_delete_owner_or_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'valid-ids'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
    )
  );
drop policy if exists "payment_receipts_insert_own_folder" on storage.objects;
create policy "payment_receipts_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "payment_receipts_read_participants_or_admin"
  on storage.objects;
create policy "payment_receipts_read_participants_or_admin"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
      or exists (
        select 1 from public.orders o
        where o.gcash_receipt_url = name
          and (select auth.uid()) in (o.buyer_id, o.seller_id)
      )
      or exists (
        select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where oi.receipt_path = name
          and (select auth.uid()) in (o.buyer_id, o.seller_id)
      )
      or exists (
        select 1 from public.seller_semester_payments sp
        where sp.receipt_path = name
          and (sp.seller_id = (select auth.uid()) or public.is_admin())
      )
    )
  );

-- Move valid current-semester profile totals into the payment ledger so the
-- unified publish gate preserves fees that were approved before this fix.
insert into public.seller_semester_payments(
  seller_id, semester, amount, receipt_path, status
)
select
  p.id,
  public.current_semester_key(),
  case
    when p.semester_fee_semester = public.current_semester_key()
      and p.semester_fee_paid in (20, 30, 50)
      then p.semester_fee_paid
    else p.subscription_amount_paid
  end,
  null,
  'approved'
from public.profiles p
where p.role = 'seller'
  and (
    (
      p.semester_fee_semester = public.current_semester_key()
      and p.semester_fee_paid in (20, 30, 50)
    )
    or (
      p.subscription_semester = public.current_semester_key()
      and p.subscription_amount_paid in (20, 30, 50)
    )
  )
  and not exists (
    select 1
    from public.seller_semester_payments sp
    where sp.seller_id = p.id
      and sp.semester = public.current_semester_key()
  );

-- Both the app and the database publish gate count approved ledger rows only.
create or replace function public.submit_semester_payment(
  p_amount numeric,
  p_semester text,
  p_receipt_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  current_paid numeric := 0;
  payment_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_receipt_path is null
    or split_part(p_receipt_path, '/', 1) <> uid::text then
    raise exception 'Invalid receipt path';
  end if;
  perform 1 from public.profiles where id = uid and role = 'seller' for update;
  if not found then
    raise exception 'Seller account required';
  end if;
  if p_semester is distinct from public.current_semester_key() then
    raise exception 'Semester payment must use the current semester';
  end if;

  select coalesce(sum(amount), 0)
  into current_paid
  from public.seller_semester_payments
  where seller_id = uid
    and semester = p_semester
    and status = 'approved';

  if (current_paid = 0 and p_amount <> 30)
    or (current_paid = 20 and p_amount <> 30)
    or (current_paid = 30 and p_amount <> 20)
    or current_paid not in (0, 20, 30) then
    raise exception 'Payment amount does not match the next semester installment';
  end if;
  if current_paid >= 50 then raise exception 'Semester fee is already paid'; end if;
  if exists (
    select 1 from public.seller_semester_payments
    where seller_id = uid and semester = p_semester and status = 'pending'
  ) then
    raise exception 'A semester payment is already awaiting review';
  end if;

  insert into public.seller_semester_payments(seller_id, semester, amount, receipt_path)
  values(uid, p_semester, p_amount, p_receipt_path)
  returning id into payment_id;
  return payment_id;
end;
$$;

create or replace function public.record_semester_fee_payment(
  p_seller_id uuid,
  p_target_amount numeric,
  p_semester text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_paid numeric := 0;
  payment_delta numeric;
  payment_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_target_amount is null or p_target_amount not in (30, 50) then
    raise exception 'Manual booth fee must be recorded as ₱30 or ₱50';
  end if;
  if p_semester is distinct from public.current_semester_key() then
    raise exception 'Manual booth fee must use the current semester';
  end if;
  perform 1
  from public.profiles
  where id = p_seller_id and role = 'seller'
  for update;
  if not found then
    raise exception 'Seller account was not found';
  end if;

  select coalesce(sum(amount), 0)
  into current_paid
  from public.seller_semester_payments
  where seller_id = p_seller_id
    and semester = p_semester
    and status = 'approved';

  if current_paid not in (0, 20, 30) then
    raise exception 'Seller fee has an unexpected approved balance';
  end if;
  if exists (
    select 1 from public.seller_semester_payments
    where seller_id = p_seller_id
      and semester = p_semester
      and status = 'pending'
  ) then
    raise exception 'Review the pending receipt before recording a manual payment';
  end if;

  payment_delta := p_target_amount - current_paid;
  if payment_delta <= 0 then
    raise exception 'Seller is already paid at least the selected amount';
  end if;
  if payment_delta not in (20, 30, 50) then
    raise exception 'The selected total cannot be recorded as a valid installment';
  end if;

  insert into public.seller_semester_payments(
    seller_id, semester, amount, receipt_path, status, reviewed_by, reviewed_at
  )
  values (
    p_seller_id, p_semester, payment_delta, null, 'approved', auth.uid(), now()
  )
  returning id into payment_id;

  update public.profiles
  set semester_fee_semester = p_semester,
      semester_fee_total = 50,
      semester_fee_paid = p_target_amount,
      semester_fee_balance = 50 - p_target_amount,
      semester_fee_status = case when p_target_amount = 50 then 'paid' else 'partial' end,
      semester_payment_status = case when p_target_amount = 50 then 'paid' else 'partial' end,
      subscription_semester = p_semester,
      subscription_amount_paid = p_target_amount,
      subscription_status = case when p_target_amount = 50 then 'paid' else 'partial' end
  where id = p_seller_id;

  return payment_id;
end;
$$;

create or replace function public.review_semester_payment(
  p_payment_id uuid,
  p_approved boolean,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.seller_semester_payments%rowtype;
  next_paid numeric;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into payment_row
  from public.seller_semester_payments
  where id = p_payment_id
  for update;
  if not found or payment_row.status <> 'pending' then
    raise exception 'Payment is not pending review';
  end if;

  update public.seller_semester_payments
  set status = case when p_approved then 'approved' else 'rejected' end,
      rejection_reason = case when p_approved then null else p_rejection_reason end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_payment_id;

  if p_approved then
    select least(50, coalesce(sum(amount), 0))
    into next_paid
    from public.seller_semester_payments
    where seller_id = payment_row.seller_id
      and semester = payment_row.semester
      and status = 'approved';

    update public.profiles
    set semester_fee_semester = payment_row.semester,
        semester_fee_total = 50,
        semester_fee_paid = next_paid,
        semester_fee_balance = 50 - next_paid,
        semester_fee_status = case when next_paid >= 50 then 'paid' else 'partial' end,
        semester_payment_status = case when next_paid >= 50 then 'paid' else 'partial' end,
        semester_receipt_url = payment_row.receipt_path,
        subscription_semester = payment_row.semester,
        subscription_amount_paid = next_paid,
        subscription_status = case when next_paid >= 50 then 'paid' else 'partial' end,
        subscription_receipts = subscription_receipts || jsonb_build_array(
          jsonb_build_object(
            'amount', payment_row.amount,
            'receipt_url', payment_row.receipt_path,
            'paid_at', now(),
            'semester', payment_row.semester
          )
        )
    where id = payment_row.seller_id;
  end if;
end;
$$;

revoke all on function public.submit_semester_payment(numeric, text, text)
  from public, anon, authenticated;
revoke all on function public.handle_new_user()
  from public, anon, authenticated;
revoke all on function public.set_registration_profile(text, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_valid_id(text, text, text)
  from public, anon, authenticated;
revoke all on function public.skip_buyer_id_verification()
  from public, anon, authenticated;
revoke all on function public.review_seller_verification(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.review_buyer_verification(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.review_semester_payment(uuid, boolean, text)
  from public, anon, authenticated;
revoke all on function public.record_semester_fee_payment(uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.submit_semester_payment(numeric, text, text)
  to authenticated;
grant execute on function public.set_registration_profile(text, text, text)
  to authenticated;
grant execute on function public.submit_valid_id(text, text, text)
  to authenticated;
grant execute on function public.skip_buyer_id_verification()
  to authenticated;
grant execute on function public.place_orders(jsonb)
  to authenticated;
grant execute on function public.review_seller_verification(uuid, text, text)
  to authenticated;
grant execute on function public.review_buyer_verification(uuid, text, text)
  to authenticated;
grant execute on function public.review_semester_payment(uuid, boolean, text)
  to authenticated;
grant execute on function public.record_semester_fee_payment(uuid, numeric, text)
  to authenticated;

drop policy if exists "products_insert_verified_fee_paid_seller"
  on public.products;
create policy "products_insert_verified_fee_paid_seller"
  on public.products
  for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'seller'
        and p.verification_status = 'verified'
        and (
          status = 'draft'
          or (
            status = 'published'
            and (
              select coalesce(sum(sp.amount), 0)
              from public.seller_semester_payments sp
              where sp.seller_id = p.id
                and sp.semester = public.current_semester_key()
                and sp.status = 'approved'
            ) >= 30
          )
        )
    )
  );

drop policy if exists "products_update_owner_or_admin" on public.products;
create policy "products_update_owner_or_admin"
  on public.products
  for update to authenticated
  using (seller_id = (select auth.uid()) or public.is_admin())
  with check (
    public.is_admin()
    or (
      seller_id = (select auth.uid())
      and (
        status <> 'published'
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'seller'
            and p.verification_status = 'verified'
            and (
              select coalesce(sum(sp.amount), 0)
              from public.seller_semester_payments sp
              where sp.seller_id = p.id
                and sp.semester = public.current_semester_key()
                and sp.status = 'approved'
            ) >= 30
        )
      )
    )
  );

commit;
