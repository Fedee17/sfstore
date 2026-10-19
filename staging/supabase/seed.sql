-- Synthetic fixture. Not a business tariff and NEVER a Production seed.
begin;
do $$ begin
 if to_regclass('sfstore_staging.identity') is null then raise exception 'STAGING_MARKER_REQUIRED';end if;
 if not exists(select 1 from sfstore_staging.identity where id='SFSTORE_SYNTHETIC_STAGING') then raise exception 'STAGING_MARKER_REQUIRED';end if;
 if exists(select 1 from public.products) or exists(select 1 from public.orders) or exists(select 1 from public.customers) then raise exception 'STAGING_REQUIRES_EMPTY_BUSINESS_TABLES';end if;
end $$;
insert into public.categories(id,name,slug) values('11111111-1111-4111-8111-111111111111','Perfumes','perfumes');
insert into public.products(id,category_id,name,slug,short_description,price,transfer_price,stock,status) values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','STAGING Synthetic Product','staging-synthetic-product','Synthetic test only',100,75,30,'active');
insert into public.checkout_configuration(id,enabled,reservation_seconds,price_policy,buyer_authorization,delivery_options,approved_revision) values('33333333-3333-4333-8333-333333333333',true,86400,'manual_25_frozen','authenticated','[{"method":"pickup","fee":0},{"method":"shipping","country":"AR","enabled":true,"carrier":"Andreani","destinationRates":[{"province":"Córdoba","city":"Synthetic City","postalCode":"5000","fee":12.50,"enabled":true}]}]','SYNTHETIC-STAGING-NOT-COMMERCIAL');
commit;
