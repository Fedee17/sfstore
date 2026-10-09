# Atomic product save: Phase A contract

## Scope and deployment boundary

- Additive migration: `supabase/migrations/202610060001_atomic_product_save.sql`.
- No changes to existing tables, global constraints, deployed RPCs, or existing triggers.
- No Server Action, service, UI, importer, inventory, sales, purchase, or historical-flow integration.
- Attributes and images remain optional. There is no new requirement to publish a product.
- No Storage calls, cleanup worker, data repair, or Production migration execution in this phase.
- The existing application keeps using its current save/gallery/delete paths until Phase B.

## New tables

### public.product_save_operations

`operation_key` UUID primary key, operation type (`create_product`/`update_product`),
reserved `product_id`, server-calculated SHA-256 `payload_hash`, status
(`prepared`/`committed`/`aborted`), JSONB result and recovery metadata, timestamps.

The reserved product ID intentionally has no products FK: the future coordinator
must be able to reserve an operation before uploading files or creating the product.
Result is present only for committed operations. Indexes cover product/history and
prepared operations. Recovery metadata is an object, not a raw copy of the request.
Do not put secrets or file bytes in it.

### public.product_storage_tasks

UUID ID, operation/product composite FK, action (`delete_object`/`reconcile`), fixed
`product-images` bucket, path, optional image ID, expected metadata (path and optional
eTag/content hash, size, MIME), state (`pending`/`processing`/`completed`/`failed`),
attempts, last error, timestamps. Unique operation/action/path makes enqueue idempotent.
An index covers pending/failed work. No task is executed automatically.

Both tables enable RLS with no client policies. PUBLIC, anon and authenticated have
no privileges; service_role has SELECT/INSERT/UPDATE, not DELETE. Existing project
service_role BYPASSRLS is required, following the deployed server-side pattern.
New updated_at triggers only attach to these two new tables.

## RPC signatures

All return JSONB unless specified otherwise. All are SECURITY INVOKER with
`search_path = pg_catalog, public`; application tables/functions are schema-qualified.
EXECUTE is revoked from PUBLIC, anon and authenticated and granted to service_role only.
The shared implementation is also service-only, not a client API.

```sql
get_product_save_version(p_product_id uuid) returns text
prepare_product_save_operation(
  p_operation_key uuid, p_operation_type text, p_product_id uuid,
  p_payload jsonb, p_expected_version text default null
)
resolve_product_save_operation(p_operation_key uuid)
abort_product_save_operation(p_operation_key uuid)
enqueue_product_storage_task(
  p_operation_key uuid, p_product_id uuid, p_action text, p_storage_path text,
  p_expected_metadata jsonb, p_image_id uuid default null
) returns uuid
save_product_atomic_internal(
  p_operation_key uuid, p_operation_type text, p_product_id uuid,
  p_expected_version text, p_payload jsonb
)
create_product_atomic(p_operation_key uuid, p_product_id uuid, p_payload jsonb)
update_product_atomic(
  p_operation_key uuid, p_product_id uuid, p_expected_version text, p_payload jsonb
)
```

## Payload and result

The `product` object is a complete form snapshot. All twelve fields are required;
nullable commercial fields must be explicit nulls. Unknown fields are rejected.
No stock, historical flags, timestamps or cost provenance ID are accepted from callers.

```json
{
  "product": {
    "category_id": "<existing UUID>", "name": "Product", "slug": "product",
    "short_description": "", "description": null,
    "price": 100, "transfer_price": null, "compare_at_price": null,
    "cost": null, "sku": null, "featured": false, "status": "draft"
  },
  "attributes": [{ "name": "Marca", "value": "Brand", "sort_order": 10 }],
  "images": [{
    "id": "<reserved image UUID>",
    "url": "https://<configured-host>/storage/v1/object/public/product-images/products/<product-id>/<file>.webp",
    "path": "products/<product-id>/<file>.webp",
    "alt": "Product", "is_primary": true,
    "size": 1234, "mime": "image/webp", "content_hash": "<verified content hash>"
  }],
  "storage_tasks": []
}
```

- `attributes` absent means an empty managed set, matching an empty form; legacy
  unmanaged attributes are preserved. If supplied it must be an array, not null.
- Managed keys: Marca, Tipo, legacy Categoria comercial, commercial_category,
  olfactory_family, intensity, occasion, gender, mate_type, material, color, use_case.
  The legacy commercial category key is removed, not accepted as a new value, matching
  the current form. Proveedor, decant_available and other unmanaged keys survive.
- Configured perfume/mate values and multiplicity mirror attribute-config.ts, with
  a DB test against every actual option. Marca/Tipo are optional free-text values.
- Missing/null `images` preserves existing metadata. An explicit array is the complete
  final gallery; `[]` removes metadata only. It must include retained existing images.
- Image array order determines contiguous sort_order starting at zero. At most one
  requested primary; if none is marked, the first image becomes primary. Empty is valid.
- Duplicate image UUIDs, URLs, supplied paths and supplied content identities are rejected.
- Existing image IDs cannot change product or URL; conflict-time checks also protect
  against a concurrent insertion of the same ID by another product.
- New metadata requires a product-owned path, HTTPS managed URL, JPEG/PNG/WebP MIME and
  an integer size from 1 through 5 MiB. SQL cannot establish physical existence or verify
  remote hashes/host identity. The future server coordinator must verify those facts.
- Removing unshared managed metadata requires a durable task for its path. Shared URLs
  retain their other reference and cannot enqueue delete_object while referenced.

Result contains operation_key, product_id, operation_type, new aggregate version,
product ID/slug/status/category_id/updated_at, attributes_count, images_count,
storage_tasks_count. It does not return cost or secrets.

## Atomicity, idempotency and recovery

The mutation, managed attribute replacement, final metadata, cleanup tasks and committed
operation result share ONE PostgreSQL transaction. Exceptions propagate; there is no
catch that commits partial product data. Existing FK, money, SKU/slug and historical
constraints stay authoritative. Cost provenance is retained if the cost rounded to
database cents is unchanged, and cleared only if that persisted cost changes. Existing
stock is untouched; create uses the existing default zero, never an initial adjustment.
Historical identities and the already-excluded duplicate identity remain protected.

The DB hashes the canonical JSONB envelope (type, product ID, expected version and
payload); caller-provided hashes are not trusted. Object key order is irrelevant,
array order is meaningful. Same key/hash returns the exact stored committed result,
including for an update whose original expected version is now old. Different payload
with the same key raises PRODUCT_IDEMPOTENCY_CONFLICT. A prepared retry can attempt the
same transaction again. An aborted operation raises PRODUCT_OPERATION_ABORTED.

The future Phase B coordinator MUST commit prepare_product_save_operation before any
Storage upload and await its response. Reuse that key and the unchanged payload on
transport retry. For an uncertain save response, resolve_product_save_operation locks
the persisted reservation and waits for an in-flight save to finish. It reports:

- committed: stored result proves DB confirmation; do not compensate committed images;
- prepared: no DB commit yet; retry the same payload or fence before compensation;
- aborted: fenced, so a delayed retry cannot commit;
- not_found: no visible reservation. This alone is NOT proof that an unprepared,
  in-flight request will never commit. Do not use this state to delete uploaded files.

Before deleting uncommitted uploads, abort_product_save_operation locks/fences the
prepared record; a committed record cannot be aborted. Cleanup must still be queued
and executed separately. PostgreSQL cannot retain the error from a rolled-back
transaction automatically: a prepared reservation survives only when it was committed
beforehand. Recovery/error metadata can be recorded later by the trusted coordinator.

A future cleanup worker must revalidate path/content/size/MIME, current references and
operation state immediately before physical deletion, reject shared/reused objects,
resolve ambiguity, and persist outcome/attempts. It is deliberately not part of Phase A.

## Version protocol and concurrency boundary

get_product_save_version returns a 64-character SHA-256 of the full products row,
attributes ordered by ID and image metadata ordered by ID. It is VOLATILE so a save's
result sees its own writes, and sets timezone to UTC locally so fingerprints do not
depend on the caller's timestamp display timezone. No existing updated_at trigger is changed.

Future Server Action: read the aggregate and its opaque fingerprint consistently;
send that original fingerprint as p_expected_version, not a timestamp synthesized in
the browser. A consistent read can use a transaction with a suitable snapshot, or
read version before/after loading the aggregate and retry if they differ.
The update locks products FOR UPDATE, locks existing child rows in ID order, then
compares the fingerprint. PRODUCT_STALE_VERSION means reload/review, not silent overwrite.
Two new-RPC updates with the same version permit exactly one commit, tested with two
actual PostgreSQL connections and a verified row-lock wait.

Legacy gallery/attribute changes that have already committed alter the fingerprint,
even if they did not update the product timestamp. Existing multi-request writers are
NOT made atomic by installing unused RPCs. They do not all participate in the parent
lock/version protocol, so the entire application concurrency guarantee starts only
after Phase B routes coordinated writes through it. No legacy writer is changed here.

## Local DB verification

tests/atomic-product-save.test.mjs starts an isolated native PostgreSQL cluster bound
only to 127.0.0.1, applies the real schema and versioned migrations there, and stops and
removes only its generated temporary directory. No remote connection URL is accepted.
Fixture inserts, injected-failure triggers and truncations are local-only.

Provide a PostgreSQL 16 bin directory and a pg module outside this repository:

```powershell
$env:SFSTORE_TEST_PG_BIN = '<absolute local PostgreSQL bin directory>'
$env:SFSTORE_TEST_PG_MODULE = '<absolute path to pg/lib/index.js>'
node --test tests/atomic-product-save.test.mjs
node --test tests/*.test.mjs
```

Without both variables, DB tests explicitly SKIP; structural tests still run. A skipped
DB run is not sufficient validation for this migration. No production runtime or
package.json dependency is added. Real DB tests cover rollback, retries, stale edits,
concurrent updates, optional attributes/images, legacy preservation, cost provenance,
money/uniqueness constraints, ownership, shared URLs, queue safety and actual grants.

## Production read-only preflight (2026-10-06)

Observed: 179 products, 875 attributes, 57 product_images and 57 Storage objects.
Zero DB orphans, Storage orphans, multiple/missing primary, sort gaps or duplicate
product/name/value attributes. Requests were SELECT/GET; Storage listing uses its
read-only POST list endpoint. A method guard rejected all other write requests.
No global attribute/image constraint is introduced and no legacy data is altered.

## Validation result (2026-10-06)

- New focal tests: 27/27, including 25 real DB tests and two structural tests.
- Complete suite with native PostgreSQL enabled: 573/573, zero skipped tests.
- `npx tsc --noEmit`: passed.
- `npx eslint tests/atomic-product-save.test.mjs`: passed, no errors or warnings.
- `npm run build`: passed.
- `git diff --check` and no-index checks of the three new files: passed.
- Existing Node MODULE_TYPELESS_PACKAGE_JSON notices and Git LF/CRLF conversion
  notices remain; no package metadata or line-ending policy was changed.
- Migration SHA-256 as prepared:
  `e3e87a4bc7902b9f5ace1ce8d445dd53eca47859a140bcba0515e53b7f34be3d`.
- main HEAD remains `4a515414f06d42af29893177c7f2c8db4635b0d5`.
- Only the migration, its new tests and this contract are untracked. No commit,
  push, deploy, Production schema change, Storage mutation, or business write occurred.

## Future manual migration application (NOT executed in this phase)

1. Obtain explicit approval to change schema, and repeat the read-only preflight.
2. Supabase Dashboard -> SQL Editor -> New query, correct SFSTORE Production project.
3. Open `C:\dev\sfstore\supabase\migrations\202610060001_atomic_product_save.sql`.
4. Execute its ENTIRE contents once, including BEGIN/COMMIT. Do not run individual
   fragments, other migrations, supabase db push, or any product-save RPC as a test.
5. Read-only inspect new table/RLS definitions, eight signatures, SECURITY INVOKER,
   search_path and ACLs; repeat old aggregate/count/Storage invariants.
6. Keep current actions/UI unchanged until the separately approved Phase B integration.

The file uses CREATE rather than replacing objects. Accidental reapplication fails
instead of resetting existing state. The outer transaction makes installation atomic.
Do not run it if those object names unexpectedly already exist; inspect first.
Before any operation has used the infrastructure, reverting consists of dropping only
the new functions, two new triggers and empty new tables in dependency order in a
separate reviewed migration. Never discard populated recovery/task records blindly.

## Manual application preparation (2026-10-09)

Migration unchanged. Local SHA-256:
`e3e87a4bc7902b9f5ace1ce8d445dd53eca47859a140bcba0515e53b7f34be3d`.
BEGIN/COMMIT, two additive tables, eight new functions, three explicit indexes,
two new-table triggers, RLS and service-only permissions were reviewed again.
There is no destructive DROP, existing-table ALTER, top-level business DML,
backfill, Storage operation, worker or invocation of a mutating RPC.
INSERT/UPDATE/DELETE inside the new function definitions execute only when those
functions are explicitly invoked, not when installing their definitions.

### Human-confirmed current baseline, revalidated read-only

Read-only Production observation on 2026-10-09:

| Metric | Confirmed baseline | Revalidated before migration |
| --- | ---: | ---: |
| products | 179 | 179 |
| product_attributes | 875 | 875 |
| product_images | 59 | 59 |
| stock total | 106 | 106 |
| inventory_movements | 32 | 32 |

The user confirmed ongoing manual product/image/stock/price updates since the previous
baseline. Expected operational drift is not itself an inconsistency; no individual
operations were reconstructed. The candidate baseline above now matches the read-only
revalidation. Storage has 59 objects and 59 unique paths referenced by the 59 DB images.
All requested integrity checks are zero: negative stock, images without products,
images missing their Storage object, orphan Storage objects, multiple/missing primary,
sort gaps/duplicates and duplicate attributes by product_id/name/value. Managed image
URLs were also validated. No data was modified and no cleanup was run. Storage was
only listed through its read-only list API; all write requests were blocked.
Only the verifier's expected baseline was changed to 179/875/59/106/32; migration logic,
test code, verifier logic and the dated previous audit observations remain unchanged.
Matching counts/sums alone do not prove every existing field is unchanged; use a
PRE/POST field-level snapshot if that stronger guarantee is required. Avoid unrelated
operational writes between the approved PRE measurement and the POST verification.

### Future manual application steps (not executed)

1. Confirm the SFSTORE Production project and the approved PRE baseline.
2. Supabase Dashboard -> SQL Editor -> New query.
3. Open `C:\dev\sfstore\supabase\migrations\202610060001_atomic_product_save.sql`.
4. Paste the ENTIRE file, including BEGIN/COMMIT, and execute it ONCE.
5. Do not use supabase db push, execute partial fragments, or call product-save RPCs.
6. Open a separate New query and execute the single read-only block below.
7. Inspect all seven sections. No MISMATCH/error is acceptable without investigation.

The SQL block does not invoke the eight new RPCs or read Storage. It reads only
PostgreSQL catalogs and existing public tables. ENVIRONMENT checks actual server
primitives/dependencies; the local migration was validated on PostgreSQL 16.14 with
the versioned schema. Production catalog/version compatibility must be confirmed
by this output, not assumed from a successful build.

### Single read-only verification block

```sql
-- POSTCHECK_ATOMIC_PRODUCT_SAVE: catalog inspection and SELECTs only.
with
expected_tables(name) as (
  values ('product_save_operations'), ('product_storage_tasks')
),
table_rows as (
  select e.name, c.oid, c.relkind = 'r' as is_table, c.relrowsecurity as rls,
    pg_get_userbyid(c.relowner) as owner,
    has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_access,
    has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as authenticated_access,
    exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      where a.grantee = 0) as public_access,
    has_table_privilege('service_role', c.oid, 'SELECT') as service_select,
    has_table_privilege('service_role', c.oid, 'INSERT') as service_insert,
    has_table_privilege('service_role', c.oid, 'UPDATE') as service_update,
    has_table_privilege('service_role', c.oid, 'DELETE') as service_delete
  from expected_tables e
  left join pg_class c on c.oid = to_regclass('public.' || e.name)
),
expected_functions(signature, return_type) as (
  values
    ('public.get_product_save_version(uuid)', 'text'),
    ('public.prepare_product_save_operation(uuid,text,uuid,jsonb,text)', 'jsonb'),
    ('public.resolve_product_save_operation(uuid)', 'jsonb'),
    ('public.abort_product_save_operation(uuid)', 'jsonb'),
    ('public.enqueue_product_storage_task(uuid,uuid,text,text,jsonb,uuid)', 'uuid'),
    ('public.save_product_atomic_internal(uuid,text,uuid,text,jsonb)', 'jsonb'),
    ('public.create_product_atomic(uuid,uuid,jsonb)', 'jsonb'),
    ('public.update_product_atomic(uuid,uuid,text,jsonb)', 'jsonb')
),
function_rows as (
  select e.signature, e.return_type as expected_return, p.oid is not null as function_exists,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as actual_return,
    pg_get_userbyid(p.proowner) as owner,
    not p.prosecdef as security_invoker,
    coalesce(p.proconfig @> array['search_path=pg_catalog, public'], false) as search_path_ok,
    p.proconfig as settings,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
    exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
    p.prorettype = to_regtype(e.return_type) as return_ok,
    case when e.signature = 'public.get_product_save_version(uuid)'
      then coalesce(p.proconfig @> array['TimeZone=UTC'], false) else true end as timezone_ok
  from expected_functions e
  left join pg_proc p on p.oid = to_regprocedure(e.signature)
),
expected_indexes(name, table_name, columns, partial) as (
  values
    ('product_save_operations_product_idx', 'product_save_operations', array['product_id','created_at'], false),
    ('product_save_operations_pending_idx', 'product_save_operations', array['created_at'], true),
    ('product_storage_tasks_pending_idx', 'product_storage_tasks', array['status','created_at'], true)
),
index_rows as (
  select e.name, e.table_name, i.indisvalid and i.indisready as valid,
    i.indrelid = to_regclass('public.' || e.table_name) as table_ok,
    array(select a.attname::text from unnest(i.indkey::smallint[]) with ordinality k(num,pos)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.num order by k.pos) = e.columns as columns_ok,
    (i.indpred is not null) = e.partial as partial_ok,
    pg_get_indexdef(i.indexrelid) as definition
  from expected_indexes e
  left join pg_index i on i.indexrelid = to_regclass('public.' || e.name)
),
constraint_rows as (
  select t.name as table_name, c.conname, c.contype, c.convalidated,
    array(select a.attname::text from unnest(c.conkey) with ordinality k(num,pos)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.num order by k.pos) as columns,
    c.confrelid, c.confdeltype,
    array(select a.attname::text from unnest(c.confkey) with ordinality k(num,pos)
      join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.num order by k.pos) as referenced_columns,
    pg_get_constraintdef(c.oid) as definition
  from table_rows t join pg_constraint c on c.conrelid = t.oid
),
expected_keys(table_name, kind, columns) as (
  values
    ('product_save_operations', 'p', array['operation_key']),
    ('product_save_operations', 'u', array['operation_key','product_id']),
    ('product_storage_tasks', 'p', array['id']),
    ('product_storage_tasks', 'u', array['operation_key','action','storage_path']),
    ('product_storage_tasks', 'f', array['operation_key','product_id'])
),
trigger_rows as (
  select e.name, t.tgenabled, t.tgtype,
    t.tgfoid = to_regprocedure('public.set_updated_at()') as function_ok,
    pg_get_triggerdef(t.oid) as definition
  from (values
    ('product_save_operations_updated_at', 'product_save_operations'),
    ('product_storage_tasks_updated_at', 'product_storage_tasks')
  ) e(name, table_name)
  left join pg_trigger t on t.tgname = e.name and not t.tgisinternal
    and t.tgrelid = to_regclass('public.' || e.table_name)
),
metrics(name, expected, actual) as (
  values
    ('products', 179::bigint, (select count(*) from public.products)),
    ('product_attributes', 875::bigint, (select count(*) from public.product_attributes)),
    ('product_images', 59::bigint, (select count(*) from public.product_images)),
    ('stock_total', 106::bigint, (select coalesce(sum(stock),0) from public.products)),
    ('inventory_movements', 32::bigint, (select count(*) from public.inventory_movements))
),
checks(position, section, ok, details) as (
  select 1, 'ENVIRONMENT',
    current_setting('server_version_num')::integer >= 140000
      and to_regprocedure('pg_catalog.sha256(bytea)') is not null
      and to_regprocedure('pg_catalog.gen_random_uuid()') is not null
      and to_regprocedure('public.set_updated_at()') is not null
      and (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')) = 3
      and coalesce((select rolbypassrls from pg_roles where rolname='service_role'), false),
    jsonb_build_object('postgresql', current_setting('server_version'),
      'sha256', to_regprocedure('pg_catalog.sha256(bytea)')::text,
      'uuid', to_regprocedure('pg_catalog.gen_random_uuid()')::text,
      'updated_at', to_regprocedure('public.set_updated_at()')::text,
      'roles', (select jsonb_agg(jsonb_build_object('name',rolname,'bypassrls',rolbypassrls) order by rolname)
        from pg_roles where rolname in ('anon','authenticated','service_role')))
  union all
  select 2, 'TABLES_RLS_GRANTS',
    bool_and(coalesce(is_table and rls and not anon_access and not authenticated_access
      and not public_access and service_select and service_insert and service_update and not service_delete, false)),
    jsonb_agg(to_jsonb(t) order by name) from table_rows t
  union all
  select 3, 'FUNCTIONS_SECURITY',
    bool_and(coalesce(function_exists and security_invoker and search_path_ok and timezone_ok and return_ok
      and not anon_execute and not authenticated_execute and not public_execute and service_execute, false)),
    jsonb_agg(to_jsonb(f) order by signature) from function_rows f
  union all
  select 4, 'INDEXES', bool_and(coalesce(valid and table_ok and columns_ok and partial_ok, false)),
    jsonb_agg(to_jsonb(i) order by name) from index_rows i
  union all
  select 5, 'CONSTRAINTS',
    not exists (select 1 from expected_keys e where not exists (
      select 1 from constraint_rows c where c.table_name=e.table_name and c.contype::text=e.kind
        and c.columns=e.columns and c.convalidated
        and (e.kind <> 'f' or (c.confrelid=to_regclass('public.product_save_operations')
          and c.confdeltype='r' and c.referenced_columns=array['operation_key','product_id']))))
      and (select count(*) from constraint_rows where table_name='product_save_operations' and contype='c' and convalidated) = 5
      and (select count(*) from constraint_rows where table_name='product_storage_tasks' and contype='c' and convalidated) = 6
      and not exists (select 1 from constraint_rows where not convalidated),
    coalesce((select jsonb_agg(to_jsonb(c) order by table_name,conname) from constraint_rows c), '[]'::jsonb)
  union all
  select 6, 'TRIGGERS', bool_and(coalesce(tgenabled='O' and tgtype=19 and function_ok, false)),
    jsonb_agg(to_jsonb(t) order by name) from trigger_rows t
  union all
  select 7, 'EXISTING_DATA', bool_and(expected=actual),
    jsonb_agg(to_jsonb(m) order by name) from metrics m
)
select section, case when coalesce(ok,false) then 'OK' else 'MISMATCH' end as result, details
from checks order by position;
```

Expected output after an approved, correctly installed migration: seven rows, all
OK; two tables with RLS and service SELECT/INSERT/UPDATE only; eight matching function
signatures/returns with SECURITY INVOKER/search_path and no client EXECUTE; three
explicit indexes; five primary/unique/FK keys plus 11 validated CHECK constraints;
two enabled BEFORE UPDATE row triggers; exactly the approved existing-data counts.
Review the CHECK and partial-index definitions in details against the unchanged file,
not only their counts. Owner must be the expected migration executor (normally postgres);
ownership is displayed, not hardcoded as a substitute for project verification.

If any SQL error or MISMATCH occurs: stop; do not reapply, repair, invoke save RPCs,
commit or push. Preserve the complete error/result for inspection. If the migration
query leaves an aborted transaction, end that transaction with ROLLBACK, never attempt
partial installation. A baseline change requires explicit confirmation, not data edits.

After successful manual application AND verification, create one commit with exactly
the existing three files, message `feat: add atomic product save database foundation`,
then push main normally (no force). No runtime integration or manual deploy is needed
for Phase A. GitHub integration may still trigger an automatic Vercel deployment on
push; confirm its commit/READY and unauthenticated HTTP/runtime checks before closing.
No commit/push/deploy has been performed during this preparation.

Preparation validation on 2026-10-09: 27/27 tests passed again. The exact verification
block was executed inside READ ONLY transactions on isolated PostgreSQL 16.14 before
and after local installation. Missing objects report MISMATCH; after installation all
six infrastructure sections report OK. Fixture data correctly fails the Production
baseline section. The migration and test file were not modified in this preparation.
