begin;

alter table public.seller_semester_payments
  drop constraint if exists seller_semester_payments_amount_check;
alter table public.seller_semester_payments
  add constraint seller_semester_payments_amount_check
  check (amount in (20, 30, 50));

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
  if not exists (
    select 1 from public.profiles where id = uid and role = 'seller'
  ) then
    raise exception 'Seller account required';
  end if;
  if p_semester is distinct from public.current_semester_key() then
    raise exception 'Semester payment must use the current semester';
  end if;

  select case
    when semester_fee_semester = p_semester then semester_fee_paid
    else 0
  end
  into current_paid
  from public.profiles
  where id = uid
  for update;

  if current_paid >= 50 then
    raise exception 'Semester fee is already paid';
  end if;
  if current_paid not in (0, 20, 30) then
    raise exception 'Seller fee has an unexpected approved balance';
  end if;
  if (current_paid = 0 and p_amount not in (30, 50))
    or (current_paid = 20 and p_amount <> 30)
    or (current_paid = 30 and p_amount <> 20) then
    raise exception 'Payment amount does not match the next semester installment';
  end if;
  if exists (
    select 1
    from public.seller_semester_payments
    where seller_id = uid
      and semester = p_semester
      and status = 'pending'
  ) then
    raise exception 'A semester payment is already awaiting review';
  end if;

  insert into public.seller_semester_payments(
    seller_id, semester, amount, receipt_path
  )
  values (uid, p_semester, p_amount, p_receipt_path)
  returning id into payment_id;

  return payment_id;
end;
$$;

alter table public.products
  drop constraint if exists products_featured_status_check;
alter table public.products
  add constraint products_featured_status_check
  check (featured_status in ('none', 'unpaid', 'pending_review', 'active'));

commit;
