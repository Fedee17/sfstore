alter table orders
  add column if not exists channel text not null default 'web';

alter table orders
  drop constraint if exists orders_channel_check;
alter table orders
  add constraint orders_channel_check
  check (channel in ('web', 'store', 'order'));

-- Existing orders are created exclusively by the web checkout. The default above
-- backfills them without guessing a different historical channel.
alter table orders
  alter column customer_id drop not null,
  alter column payment_method drop not null,
  alter column shipping_method drop not null;

alter table orders
  drop constraint if exists orders_payment_status_check;
alter table orders
  add constraint orders_payment_status_check
  check (
    payment_status in (
      'pending',
      'partial',
      'paid',
      'refunded',
      'approved',
      'rejected'
    )
  );

create index if not exists orders_channel_idx on orders(channel);
create index if not exists orders_payment_status_idx on orders(payment_status);

create table if not exists order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  method text not null check (
    method in ('cash', 'transfer', 'card', 'mercadopago', 'other')
  ),
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'approved' check (
    status in ('pending', 'approved', 'rejected', 'refunded')
  ),
  reference text,
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_payments_order_id_idx
  on order_payments(order_id);
create index if not exists order_payments_status_idx
  on order_payments(status);
create unique index if not exists order_payments_method_reference_unique
  on order_payments(method, reference)
  where reference is not null;

drop trigger if exists set_order_payments_updated_at on order_payments;
create trigger set_order_payments_updated_at
before update on order_payments
for each row execute function set_updated_at();

alter table order_payments enable row level security;
revoke all on table order_payments from public, anon, authenticated;
grant select, insert, update on table order_payments to service_role;

create or replace function record_order_payment(
  p_order_id uuid,
  p_method text,
  p_amount numeric,
  p_status text default 'approved',
  p_reference text default null,
  p_notes text default null,
  p_paid_at timestamptz default null,
  p_allow_overpayment boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_existing order_payments%rowtype;
  v_payment_id uuid;
  v_reference text := nullif(btrim(p_reference), '');
  v_effective_paid_at timestamptz;
  v_total_paid numeric(12, 2);
  v_remaining numeric(12, 2);
  v_payment_status text;
  v_operation text := 'created';
  v_has_existing boolean := false;
begin
  if p_order_id is null then
    raise exception using errcode = 'P0001', message = 'ORDER_PAYMENT_ORDER_NOT_FOUND';
  end if;

  if p_method is null or p_method not in ('cash', 'transfer', 'card', 'mercadopago', 'other') then
    raise exception using errcode = 'P0001', message = 'ORDER_PAYMENT_METHOD_INVALID';
  end if;

  if p_status is null or p_status not in ('pending', 'approved', 'rejected', 'refunded') then
    raise exception using errcode = 'P0001', message = 'ORDER_PAYMENT_STATUS_INVALID';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'ORDER_PAYMENT_AMOUNT_INVALID';
  end if;

  select *
    into v_order
  from orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_PAYMENT_ORDER_NOT_FOUND';
  end if;

  if v_reference is not null then
    select *
      into v_existing
    from order_payments
    where method = p_method
      and reference = v_reference
    for update;

    v_has_existing := found;
  end if;

  if v_has_existing then
    if v_existing.order_id <> p_order_id then
      raise exception using errcode = 'P0001', message = 'ORDER_PAYMENT_REFERENCE_CONFLICT';
    end if;

    v_effective_paid_at := case
      when p_status = 'approved' then coalesce(p_paid_at, v_existing.paid_at, now())
      else coalesce(p_paid_at, v_existing.paid_at)
    end;

    if v_existing.amount = round(p_amount, 2)
       and v_existing.status = p_status
       and v_existing.notes is not distinct from coalesce(p_notes, v_existing.notes)
       and v_existing.paid_at is not distinct from v_effective_paid_at then
      v_operation := 'already_applied';
    else
      update order_payments
      set amount = round(p_amount, 2),
          status = p_status,
          notes = coalesce(p_notes, notes),
          paid_at = v_effective_paid_at
      where id = v_existing.id;
      v_operation := 'updated';
    end if;

    v_payment_id := v_existing.id;
  else
    v_effective_paid_at := case
      when p_status = 'approved' then coalesce(p_paid_at, now())
      else p_paid_at
    end;

    insert into order_payments (
      order_id,
      method,
      amount,
      status,
      reference,
      notes,
      paid_at
    ) values (
      p_order_id,
      p_method,
      round(p_amount, 2),
      p_status,
      v_reference,
      p_notes,
      v_effective_paid_at
    )
    returning id into v_payment_id;
  end if;

  select coalesce(sum(amount), 0)::numeric(12, 2)
    into v_total_paid
  from order_payments
  where order_id = p_order_id
    and status = 'approved';

  if not p_allow_overpayment and v_total_paid > v_order.total then
    raise exception using errcode = 'P0001', message = 'ORDER_PAYMENT_OVERPAYMENT';
  end if;

  v_remaining := greatest(v_order.total - v_total_paid, 0)::numeric(12, 2);

  if v_total_paid >= v_order.total and v_order.total > 0 then
    v_payment_status := 'paid';
  elsif v_total_paid > 0 then
    v_payment_status := 'partial';
  elsif exists (
    select 1 from order_payments
    where order_id = p_order_id and status = 'refunded'
  ) then
    v_payment_status := 'refunded';
  else
    v_payment_status := 'pending';
  end if;

  update orders
  set payment_status = v_payment_status
  where id = p_order_id
    and payment_status is distinct from v_payment_status;

  return jsonb_build_object(
    'order_id', p_order_id,
    'payment_id', v_payment_id,
    'operation', v_operation,
    'total_paid', v_total_paid,
    'remaining_amount', v_remaining,
    'payment_status', v_payment_status
  );
end;
$$;

revoke all on function record_order_payment(
  uuid, text, numeric, text, text, text, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function record_order_payment(
  uuid, text, numeric, text, text, text, timestamptz, boolean
) to service_role;

comment on table order_payments is
  'Auditable payment ledger for web, store and order sales channels.';
comment on column orders.payment_method is
  'Legacy checkout payment selection. New payment truth lives in order_payments.';
comment on function record_order_payment(
  uuid, text, numeric, text, text, text, timestamptz, boolean
) is 'Atomically records an idempotent payment and recalculates order payment status.';
