begin;

-- 1. DROP EXISTING AGRIHUB OBJECTS
-- This reset intentionally preserves auth.users and Supabase-managed objects.
-- It removes only the AgriHub-owned auth trigger, tables, functions, policies,
-- and Storage policies. Storage objects are managed through the Storage API.
-- Run the entire script so these drops happen before any tables are recreated.
drop trigger if exists on_auth_user_created on auth.users;

drop policy if exists "avatars_insert_own_folder" on storage.objects;
drop policy if exists "avatars_update_own_folder" on storage.objects;
drop policy if exists "avatars_delete_own_folder" on storage.objects;
drop policy if exists "product_images_insert_owner_folder" on storage.objects;
drop policy if exists "product_images_update_owner_folder" on storage.objects;
drop policy if exists "product_images_delete_owner_folder" on storage.objects;
drop policy if exists "valid_ids_insert_own_folder" on storage.objects;
drop policy if exists "valid_ids_read_owner_or_admin" on storage.objects;
drop policy if exists "valid_ids_delete_owner_or_admin" on storage.objects;
drop policy if exists "gcash_qrs_insert_owner_folder" on storage.objects;
drop policy if exists "gcash_qrs_read_published_product_or_owner" on storage.objects;
drop policy if exists "gcash_qrs_delete_owner_or_admin" on storage.objects;
drop policy if exists "payment_receipts_insert_own_folder" on storage.objects;
drop policy if exists "payment_receipts_read_participants_or_admin" on storage.objects;
drop policy if exists "payment_receipts_delete_owner_or_admin" on storage.objects;
drop policy if exists "review_photos_insert_own_folder" on storage.objects;

drop table if exists
  public.reviews,
  public.seller_semester_payments,
  public.notifications,
  public.messages,
  public.chats,
  public.order_items,
  public.orders,
  public.products,
  public.sponsors,
  public.profiles
cascade;

drop function if exists public.is_admin() cascade;
drop function if exists public.current_semester_key() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.prevent_client_role_escalation() cascade;
drop function if exists public.set_registration_profile(text, text, text) cascade;
drop function if exists public.submit_valid_id(text) cascade;
drop function if exists public.place_orders(jsonb) cascade;
drop function if exists public.submit_semester_payment(numeric, text, text) cascade;
drop function if exists public.review_semester_payment(uuid, boolean, text) cascade;
drop function if exists public.review_order_payment(uuid, boolean, text) cascade;
drop function if exists public.review_seller_verification(uuid, text, text) cascade;
drop function if exists public.review_buyer_verification(uuid, text, text) cascade;
drop function if exists public.set_order_status(uuid, text) cascade;
drop function if exists public.get_or_create_chat(uuid, uuid, uuid) cascade;
drop function if exists public.mark_chat_read(uuid) cascade;
drop function if exists public.on_message_created() cascade;
drop function if exists public.on_order_notification() cascade;
drop function if exists public.on_seller_payment_reviewed() cascade;

-- No AgriHub views are currently defined in the workspace.

-- 2. CREATE TABLES & RELATIONSHIPS
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  institutional_email text,
  phone_number text,
  preferred_pickup_spot text not null default 'Main Campus Adssu',
  notification_preferences jsonb not null default '{"orders": true, "messages": true}'::jsonb,
  role text not null default 'buyer' check (role in ('buyer', 'seller', 'admin')),
  avatar_url text,
  valid_id_url text,
  id_document_url text,
  is_verified boolean not null default false,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  verified_at timestamptz,
  verification_rejection_reason text,
  is_sponsored boolean not null default false,
  store_name text,
  store_address text,
  department text,
  course_year text,
  id_verification_completed boolean not null default true,
  is_registered boolean not null default false,
  semester_fee_total numeric(10,2) not null default 50 check (semester_fee_total >= 0),
  semester_fee_paid numeric(10,2) not null default 0
    check (semester_fee_paid >= 0 and semester_fee_paid <= semester_fee_total),
  semester_fee_balance numeric(10,2) not null default 50
    check (semester_fee_balance >= 0 and semester_fee_balance <= semester_fee_total),
  semester_payment_status text not null default 'unpaid'
    check (semester_payment_status in ('unpaid', 'partial', 'paid')),
  semester_fee_status text not null default 'unpaid'
    check (semester_fee_status in ('unpaid', 'partial', 'paid')),
  semester_fee_semester text,
  semester_receipt_url text,
  subscription_status text not null default 'unpaid'
    check (subscription_status in ('unpaid', 'partial', 'paid')),
  subscription_amount_paid numeric(10,2) not null default 0,
  subscription_semester text,
  subscription_receipts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_semester_fee_balance_check
    check (semester_fee_balance = semester_fee_total - semester_fee_paid),
  constraint profiles_subscription_amount_check
    check (subscription_amount_paid between 0 and 50)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text not null default '',
  category text not null,
  unit text not null default 'kg',
  listing_type text not null default 'immediate_stock'
    check (listing_type in ('immediate', 'preorder', 'immediate_stock', 'in_ground_preorder')),
  total_yield_kg numeric(12,3),
  remaining_yield_kg numeric(12,3),
  total_stock numeric(12,3) not null default 0 check (total_stock >= 0),
  available_stock numeric(12,3) not null default 0 check (available_stock >= 0),
  reserved_stock numeric(12,3) not null default 0 check (reserved_stock >= 0),
  price_per_kg numeric(12,2),
  price_per_unit numeric(12,2) not null check (price_per_unit >= 0),
  image_url text,
  accepts_gcash boolean not null default false,
  accepts_cash boolean not null default true,
  payment_methods text[] not null default array['Cash on Pick-up']::text[],
  gcash_account_name text,
  gcash_number text,
  gcash_mobile_number text,
  gcash_qr_url text,
  is_featured boolean not null default false,
  featured_fee numeric(10,2) not null default 0 check (featured_fee >= 0),
  expected_harvest text,
  available_dates jsonb not null default '[]'::jsonb,
  pickup_venues jsonb not null default '[]'::jsonb,
  pickup_times jsonb not null default '[]'::jsonb,
  seller_name text not null default '',
  seller_department text not null default '',
  status text not null default 'published'
    check (status in ('draft', 'published', 'sold_out', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_stock_bounds check (available_stock + reserved_stock <= total_stock),
  constraint products_gcash_mobile_number_check check (
    coalesce(gcash_number, gcash_mobile_number) is null
    or coalesce(gcash_number, gcash_mobile_number) ~ '^09[0-9]{9}$'
  ),
  constraint products_gcash_setup_check check (
    not accepts_gcash
    or (
      nullif(btrim(gcash_account_name), '') is not null
      and coalesce(gcash_number, gcash_mobile_number) is not null
      and nullif(btrim(gcash_qr_url), '') is not null
    )
  ),
  constraint products_pickup_arrays_check check (
    jsonb_typeof(available_dates) = 'array'
    and jsonb_typeof(pickup_venues) = 'array'
    and jsonb_typeof(pickup_times) = 'array'
  ),
  constraint products_published_pickup_availability_check check (
    status <> 'published'
    or (
      available_dates <> '[]'::jsonb
      and pickup_venues <> '[]'::jsonb
      and pickup_times <> '[]'::jsonb
    )
  )
);

create table public.buyer_favorites (
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (buyer_id, product_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  buyer_name text not null default '',
  seller_name text not null default '',
  quantity_kg numeric(12,3),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  payment_method text not null check (payment_method in ('gcash', 'cash')),
  payment_status text not null default 'unpaid',
  gcash_receipt_url text,
  payment_receipts jsonb not null default '[]'::jsonb,
  rejection_reason text,
  pickup_date date,
  pickup_venue text,
  pickup_point text,
  pickup_time text,
  pickup_time_window text,
  order_status text not null default 'pending'
    check (order_status in ('pending', 'approved', 'confirmed', 'ready_for_pickup', 'completed', 'cancelled')),
  status text generated always as (order_status) stored,
  items jsonb not null default '[]'::jsonb,
  order_type text,
  reviewed boolean not null default false,
  buyer_rating smallint check (buyer_rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_payment_status_check
    check (payment_status in ('unpaid', 'pending_verification', 'paid', 'rejected'))
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_title text not null,
  unit text not null default 'kg',
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  image_url text,
  receipt_path text,
  created_at timestamptz not null default now()
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_title text not null default '',
  buyer_name text not null default '',
  seller_name text not null default '',
  last_message text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint chats_distinct_participants check (buyer_id <> seller_id)
);

create unique index if not exists chats_order_id_unique
  on public.chats(order_id) where order_id is not null;
create unique index if not exists chats_direct_product_unique
  on public.chats(buyer_id, seller_id, product_id)
  where order_id is null and product_id is not null;
create index if not exists chats_buyer_updated_idx on public.chats(buyer_id, updated_at desc);
create index if not exists chats_seller_updated_idx on public.chats(seller_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  type text not null check (type in ('order', 'message', 'payment', 'verification', 'sponsor', 'system')),
  reference_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.seller_semester_payments (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete restrict,
  semester text not null,
  amount numeric(10,2) not null check (amount in (20, 30)),
  receipt_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text not null default '',
  duration_days integer not null default 7 check (duration_days > 0),
  amount numeric(10,2) not null default 0 check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  banner_color text,
  image_url text,
  seller_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  order_code text not null default '',
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  seller_name text not null default '',
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  comment text not null default '',
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists products_public_feed_idx
  on public.products(status, category, available_stock, is_featured, created_at desc);
create index if not exists products_seller_idx
  on public.products(seller_id, listing_type, created_at desc);
create index if not exists buyer_favorites_product_idx
  on public.buyer_favorites(product_id);
create index if not exists profiles_verification_queue_idx
  on public.profiles(role, verification_status, created_at desc);
create index if not exists orders_buyer_created_idx
  on public.orders(buyer_id, created_at desc);
create index if not exists orders_seller_created_idx
  on public.orders(seller_id, created_at desc);
create index if not exists orders_payment_review_idx
  on public.orders(payment_status, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_product_idx on public.order_items(product_id);
create index if not exists messages_chat_created_idx on public.messages(chat_id, created_at desc);
create index if not exists messages_unread_idx on public.messages(chat_id, is_read, sender_id);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, is_read);
create index if not exists semester_payments_review_idx
  on public.seller_semester_payments(status, created_at desc);
create index if not exists semester_payments_seller_semester_idx
  on public.seller_semester_payments(seller_id, semester, created_at desc);
create unique index if not exists semester_payments_one_pending_per_semester_idx
  on public.seller_semester_payments(seller_id, semester)
  where status = 'pending';
create index if not exists sponsors_status_created_idx on public.sponsors(status, created_at desc);
create index if not exists reviews_seller_created_idx on public.reviews(seller_id, created_at desc);

-- 3. TRIGGERS & FUNCTIONS
create or replace function public.current_semester_key()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when semester_month >= 8 then format('1st Sem AY %s-%s', semester_year, semester_year + 1)
    else format('2nd Sem AY %s-%s', semester_year - 1, semester_year)
  end
  from (
    select
      extract(month from timezone('Asia/Manila', now()))::integer as semester_month,
      extract(year from timezone('Asia/Manila', now()))::integer as semester_year
  ) as current_date_parts;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();
drop trigger if exists sponsors_set_updated_at on public.sponsors;
create trigger sponsors_set_updated_at before update on public.sponsors
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(coalesce(new.email, ''));
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'buyer');
begin
  insert into public.profiles (
    id, full_name, email, institutional_email, role, department,
    avatar_url, is_verified, verification_status, id_verification_completed,
    is_registered
  ) values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      ''
    ),
    nullif(normalized_email, ''),
    nullif(normalized_email, ''),
    case
      when normalized_email = 'admin@adssu.edu.ph' then 'admin'
      when requested_role = 'seller' then 'seller'
      else 'buyer'
    end,
    new.raw_user_meta_data->>'department',
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_url', ''),
      nullif(new.raw_user_meta_data->>'picture', '')
    ),
    requested_role <> 'seller' or normalized_email = 'admin@adssu.edu.ph',
    case
      when requested_role = 'seller' and normalized_email <> 'admin@adssu.edu.ph' then 'pending'
      else 'verified'
    end,
    normalized_email = 'admin@adssu.edu.ph',
    normalized_email = 'admin@adssu.edu.ph'
      or (
        requested_role in ('buyer', 'seller')
        and nullif(btrim(new.raw_user_meta_data->>'department'), '') is not null
      )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (
  id, full_name, email, institutional_email, role, department, avatar_url,
  is_verified, verification_status, id_verification_completed, is_registered
)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  nullif(lower(u.email), ''),
  nullif(lower(u.email), ''),
  case
    when lower(coalesce(u.email, '')) = 'admin@adssu.edu.ph' then 'admin'
    when u.raw_user_meta_data->>'role' = 'seller' then 'seller'
    else 'buyer'
  end,
  u.raw_user_meta_data->>'department',
  u.raw_user_meta_data->>'avatar_url',
  coalesce(u.raw_user_meta_data->>'role', 'buyer') <> 'seller'
    or lower(coalesce(u.email, '')) = 'admin@adssu.edu.ph',
  case
    when u.raw_user_meta_data->>'role' = 'seller'
      and lower(coalesce(u.email, '')) <> 'admin@adssu.edu.ph' then 'pending'
    else 'verified'
  end,
  true,
  lower(coalesce(u.email, '')) = 'admin@adssu.edu.ph'
    or nullif(btrim(u.raw_user_meta_data->>'department'), '') is not null
from auth.users u
on conflict (id) do nothing;

create or replace function public.prevent_client_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() = old.id and not public.is_admin() and new.role = 'admin' then
    raise exception 'Only an administrator can assign the admin role';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation before update of role on public.profiles
for each row execute function public.prevent_client_role_escalation();

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
      is_verified = (p_role = 'buyer'),
      verification_status = case when p_role = 'seller' then 'pending' else 'verified' end,
      id_verification_completed = false
  where id = uid and role <> 'admin';
  if not found then raise exception 'Profile not found or role cannot be changed'; end if;
end;
$$;

drop function if exists public.submit_valid_id(text);
create or replace function public.submit_valid_id(
  p_path text,
  p_course_year text
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
  select role into user_role from public.profiles where id = uid;
  if user_role not in ('buyer', 'seller') then raise exception 'Profile not found'; end if;
  if user_role = 'seller' and nullif(btrim(p_course_year), '') is null then
    raise exception 'Course and year are required for seller verification';
  end if;
  update public.profiles
  set valid_id_url = p_path,
      id_document_url = p_path,
      course_year = nullif(btrim(p_course_year), ''),
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

create or replace function public.place_orders(p_orders jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  buyer uuid := auth.uid();
  order_group jsonb;
  item jsonb;
  product_row public.products%rowtype;
  new_order_id uuid;
  new_code text;
  seller uuid;
  method text;
  subtotal numeric(12,2);
  first_product uuid;
  first_receipt text;
  receipt_list jsonb;
  snapshot_items jsonb;
  saved_orders jsonb := '[]'::jsonb;
begin
  if buyer is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_orders) <> 'array' or jsonb_array_length(p_orders) = 0 then
    raise exception 'At least one order group is required';
  end if;

  for order_group in select value from jsonb_array_elements(p_orders)
  loop
    seller := (order_group->>'seller_id')::uuid;
    method := order_group->>'payment_method';
    if method not in ('gcash', 'cash') then raise exception 'Invalid payment method'; end if;
    if nullif(btrim(order_group->>'pickup_date'), '') is null
      or nullif(btrim(coalesce(order_group->>'pickup_venue', order_group->>'pickup_point')), '') is null
      or nullif(btrim(coalesce(order_group->>'pickup_time', order_group->>'pickup_time_window')), '') is null then
      raise exception 'A pickup date, venue, and time are required';
    end if;
    if (order_group->>'pickup_date')::date < current_date then
      raise exception 'Pickup date cannot be in the past';
    end if;
    if jsonb_typeof(order_group->'items') <> 'array' or jsonb_array_length(order_group->'items') = 0 then
      raise exception 'Order group must contain items';
    end if;

    subtotal := 0;
    first_product := null;
    first_receipt := null;
    receipt_list := '[]'::jsonb;
    snapshot_items := '[]'::jsonb;
    new_order_id := gen_random_uuid();
    new_code := 'AGH-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    insert into public.orders (
      id, order_code, buyer_id, seller_id, buyer_name, seller_name,
      total_amount, payment_method, payment_status, pickup_date,
      pickup_venue, pickup_point, pickup_time, pickup_time_window,
      order_status, items
    )
    select new_order_id, new_code, buyer, seller,
      coalesce(bp.full_name, 'Campus Buyer'),
      coalesce(nullif(sp.store_name, ''), sp.full_name, 'Agri Dept - Unit 3'),
      0, method,
      case when method = 'gcash' then 'pending_verification' else 'unpaid' end,
      nullif(order_group->>'pickup_date', '')::date,
      coalesce(order_group->>'pickup_venue', order_group->>'pickup_point', ''),
      coalesce(order_group->>'pickup_point', order_group->>'pickup_venue', ''),
      coalesce(order_group->>'pickup_time', order_group->>'pickup_time_window', ''),
      coalesce(order_group->>'pickup_time_window', order_group->>'pickup_time', ''),
      'pending', '[]'::jsonb
    from public.profiles bp, public.profiles sp
    where bp.id = buyer and sp.id = seller;
    if not found then raise exception 'Buyer or seller profile not found'; end if;

    for item in select value from jsonb_array_elements(order_group->'items')
    loop
      select * into product_row
      from public.products
      where id = (item->>'product_id')::uuid
      for update;
      if not found or product_row.status <> 'published' or product_row.seller_id <> seller then
        raise exception 'A product is no longer available';
      end if;
      if (method = 'gcash' and not product_row.accepts_gcash)
        or (method = 'cash' and not product_row.accepts_cash) then
        raise exception 'The selected payment method is not accepted for this product';
      end if;
      if product_row.available_stock < (item->>'quantity')::numeric then
        raise exception 'Insufficient stock for %', product_row.title;
      end if;
      if not exists (
        select 1
        from jsonb_array_elements_text(product_row.available_dates) as available(value)
        where available.value = order_group->>'pickup_date'
      ) then
        raise exception 'The selected pickup date is not available for %', product_row.title;
      end if;
      if not exists (
        select 1
        from jsonb_array_elements_text(product_row.pickup_venues) as available(value)
        where available.value = coalesce(order_group->>'pickup_venue', order_group->>'pickup_point')
      ) then
        raise exception 'The selected pickup venue is not available for %', product_row.title;
      end if;
      if not exists (
        select 1
        from jsonb_array_elements_text(product_row.pickup_times) as available(value)
        where available.value = coalesce(order_group->>'pickup_time', order_group->>'pickup_time_window')
      ) then
        raise exception 'The selected pickup time is not available for %', product_row.title;
      end if;
      if method = 'gcash' and nullif(item->>'receipt_path', '') is null then
        raise exception 'A receipt is required for GCash orders';
      end if;
      if method = 'gcash' and split_part(item->>'receipt_path', '/', 1) <> buyer::text then
        raise exception 'Invalid receipt path';
      end if;

      subtotal := subtotal + product_row.price_per_unit * (item->>'quantity')::numeric;
      if first_product is null then first_product := product_row.id; end if;
      if first_receipt is null then first_receipt := nullif(item->>'receipt_path', ''); end if;
      if method = 'gcash' then
        receipt_list := receipt_list || jsonb_build_array(jsonb_build_object(
          'harvest_id', product_row.id,
          'title', product_row.title,
          'receipt_image_url', item->>'receipt_path'
        ));
      end if;
      snapshot_items := snapshot_items || jsonb_build_array(jsonb_build_object(
        'harvestId', product_row.id,
        'product_id', product_row.id,
        'title', product_row.title,
        'crop_name', product_row.title,
        'pricePerUnit', product_row.price_per_unit,
        'price_per_unit', product_row.price_per_unit,
        'unit', product_row.unit,
        'quantity', (item->>'quantity')::numeric,
        'sellerId', seller,
        'seller_id', seller,
        'sellerName', product_row.seller_name,
        'seller_name', product_row.seller_name,
        'imageUrl', product_row.image_url,
        'image_url', product_row.image_url,
        'receipt_path', nullif(item->>'receipt_path', '')
      ));

      insert into public.order_items (
        order_id, product_id, product_title, unit, quantity, unit_price,
        line_total, image_url, receipt_path
      ) values (
        new_order_id, product_row.id, product_row.title, product_row.unit,
        (item->>'quantity')::numeric, product_row.price_per_unit,
        product_row.price_per_unit * (item->>'quantity')::numeric,
        product_row.image_url, nullif(item->>'receipt_path', '')
      );

      update public.products
      set available_stock = available_stock - (item->>'quantity')::numeric,
          reserved_stock = reserved_stock + (item->>'quantity')::numeric,
          status = case when available_stock - (item->>'quantity')::numeric = 0 then 'sold_out' else status end
      where id = product_row.id;
    end loop;

    update public.orders
    set product_id = first_product,
        total_amount = subtotal,
        gcash_receipt_url = first_receipt,
        payment_receipts = receipt_list,
        items = snapshot_items
    where id = new_order_id;

    saved_orders := saved_orders || jsonb_build_array(jsonb_build_object(
      'id', new_order_id, 'order_code', new_code
    ));
  end loop;
  return saved_orders;
end;
$$;

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
  if split_part(p_receipt_path, '/', 1) <> uid::text then raise exception 'Invalid receipt path'; end if;
  if not exists (select 1 from public.profiles where id = uid and role = 'seller') then
    raise exception 'Seller account required';
  end if;

  if p_semester is distinct from public.current_semester_key() then
    raise exception 'Semester payment must use the current semester';
  end if;

  select case when semester_fee_semester = p_semester then semester_fee_paid else 0 end
  into current_paid from public.profiles where id = uid for update;
  if (current_paid = 0 and p_amount <> 30) or (current_paid >= 30 and current_paid < 50 and p_amount <> 20) then
    raise exception 'Payment amount does not match the next semester installment';
  end if;
  if current_paid >= 50 then raise exception 'Semester fee is already paid'; end if;
  if exists (
    select 1 from public.seller_semester_payments
    where seller_id = uid and semester = p_semester and status = 'pending'
  ) then raise exception 'A semester payment is already awaiting review'; end if;

  insert into public.seller_semester_payments(seller_id, semester, amount, receipt_path)
  values(uid, p_semester, p_amount, p_receipt_path)
  returning id into payment_id;
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
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into payment_row from public.seller_semester_payments
  where id = p_payment_id for update;
  if not found or payment_row.status <> 'pending' then raise exception 'Payment is not pending review'; end if;

  update public.seller_semester_payments
  set status = case when p_approved then 'approved' else 'rejected' end,
      rejection_reason = case when p_approved then null else p_rejection_reason end,
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_payment_id;

  if p_approved then
    update public.profiles
    set semester_fee_semester = payment_row.semester,
        semester_fee_total = 50,
        semester_fee_paid = least(
          50,
          (case when semester_fee_semester = payment_row.semester then semester_fee_paid else 0 end) + payment_row.amount
        ),
        semester_fee_balance = greatest(
          0,
          50 - ((case when semester_fee_semester = payment_row.semester then semester_fee_paid else 0 end) + payment_row.amount)
        ),
        semester_fee_status = case
          when ((case when semester_fee_semester = payment_row.semester then semester_fee_paid else 0 end) + payment_row.amount) >= 50 then 'paid'
          else 'partial'
        end,
        semester_payment_status = case
          when ((case when semester_fee_semester = payment_row.semester then semester_fee_paid else 0 end) + payment_row.amount) >= 50 then 'paid'
          else 'partial'
        end,
        semester_receipt_url = payment_row.receipt_path,
        subscription_semester = payment_row.semester,
        subscription_amount_paid = least(
          50,
          (case when semester_fee_semester = payment_row.semester then semester_fee_paid else 0 end) + payment_row.amount
        ),
        subscription_status = case
          when ((case when semester_fee_semester = payment_row.semester then semester_fee_paid else 0 end) + payment_row.amount) >= 50 then 'paid'
          else 'partial'
        end,
        subscription_receipts = subscription_receipts || jsonb_build_array(jsonb_build_object(
          'amount', payment_row.amount,
          'receipt_url', payment_row.receipt_path,
          'paid_at', now(),
          'semester', payment_row.semester
        ))
    where id = payment_row.seller_id;
  end if;
end;
$$;

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
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('verified', 'rejected') then raise exception 'Invalid verification status'; end if;
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
      verification_rejection_reason = case when p_status = 'rejected' then p_rejection_reason else null end
  where id = p_seller_id and role = 'seller';
  if not found then raise exception 'Seller profile not found'; end if;
  insert into public.notifications(user_id, title, body, type, reference_id)
  values(
    p_seller_id,
    case when p_status = 'verified' then 'Seller account verified' else 'Seller verification update' end,
    case when p_status = 'verified' then 'Your seller account is now verified and can publish harvests.' else coalesce(p_rejection_reason, 'Your seller verification needs attention.') end,
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
      verification_rejection_reason = case when p_status = 'rejected' then p_rejection_reason else null end
  where id = p_buyer_id and role = 'buyer';
  if not found then raise exception 'Buyer profile not found'; end if;

  insert into public.notifications(user_id, title, body, type, reference_id)
  values(
    p_buyer_id,
    case when p_status = 'verified' then 'Buyer ID verified' else 'Buyer ID review update' end,
    case when p_status = 'verified' then 'Your optional student ID has been verified.' else coalesce(p_rejection_reason, 'Your student ID was not approved. You may continue using the marketplace.') end,
    'verification',
    p_buyer_id
  );
end;
$$;

create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
begin
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if auth.uid() = order_row.seller_id and p_status in ('approved', 'confirmed', 'ready_for_pickup', 'completed') then
    if order_row.payment_method = 'gcash' and order_row.payment_status <> 'paid' then
      raise exception 'GCash payment must be approved before this order can be fulfilled';
    end if;
    update public.orders set order_status = p_status where id = p_order_id;
  elsif auth.uid() = order_row.buyer_id and p_status = 'cancelled' and order_row.order_status = 'pending' then
    update public.orders set order_status = p_status where id = p_order_id;
  else
    raise exception 'You cannot make this order status change';
  end if;
end;
$$;

create or replace function public.get_or_create_chat(
  p_order_id uuid default null,
  p_product_id uuid default null,
  p_seller_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  buyer uuid;
  seller uuid;
  product uuid;
  title text := '';
  buyer_display text := '';
  seller_display text := '';
  chat_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_order_id is not null then
    select o.buyer_id, o.seller_id, o.product_id, o.buyer_name, o.seller_name
    into buyer, seller, product, buyer_display, seller_display
    from public.orders o where o.id = p_order_id;
    if buyer is null or uid not in (buyer, seller) then raise exception 'Order chat access denied'; end if;
  else
    select pr.seller_id, pr.title into seller, title
    from public.products pr
    where pr.id = p_product_id and pr.status = 'published';
    if seller is null or seller <> p_seller_id or seller = uid then
      raise exception 'Product chat is not available';
    end if;
    buyer := uid;
    product := p_product_id;
  end if;

  if product is not null and title = '' then
    select pr.title into title from public.products pr where pr.id = product;
  end if;
  if buyer_display = '' then
    select p.full_name into buyer_display from public.profiles p where p.id = buyer;
  end if;
  if seller_display = '' then
    select coalesce(nullif(p.store_name, ''), p.full_name)
    into seller_display from public.profiles p where p.id = seller;
  end if;

  if p_order_id is not null then
    insert into public.chats(order_id, buyer_id, seller_id, product_id, product_title, buyer_name, seller_name)
    values(p_order_id, buyer, seller, product, coalesce(title, ''), coalesce(buyer_display, ''), coalesce(seller_display, ''))
    on conflict (order_id) where order_id is not null
    do update set updated_at = chats.updated_at
    returning id into chat_id;
  else
    insert into public.chats(buyer_id, seller_id, product_id, product_title, buyer_name, seller_name)
    values(buyer, seller, product, coalesce(title, ''), coalesce(buyer_display, ''), coalesce(seller_display, ''))
    on conflict (buyer_id, seller_id, product_id)
      where order_id is null and product_id is not null
    do update set updated_at = chats.updated_at
    returning id into chat_id;
  end if;
  return chat_id;
end;
$$;

create or replace function public.mark_chat_read(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.chats c
    where c.id = p_chat_id and auth.uid() in (c.buyer_id, c.seller_id)
  ) then raise exception 'Chat access denied'; end if;
  update public.messages
  set is_read = true
  where chat_id = p_chat_id and sender_id <> auth.uid() and is_read = false;
end;
$$;

create or replace function public.on_message_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chat_row public.chats%rowtype;
  recipient uuid;
  preferences jsonb;
begin
  select * into chat_row from public.chats where id = new.chat_id;
  update public.chats
  set last_message = new.content, updated_at = new.created_at
  where id = new.chat_id;
  recipient := case when new.sender_id = chat_row.buyer_id then chat_row.seller_id else chat_row.buyer_id end;
  select notification_preferences into preferences
  from public.profiles
  where id = recipient;
  if coalesce(preferences -> 'messages', 'true'::jsonb) <> 'false'::jsonb then
    insert into public.notifications(user_id, title, body, type, reference_id)
    values(recipient, 'New message', left(new.content, 180), 'message', new.chat_id);
  end if;
  return new;
end;
$$;
drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert after insert on public.messages
for each row execute function public.on_message_created();

create or replace function public.on_order_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  preferences jsonb;
begin
  if tg_op = 'INSERT' then
    recipient := new.seller_id;
    select notification_preferences into preferences
    from public.profiles
    where id = recipient;
    if coalesce(preferences -> 'orders', 'true'::jsonb) <> 'false'::jsonb then
      insert into public.notifications(user_id, title, body, type, reference_id)
      values(recipient, 'New order received', 'Order #' || new.order_code || ' was placed.', 'order', new.id);
    end if;
    if new.payment_status = 'pending_verification' then
      if coalesce(preferences -> 'orders', 'true'::jsonb) <> 'false'::jsonb then
        insert into public.notifications(user_id, title, body, type, reference_id)
        values(recipient, 'GCash receipt submitted', 'Review the buyer payment receipt.', 'payment', new.id);
      end if;
    end if;
  elsif new.order_status is distinct from old.order_status then
    recipient := new.buyer_id;
    select notification_preferences into preferences
    from public.profiles
    where id = recipient;
    if coalesce(preferences -> 'orders', 'true'::jsonb) <> 'false'::jsonb then
      insert into public.notifications(user_id, title, body, type, reference_id)
      values(recipient, 'Order status updated', 'Order #' || new.order_code || ' is now ' || replace(new.order_status, '_', ' ') || '.', 'order', new.id);
    end if;
  elsif new.payment_status is distinct from old.payment_status then
    recipient := new.buyer_id;
    select notification_preferences into preferences
    from public.profiles
    where id = recipient;
    if coalesce(preferences -> 'orders', 'true'::jsonb) <> 'false'::jsonb then
      insert into public.notifications(user_id, title, body, type, reference_id)
      values(recipient, 'Payment receipt reviewed', 'Your order payment is ' || replace(new.payment_status, '_', ' ') || '.', 'payment', new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_notifications_after_insert on public.orders;
create trigger orders_notifications_after_insert after insert on public.orders
for each row execute function public.on_order_notification();
drop trigger if exists orders_notifications_after_update on public.orders;
create trigger orders_notifications_after_update after update of order_status, payment_status on public.orders
for each row execute function public.on_order_notification();

create or replace function public.on_seller_payment_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preferences jsonb;
begin
  if new.status is distinct from old.status then
    select notification_preferences into preferences
    from public.profiles
    where id = new.seller_id;
    if coalesce(preferences -> 'orders', 'true'::jsonb) <> 'false'::jsonb then
      insert into public.notifications(user_id, title, body, type, reference_id)
      values(
        new.seller_id,
        case when new.status = 'approved' then 'Semester payment approved' else 'Semester payment needs attention' end,
        case when new.status = 'approved' then 'Your ₱' || new.amount || ' installment was approved.' else coalesce(new.rejection_reason, 'Please review and resubmit your receipt.') end,
        'payment',
        new.id
      );
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists semester_payment_notification_after_update on public.seller_semester_payments;
create trigger semester_payment_notification_after_update after update of status on public.seller_semester_payments
for each row execute function public.on_seller_payment_reviewed();

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

-- 4. ROW LEVEL SECURITY POLICIES
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.buyer_favorites enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.seller_semester_payments enable row level security;
alter table public.sponsors enable row level security;
alter table public.reviews enable row level security;

-- Sensitive order, fee, chat, and notification writes are restricted to
-- authenticated RPCs or database triggers; no broad client write policies.
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
for select to authenticated using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
for update to authenticated using (id = (select auth.uid()) or public.is_admin())
with check ((id = (select auth.uid()) and role in ('buyer', 'seller')) or public.is_admin());

drop policy if exists "products_select_published_or_owner" on public.products;
create policy "products_select_published_or_owner" on public.products
for select using (
  status = 'published'
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
create policy "buyer_favorites_select_owner" on public.buyer_favorites
for select to authenticated using (buyer_id = (select auth.uid()));
drop policy if exists "buyer_favorites_insert_owner" on public.buyer_favorites;
create policy "buyer_favorites_insert_owner" on public.buyer_favorites
for insert to authenticated with check (buyer_id = (select auth.uid()));
drop policy if exists "buyer_favorites_delete_owner" on public.buyer_favorites;
create policy "buyer_favorites_delete_owner" on public.buyer_favorites
for delete to authenticated using (buyer_id = (select auth.uid()));
drop policy if exists "products_insert_verified_fee_paid_seller" on public.products;
create policy "products_insert_verified_fee_paid_seller" on public.products
for insert to authenticated with check (
  seller_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'seller'
      and p.verification_status = 'verified'
    and (
    status = 'draft'
    or (
      (p.semester_fee_semester = public.current_semester_key() and p.semester_fee_paid >= 30)
      or (p.subscription_semester = public.current_semester_key() and p.subscription_amount_paid >= 30)
    )
    )
  )
);
drop policy if exists "products_update_owner_or_admin" on public.products;
create policy "products_update_owner_or_admin" on public.products
for update to authenticated using (seller_id = (select auth.uid()) or public.is_admin())
with check (seller_id = (select auth.uid()) or public.is_admin());
drop policy if exists "products_delete_owner_or_admin" on public.products;
create policy "products_delete_owner_or_admin" on public.products
for delete to authenticated using (seller_id = (select auth.uid()) or public.is_admin());

drop policy if exists "orders_select_participants_or_admin" on public.orders;
create policy "orders_select_participants_or_admin" on public.orders
for select to authenticated using (
  buyer_id = (select auth.uid()) or seller_id = (select auth.uid()) or public.is_admin()
);
drop policy if exists "orders_update_review_by_buyer" on public.orders;
create policy "orders_update_review_by_buyer" on public.orders
for update to authenticated using (
  buyer_id = (select auth.uid()) and order_status = 'completed'
) with check (
  buyer_id = (select auth.uid()) and order_status = 'completed'
);
drop policy if exists "order_items_select_participants_or_admin" on public.order_items;
create policy "order_items_select_participants_or_admin" on public.order_items
for select to authenticated using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and ((select auth.uid()) in (o.buyer_id, o.seller_id) or public.is_admin())
  )
);

drop policy if exists "chats_select_participants" on public.chats;
create policy "chats_select_participants" on public.chats
for select to authenticated using ((select auth.uid()) in (buyer_id, seller_id));
drop policy if exists "messages_select_chat_participant" on public.messages;
create policy "messages_select_chat_participant" on public.messages
for select to authenticated using (
  exists (select 1 from public.chats c where c.id = chat_id and (select auth.uid()) in (c.buyer_id, c.seller_id))
);
drop policy if exists "messages_insert_as_chat_participant" on public.messages;
create policy "messages_insert_as_chat_participant" on public.messages
for insert to authenticated with check (
  sender_id = (select auth.uid())
  and exists (select 1 from public.chats c where c.id = chat_id and (select auth.uid()) in (c.buyer_id, c.seller_id))
);
drop policy if exists "messages_mark_received_as_read" on public.messages;
create policy "messages_mark_received_as_read" on public.messages
for update to authenticated using (
  sender_id <> (select auth.uid())
  and exists (select 1 from public.chats c where c.id = chat_id and (select auth.uid()) in (c.buyer_id, c.seller_id))
) with check (
  sender_id <> (select auth.uid())
  and exists (select 1 from public.chats c where c.id = chat_id and (select auth.uid()) in (c.buyer_id, c.seller_id))
);

drop policy if exists "notifications_select_owner_or_admin" on public.notifications;
create policy "notifications_select_owner_or_admin" on public.notifications
for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists "notifications_update_owner_read_state" on public.notifications;
create policy "notifications_update_owner_read_state" on public.notifications
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "seller_fee_select_owner_or_admin" on public.seller_semester_payments;
create policy "seller_fee_select_owner_or_admin" on public.seller_semester_payments
for select to authenticated using (seller_id = (select auth.uid()) or public.is_admin());

drop policy if exists "sponsors_select_approved_or_admin" on public.sponsors;
create policy "sponsors_select_approved_or_admin" on public.sponsors
for select using (status = 'approved' or public.is_admin());
drop policy if exists "sponsors_insert_admin" on public.sponsors;
create policy "sponsors_insert_admin" on public.sponsors
for insert to authenticated with check (public.is_admin());
drop policy if exists "sponsors_update_admin" on public.sponsors;
create policy "sponsors_update_admin" on public.sponsors
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "sponsors_delete_admin" on public.sponsors;
create policy "sponsors_delete_admin" on public.sponsors
for delete to authenticated using (public.is_admin());

drop policy if exists "reviews_select_authenticated" on public.reviews;
create policy "reviews_select_authenticated" on public.reviews
for select to authenticated using (true);
drop policy if exists "reviews_insert_completed_order_buyer" on public.reviews;
create policy "reviews_insert_completed_order_buyer" on public.reviews
for insert to authenticated with check (
  buyer_id = (select auth.uid())
  and exists (
    select 1 from public.orders o
    where o.id = order_id and o.buyer_id = (select auth.uid())
      and o.seller_id = reviews.seller_id and o.order_status = 'completed'
  )
);
drop policy if exists "reviews_update_admin" on public.reviews;
create policy "reviews_update_admin" on public.reviews
for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.profiles, public.products, public.orders, public.order_items,
  public.buyer_favorites, public.chats, public.messages, public.notifications, public.seller_semester_payments,
  public.sponsors, public.reviews from anon, authenticated;
grant select on public.profiles, public.products, public.orders, public.order_items,
  public.chats, public.messages, public.notifications, public.seller_semester_payments,
  public.sponsors, public.reviews to authenticated;
grant select, insert, delete on public.buyer_favorites to authenticated;
-- Anonymous browsing is limited by the published-product and approved-sponsor RLS policies.
grant select on public.products, public.sponsors to anon;
grant update (
  full_name,
  phone_number,
  avatar_url,
  store_name,
  store_address,
  department,
  course_year,
  preferred_pickup_spot,
  notification_preferences
)
  on public.profiles to authenticated;
grant insert, update, delete on public.products to authenticated;
grant insert on public.messages to authenticated;
grant update (is_read) on public.messages to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant insert, update, delete on public.sponsors to authenticated;
grant insert on public.reviews to authenticated;
grant update (reviewed, buyer_rating) on public.orders to authenticated;

revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.current_semester_key() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.prevent_client_role_escalation() from public, anon, authenticated;
revoke all on function public.on_message_created() from public, anon, authenticated;
revoke all on function public.on_order_notification() from public, anon, authenticated;
revoke all on function public.on_seller_payment_reviewed() from public, anon, authenticated;
revoke all on function public.respect_notification_preferences() from public, anon, authenticated;
revoke all on function public.set_registration_profile(text, text, text) from public, anon, authenticated;
revoke all on function public.submit_valid_id(text, text) from public, anon, authenticated;
revoke all on function public.skip_buyer_id_verification() from public, anon, authenticated;
revoke all on function public.place_orders(jsonb) from public, anon, authenticated;
revoke all on function public.submit_semester_payment(numeric, text, text) from public, anon, authenticated;
revoke all on function public.review_semester_payment(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.review_order_payment(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.review_seller_verification(uuid, text, text) from public, anon, authenticated;
revoke all on function public.review_buyer_verification(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_order_status(uuid, text) from public, anon, authenticated;
revoke all on function public.get_or_create_chat(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_chat_read(uuid) from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.current_semester_key() to authenticated;
grant execute on function public.place_orders(jsonb) to authenticated;
grant execute on function public.set_registration_profile(text, text, text) to authenticated;
grant execute on function public.submit_valid_id(text, text) to authenticated;
grant execute on function public.skip_buyer_id_verification() to authenticated;
grant execute on function public.submit_semester_payment(numeric, text, text) to authenticated;
grant execute on function public.review_semester_payment(uuid, boolean, text) to authenticated;
grant execute on function public.review_order_payment(uuid, boolean, text) to authenticated;
grant execute on function public.review_seller_verification(uuid, text, text) to authenticated;
grant execute on function public.review_buyer_verification(uuid, text, text) to authenticated;
grant execute on function public.set_order_status(uuid, text) to authenticated;
grant execute on function public.get_or_create_chat(uuid, uuid, uuid) to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;

-- 5. SUPABASE STORAGE BUCKETS & POLICIES
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('valid-ids', 'valid-ids', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('product-images', 'product-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('gcash-qrs', 'gcash-qrs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-receipts', 'payment-receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('review-photos', 'review-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "avatars_update_own_folder" on storage.objects;
create policy "avatars_update_own_folder" on storage.objects
for update to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "avatars_delete_own_folder" on storage.objects;
create policy "avatars_delete_own_folder" on storage.objects
for delete to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "product_images_insert_owner_folder" on storage.objects;
create policy "product_images_insert_owner_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "product_images_update_owner_folder" on storage.objects;
create policy "product_images_update_owner_folder" on storage.objects
for update to authenticated using (
  bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "product_images_delete_owner_folder" on storage.objects;
create policy "product_images_delete_owner_folder" on storage.objects
for delete to authenticated using (
  bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "valid_ids_insert_own_folder" on storage.objects;
create policy "valid_ids_insert_own_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'valid-ids' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "valid_ids_read_owner_or_admin" on storage.objects;
create policy "valid_ids_read_owner_or_admin" on storage.objects
for select to authenticated using (
  bucket_id = 'valid-ids'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
);
drop policy if exists "valid_ids_delete_owner_or_admin" on storage.objects;
create policy "valid_ids_delete_owner_or_admin" on storage.objects
for delete to authenticated using (
  bucket_id = 'valid-ids'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
);

drop policy if exists "gcash_qrs_insert_owner_folder" on storage.objects;
create policy "gcash_qrs_insert_owner_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'gcash-qrs' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "gcash_qrs_read_published_product_or_owner" on storage.objects;
create policy "gcash_qrs_read_published_product_or_owner" on storage.objects
for select to authenticated using (
  bucket_id = 'gcash-qrs'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
    or exists (
      select 1 from public.products p
      where p.gcash_qr_url = name and p.status = 'published'
    )
  )
);
drop policy if exists "gcash_qrs_delete_owner_or_admin" on storage.objects;
create policy "gcash_qrs_delete_owner_or_admin" on storage.objects
for delete to authenticated using (
  bucket_id = 'gcash-qrs'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
);

drop policy if exists "payment_receipts_insert_own_folder" on storage.objects;
create policy "payment_receipts_insert_own_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "payment_receipts_read_participants_or_admin" on storage.objects;
create policy "payment_receipts_read_participants_or_admin" on storage.objects
for select to authenticated using (
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
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.receipt_path = name
        and (select auth.uid()) in (o.buyer_id, o.seller_id)
    )
    or exists (
      select 1 from public.seller_semester_payments sp
      where sp.receipt_path = name and sp.seller_id = (select auth.uid())
    )
    or exists (
      select 1 from public.seller_semester_payments sp
      where sp.receipt_path = name and public.is_admin()
    )
  )
);
drop policy if exists "payment_receipts_delete_owner_or_admin" on storage.objects;
create policy "payment_receipts_delete_owner_or_admin" on storage.objects
for delete to authenticated using (
  bucket_id = 'payment-receipts'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
);

drop policy if exists "review_photos_insert_own_folder" on storage.objects;
create policy "review_photos_insert_own_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- 6. ENABLE REALTIME
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chats') then
    alter publication supabase_realtime add table public.chats;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seller_semester_payments') then
    alter publication supabase_realtime add table public.seller_semester_payments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;

commit;
