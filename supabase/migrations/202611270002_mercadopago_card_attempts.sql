begin;

create table public.checkout_mercadopago_card_attempts (
  order_id uuid primary key references public.orders(id),
  attempt_id uuid not null unique,
  lease_id uuid not null,
  lease_until timestamptz not null,
  provider_order_id text unique check (provider_order_id ~ '^ORD[A-Z0-9]{8,60}$')
);

alter table public.checkout_mercadopago_card_attempts enable row level security;
revoke all on public.checkout_mercadopago_card_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.checkout_mercadopago_card_attempts to service_role;

create function public.claim_checkout_mercadopago_card_attempt(p_buyer_id uuid, p_order_id uuid) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare checkout jsonb; attempt public.checkout_mercadopago_card_attempts%rowtype;
begin
  -- Serialize against other attempts and the existing settlement transaction.
  perform 1 from public.orders where id=p_order_id for update;
  checkout := public.checkout_mercadopago_order(p_buyer_id, p_order_id);
  if checkout->>'priceMode' is distinct from 'financiado' then raise exception 'PAYMENT_MODE_MISMATCH'; end if;

  select * into attempt from public.checkout_mercadopago_card_attempts where order_id=p_order_id for update;
  if found and attempt.lease_until > clock_timestamp() then return jsonb_build_object('busy', true); end if;

  insert into public.checkout_mercadopago_card_attempts as current_attempt(order_id,attempt_id,lease_id,lease_until)
    values(p_order_id,gen_random_uuid(),gen_random_uuid(),clock_timestamp()+interval '90 seconds')
    on conflict (order_id) do update set
      -- An unbound provider order cannot be processed. A new lease may abandon it.
      attempt_id=case when current_attempt.provider_order_id is null then excluded.attempt_id else current_attempt.attempt_id end,
      lease_id=excluded.lease_id, lease_until=excluded.lease_until
    returning * into attempt;
  return checkout || jsonb_build_object('attemptId',attempt.attempt_id,'leaseId',attempt.lease_id,'providerOrderId',attempt.provider_order_id);
end $$;

create function public.bind_checkout_mercadopago_card_attempt(p_buyer_id uuid, p_order_id uuid, p_lease_id uuid, p_provider_order_id text) returns boolean
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  perform 1 from public.orders where id=p_order_id for update;
  if public.checkout_mercadopago_order(p_buyer_id,p_order_id)->>'priceMode' is distinct from 'financiado'
    then raise exception 'PAYMENT_MODE_MISMATCH'; end if;

  update public.checkout_mercadopago_card_attempts set provider_order_id=p_provider_order_id
    where order_id=p_order_id and lease_id=p_lease_id and lease_until>clock_timestamp()
      and p_provider_order_id ~ '^ORD[A-Z0-9]{8,60}$'
      and (provider_order_id is null or provider_order_id=p_provider_order_id);
  return found;
end $$;

create function public.release_checkout_mercadopago_card_attempt(p_order_id uuid, p_lease_id uuid, p_provider_order_id text) returns void
language sql security invoker set search_path = pg_catalog, public as $$
  delete from public.checkout_mercadopago_card_attempts
  where order_id=p_order_id and lease_id=p_lease_id and provider_order_id is not distinct from p_provider_order_id;
$$;

revoke all on function public.claim_checkout_mercadopago_card_attempt(uuid,uuid),
  public.bind_checkout_mercadopago_card_attempt(uuid,uuid,uuid,text),
  public.release_checkout_mercadopago_card_attempt(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_checkout_mercadopago_card_attempt(uuid,uuid),
  public.bind_checkout_mercadopago_card_attempt(uuid,uuid,uuid,text),
  public.release_checkout_mercadopago_card_attempt(uuid,uuid,text) to service_role;

commit;
