-- Restore reserved listing stock when a pending order is cancelled or its
-- GCash receipt is rejected. The order row lock makes each release one-time.

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
    set order_status = p_status
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
