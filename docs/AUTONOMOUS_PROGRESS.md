# SFSTORE — autonomous maintenance checkpoint

Updated: 2026-10-10 UTC
Repository: `Fedee17/sfstore`
Default branch: `main` at `7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6`
Working branch: `codex/autonomous-maintenance` (previous checkpoint: `6a2db23d794a98a02a921299628d3fa1f4f9e56c`)

## Functional objective and current state

Stabilize product persistence and Storage cleanup without modifying Production or changing business rules.

- Atomic product-save integration (Phase B) is on `main`.
- The existing Storage-task processor from `codex/product-storage-task-processor` was consolidated into the maintenance branch by merge commit `6a2db23`. **Do not reimplement it.**
- The processor is deliberately manual, supports dry-run and apply, rejects Production CLI targets, and is not scheduled or deployed.
- `supabase/migrations/202610100001_product_storage_task_results.sql` adds a task result column and has **not** been applied by this automation.
- No open PR was found when checking GitHub on 2026-10-10. Verify again before creating a PR.

## Completed work / evidence

- Product save RPCs and supporting tables documented in `reports/atomic-product-save-phase-b.md`.
- Storage processor: `lib/products/storage-task-processor.ts`, `scripts/process-product-storage-tasks.ts`, `tests/product-storage-task-processor.test.mjs`; implementation and caveats documented in `reports/product-storage-task-processor.md`.
- The processor report records 621 tests (620 passed, 1 skipped, 0 failed), successful TypeScript and build checks, and scoped lint/diff checks **at the time of that implementation**. These are historical, not independently rerun in this maintenance execution.
- GitHub showed a successful Vercel commit status on `6a2db23`. This does not establish that the full local test suite or lint passed.

## Reproducible errors / unresolved verification

- The Storage processor report identifies 9 ESLint errors and 11 warnings in the then-current global lint run, outside its changed files. Confirm against the current checkout before fixing.
- Suspected lint locations from the report: `app/checkout/{exito,fallo,pendiente}/page.tsx`, `app/producto/[slug]/page.tsx`, `components/site-header.tsx` (internal links) and `app/checkout/page.tsx` (react-hooks/immutability).
- No new P1 data-loss or authorization bug has been reproduced in this execution.
- No local checkout with installed `node_modules` and PostgreSQL test binaries is available in this task environment. Consequently **no fresh lint, TypeScript, build or test run occurred here**.
- `AGENTS.md` requires consulting the applicable local Next.js 16 documentation under `node_modules/next/dist/docs/` before writing application code.

## Backlog

- **P1:** Reproduce and prioritize any confirmed authorization, payment, data-loss or unsafe Storage deletion issue. None newly confirmed.
- **P2:** Run current lint, tests, `tsc --noEmit`, build and `git diff --check`; fix confirmed lint failures without altering checkout behavior.
- **P2:** Review Storage worker on a synthetic local/staging database, including concurrent saves, legacy writers, failure recovery and migration compatibility. Preserve the existing worker.
- **P2:** Review sales/inventory/checkout consistency with synthetic tests; fix only reproducible issues.
- **P3:** Catalog, admin UX, SEO and documentation cleanup after P1/P2 stabilization.

## Confirmed decisions / restrictions

- No real customer, commercial or Production data in tests; no secrets committed.
- No Production deployments, merges, payments, external communications, destructive cleanup or force pushes.
- Supabase Production may be read safely, but migrations and sensitive SQL are **manual user actions**. Never use `supabase db push`.
- **DATA_WRITE_APPROVAL_REQUIRED:** before using the Storage worker against any Production target, separately review and manually apply `supabase/migrations/202610100001_product_storage_task_results.sql` in the authorized SQL Editor. The current CLI intentionally does not support Production; do not bypass that safeguard without a separate approved design.
- The Phase B authenticated manual test can remain pending; it does not block independent safe work.
- Preserve others' changes; no automatic merging.

## Validation commands (discover current equivalents in package.json)

```sh
npm run lint
npx tsc --noEmit
npm run build
node --test tests/*.test.mjs
git diff --check
```

For PostgreSQL-backed Storage tests, follow `reports/product-storage-task-processor.md` and use ephemeral synthetic local fixtures only. The report specifies `SFSTORE_TEST_PG_BIN` and optionally `SFSTORE_TEST_PG_MODULE`.

## Latest checkpoint and next safe step

Checkpoint: verified `main`, `codex/autonomous-maintenance`, no open PR, `AGENTS.md`, `package.json`, Storage worker, tests, and implementation report through the GitHub connector. A local `git clone` attempt failed because the runtime could not resolve `github.com`; this is an environment limitation, not a repository failure.

Next: obtain a Codex checkout with installed dependencies; read the local Next.js guides required by `AGENTS.md`; rerun validations and reproduce lint failures. Fix small verified P2 issues with tests, update this checkpoint, commit and push without rewriting history. Keep at most one draft PR targeting `main`, with validation gaps clearly disclosed. Do not repeat the Storage implementation or touch Production.
