alter table public.profiles
  add column if not exists is_registered boolean not null default false;

update public.profiles
set is_registered = true
where role = 'admin'
   or (department is not null and btrim(department) <> '');

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
    raise exception 'Manual booth fee must be recorded as 30 or 50';
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

create or replace function public.set_order_status(p_order_id uuid, p_status text)
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

  if not found then
    raise exception 'Order not found';
  end if;

  if auth.uid() = order_row.seller_id
    and p_status in ('approved', 'confirmed', 'ready_for_pickup', 'completed') then
    if order_row.payment_method = 'gcash'
      and order_row.payment_status <> 'paid' then
      raise exception 'GCash payment must be approved before this order can be fulfilled';
    end if;
    update public.orders
    set order_status = p_status,
        payment_status = case
          when p_status = 'completed' and order_row.payment_method = 'cash' then 'paid'
          else payment_status
        end
    where id = p_order_id;
  elsif auth.uid() = order_row.buyer_id
    and p_status = 'cancelled'
    and order_row.order_status = 'pending' then
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

    update public.orders
    set order_status = 'cancelled'
    where id = p_order_id;
  else
    raise exception 'You cannot make this order status change';
  end if;
end;
$$;

revoke all on function public.set_registration_profile(text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_registration_profile(text, text, text)
  to authenticated;

revoke all on function public.record_semester_fee_payment(uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.record_semester_fee_payment(uuid, numeric, text)
  to authenticated;

revoke all on function public.set_order_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_order_status(uuid, text)
  to authenticated;
