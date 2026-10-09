# Atomic Product Save - Phase B

## Scope

The user confirmed that `202610060001_atomic_product_save.sql` was applied and
verified manually. Its SHA-256 remains
`e3e87a4bc7902b9f5ace1ce8d445dd53eca47859a140bcba0515e53b7f34be3d`.
No additional migration or schema change is required by Phase B.

Create/edit product Server Actions now use the prepared operation coordinator
and `create_product_atomic` / `update_product_atomic`. They no longer write
product, managed attribute, and gallery metadata in separate transactions.
Normal gallery delete/reorder/primary, inventory and historical flows retain
their existing implementations.

## Consistency and Recovery

- The client reserves a product UUID and operation UUID per logical submission.
  The exact submitted FormData, including converted images, is retained on an
  ambiguous error. A retry does not create another product or operation.
- The edit page reads an aggregate fingerprint before and after the product
  snapshot. It retries racing reads and rejects a persistently unstable read.
- The expected version is the version originally displayed, not a version
  freshly read immediately before an unconditional write. Successful saves
  advance it using the RPC result. Stale edits require a reload.
- The server fingerprints the submitted request and persists the immutable
  payload/gallery/upload plan in the operation's recovery metadata before any
  upload. A different request cannot reuse the same operation.
- Uploads use deterministic content-based paths and image IDs, no overwrite,
  and eTag/size/MIME verification. Duplicate bytes within a batch collapse into
  one image. Compatible existing legacy objects are reused.
- A durable `reconcile` task is recorded before each new upload. No background
  worker or automatic deletion is introduced in this phase.
- A lost commit response is resolved using the operation-locking RPC. A
  committed save returns its original result. A prepared transient failure
  remains retryable; a confirmed terminal database failure is fenced by abort.
  No uncertain outcome causes immediate Storage deletion.
- Cache invalidation happens after commit; its failure cannot report a committed
  transaction as an unsuccessful business save.
- Pending always ends. Ambiguous retry fields are frozen; a reload is explicit
  for stale edits. React's uncontrolled-input reset does not discard submitted
  values or converted files. Double submit has a synchronous guard.

## Preserved Behavior

HEIC/HEIF normalization and JPEG/PNG/WebP optimization remain client-side.
Signature and size checks remain server-side. Automatic descriptions retain
UTF-8. The RPC preserves stock and cost provenance when the rounded cost is
unchanged, and preserves unmanaged attributes. Historical identities and the
superseded Yara Rosa identity remain blocked. Existing primary/order metadata
is included when appending images; no-image saves leave the gallery untouched.

## Validation

Tests include real isolated PostgreSQL RPC rollback, permissions, idempotency,
cost provenance and gallery cases; coordinator failures and recovery; the actual
Supabase adapter with mocked network/storage; and the actual React form in a
local browser harness with mocked business services. No test writes to Production.

To enable the PostgreSQL and browser tests, set `SFSTORE_TEST_PG_BIN`,
`SFSTORE_TEST_PG_MODULE`, and `SFSTORE_TEST_PLAYWRIGHT_MODULE` to local installed
test runtimes. `SFSTORE_TEST_BROWSER_CHANNEL` optionally selects an installed
browser. These are test runtimes, not Production database credentials.

Read-only pre-publication check: products 179, attributes 875, images 59, stock
106, inventory movements 32, save operations 0, storage tasks 0. The REST schema
exposes the create/update/version/prepare/resolve/abort/enqueue RPCs.

Focused validation: 92/92 tests passed, including 27 database tests and the
browser scenario. Full suite: 603/603 passed, with no skipped database or browser
tests. TypeScript, modified-file ESLint, production build and diff-check passed.

## Remaining Limits

Storage is not part of PostgreSQL's transaction. Abandoned uploads have durable
reconciliation intent, but executing a reconciliation worker is a separate
phase and must revalidate references and object identity before deletion.
Reloading or leaving the browser discards its in-memory retry request; operation
records and recovery plans remain available server-side for investigation.
Legacy gallery/import writers do not all share the new aggregate locking
protocol; already committed edits are detected by the fingerprint. Migrating
those writers or adding a dedicated recovery UI is not included here.

No Production product, stock, cost, historical record, image or Storage object
was created, modified or removed during automated verification.
