begin;

alter table public.profiles
  add column if not exists is_suspended boolean not null default false;

alter table public.products
  drop constraint if exists products_status_check;

alter table public.products
  add constraint products_status_check
  check (status in ('draft', 'published', 'hidden', 'paused', 'sold_out', 'archived'));

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.seller_semester_payments enable row level security;

drop policy if exists "admin_select_profiles" on public.profiles;
create policy "admin_select_profiles" on public.profiles
  for select to authenticated using (public.is_admin());
drop policy if exists "admin_update_profiles" on public.profiles;
create policy "admin_update_profiles" on public.profiles
  for update to authenticated using (public.is_admin())
  with check (public.is_admin());
drop policy if exists "admin_delete_profiles" on public.profiles;
create policy "admin_delete_profiles" on public.profiles
  for delete to authenticated using (public.is_admin());

drop policy if exists "admin_select_products" on public.products;
create policy "admin_select_products" on public.products
  for select to authenticated using (public.is_admin());
drop policy if exists "admin_update_products" on public.products;
create policy "admin_update_products" on public.products
  for update to authenticated using (public.is_admin())
  with check (public.is_admin());
drop policy if exists "admin_delete_products" on public.products;
create policy "admin_delete_products" on public.products
  for delete to authenticated using (public.is_admin());

drop policy if exists "admin_select_orders" on public.orders;
create policy "admin_select_orders" on public.orders
  for select to authenticated using (public.is_admin());
drop policy if exists "admin_update_orders" on public.orders;
create policy "admin_update_orders" on public.orders
  for update to authenticated using (public.is_admin())
  with check (public.is_admin());
drop policy if exists "admin_delete_orders" on public.orders;
create policy "admin_delete_orders" on public.orders
  for delete to authenticated using (public.is_admin());

drop policy if exists "admin_select_seller_semester_payments"
  on public.seller_semester_payments;
create policy "admin_select_seller_semester_payments"
  on public.seller_semester_payments
  for select to authenticated using (public.is_admin());
drop policy if exists "admin_update_seller_semester_payments"
  on public.seller_semester_payments;
create policy "admin_update_seller_semester_payments"
  on public.seller_semester_payments
  for update to authenticated using (public.is_admin())
  with check (public.is_admin());
drop policy if exists "admin_delete_seller_semester_payments"
  on public.seller_semester_payments;
create policy "admin_delete_seller_semester_payments"
  on public.seller_semester_payments
  for delete to authenticated using (public.is_admin());

create or replace function public.admin_delete_unused_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if target_user_id is null or target_user_id = (select auth.uid()) then
    raise exception 'A different user account must be selected';
  end if;
  if exists (
    select 1 from public.orders
    where buyer_id = target_user_id or seller_id = target_user_id
  ) then
    raise exception 'This user has orders and cannot be deleted';
  end if;
  if exists (
    select 1 from public.seller_semester_payments
    where seller_id = target_user_id
  ) then
    raise exception 'This user has semester payments and cannot be deleted';
  end if;
  if exists (
    select 1 from public.products
    where seller_id = target_user_id
      and (
        featured_status in ('active', 'pending_review')
        or featured_receipt_path is not null
        or featured_reference_number is not null
      )
  ) then
    raise exception 'This user has featured listing payment records and cannot be deleted';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target_user_id and role in ('buyer', 'seller')
  ) then
    raise exception 'User profile not found or cannot be deleted';
  end if;

  delete from public.messages where sender_id = target_user_id;
  delete from public.products where seller_id = target_user_id;
  delete from public.profiles where id = target_user_id;
  delete from auth.users where id = target_user_id;
  if not found then
    raise exception 'Authentication account was not found';
  end if;
end;
$$;

revoke all on function public.admin_delete_unused_user(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_delete_unused_user(uuid)
  to authenticated;

create or replace function public.admin_set_semester_payment_status(
  p_payment_id uuid,
  p_status text,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.seller_semester_payments%rowtype;
  paid_total numeric(10,2);
  last_receipt text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'Payment status must be approved or rejected';
  end if;

  select * into payment_row
  from public.seller_semester_payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'Semester payment was not found';
  end if;

  update public.seller_semester_payments
  set status = p_status,
      rejection_reason = case
        when p_status = 'rejected' then coalesce(
          nullif(btrim(p_rejection_reason), ''),
          'Receipt rejected by campus administrator.'
        )
        else null
      end,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = p_payment_id;

  select
    least(50, coalesce(sum(amount), 0)),
    (array_agg(receipt_path order by created_at desc))[1]
  into paid_total, last_receipt
  from public.seller_semester_payments
  where seller_id = payment_row.seller_id
    and semester = payment_row.semester
    and status = 'approved';

  update public.profiles
  set semester_fee_semester = payment_row.semester,
      semester_fee_total = 50,
      semester_fee_paid = paid_total,
      semester_fee_balance = 50 - paid_total,
      semester_fee_status = case when paid_total >= 50 then 'paid' else case when paid_total > 0 then 'partial' else 'unpaid' end end,
      semester_payment_status = case when paid_total >= 50 then 'paid' else case when paid_total > 0 then 'partial' else 'unpaid' end end,
      semester_receipt_url = last_receipt,
      subscription_semester = payment_row.semester,
      subscription_amount_paid = paid_total,
      subscription_status = case when paid_total >= 50 then 'paid' else case when paid_total > 0 then 'partial' else 'unpaid' end end
  where id = payment_row.seller_id
    and (
      semester_fee_semester = payment_row.semester
      or payment_row.semester = public.current_semester_key()
    );
end;
$$;

revoke all on function public.admin_set_semester_payment_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_semester_payment_status(uuid, text, text)
  to authenticated;

create or replace function public.admin_cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  item_row record;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  select * into order_row
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Order was not found';
  end if;
  if order_row.order_status in ('cancelled', 'completed') then
    raise exception 'Completed or already-cancelled orders cannot be cancelled';
  end if;

  for item_row in
    select product_id, sum(quantity) as quantity
    from public.order_items
    where order_id = p_order_id and product_id is not null
    group by product_id
  loop
    update public.products
    set available_stock = available_stock + item_row.quantity,
        reserved_stock = reserved_stock - item_row.quantity,
        status = case
          when status = 'sold_out' and available_stock + item_row.quantity > 0
            then 'published'
          else status
        end
    where id = item_row.product_id
      and reserved_stock >= item_row.quantity;
    if not found then
      raise exception 'Could not safely restore stock for product %',
        item_row.product_id;
    end if;
  end loop;

  update public.orders
  set order_status = 'cancelled'
  where id = p_order_id;
end;
$$;

revoke all on function public.admin_cancel_order(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_cancel_order(uuid)
  to authenticated;

commit;
