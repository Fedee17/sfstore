-- TEMPLATE, NOT EXECUTED ON PRODUCTION. Replace only the recipe/purchase UUIDs
-- after reviewing the exact SKU mapping and the newly captured state.
-- Execute only AFTER the component contract has been explicitly approved/applied.
begin read only;
set local statement_timeout='15s';
set local lock_timeout='3s';
with requested as (
 select '00000000-0000-0000-0000-000000000000'::uuid purchase_id,
        '00000000-0000-0000-0000-000000000000'::uuid recipe_id
)
select current_database() database_name,
 current_setting('transaction_read_only') read_only,
 current_setting('server_version_num') server_version,
 public.get_component_conversion_plan(purchase_id,recipe_id,10,10) private_plan
from requested;
-- Private plan includes purchase allocation, SKU stock/cost/updated_at and movement
-- identities, with no customer rows or credentials. Keep its fingerprint for the
-- reviewed executor. The executor checks eligibility again while holding locks.
rollback;
