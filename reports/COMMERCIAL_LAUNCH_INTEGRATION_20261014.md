# SFSTORE — integration of commercial pricing and UI

Local review candidate on codex/commercial-launch-integration-20261013, base 4300d11 (PR7 chain). UI source: draft PR8 commit 0221431. No merge, push, deployment or Production changes.

## Price authority and cause

The importer reads independently supplied price and discounted-price columns. Its preview validates positive amounts and discounted < list; it does not require a 25% ratio. Mates additionally preserves its existing source-column interpretation. The legacy public service/helper displayed transfer_price directly. PAY01 instead calculates round(products.price * 0.75, 2), so list100/stored80 produced a disagreement.

The order RPC remains authoritative: IDs/quantities are accepted, client amounts are discarded, current list is read, 75% is rounded per unit, and the resulting order price is frozen. lib/web-transfer-pricing.ts mirrors that cent rounding for public presentation. Catalog, product page, related cards, persisted cart and checkout summary now use the same contract even if transfer_price is inconsistent or absent. Internal/imported prices are preserved and no mass updates are proposed. The approved cash/transfer discount is 25%; this patch enforces the public web contract. Web remains transfer-only; internal manual POS workflows and stored prices were not changed.

Regressions: 100 ->75; 100.01 ->75.01; 1.34 ->1.01; stale/null stored price; preserved importer preview; quantity totals. A real local fixture with list100.01, stored80.03, quantity2 showed 75.01 and150.02; database subtotal200.02/discount50/total150.02. Stored80.03 remained unchanged.

## UI integration

Both supplied patches were applied/checked on their exact prepared base and compared to the candidate. Header includes GET search, preserved query, mobile/keyboard menus, Escape, cart and prefetch=false protections. Vercel resolution preserves all seven existing blocked branches and adds only the UI branch. No automatic deployment was activated. Compatible search/help, cart feedback/limits, responsive layouts and image fallbacks were incorporated. Reports/screenshots/private configuration from the UI branch were not copied.

Unsupported cash/card promotional text was adapted to the web transfer contract. Cent amounts stay visible. Home catalog is rendered at request time rather than frozen during build. Production never substitutes demo products for failure/empty catalog; unknown/missing product and unavailable quantity are rejected by the server.

## Validation

Clean npm ci on the unchanged lockfile; build and TypeScript passed; ESLint0 errors/9 warnings. Complete application suite738 tests:729 pass,0 fail,9 skips. Gitleaks public source scan:0 findings. git diff --check passed.

Five viewport browser runs (320,390,430,768,1440) passed navigation/search/cart persistence/checkout/admin redirect without creating orders. The real local commercial run passed31 checks with a genuine development Turnstile token: guest Auth/cookies; catalog->product->cart->checkout; lost response after committed order and idempotent retry; one stock deduction;24h; frozen total; protected proof; rejection of partial payment; full RPC confirmation and repeat; paid stock retained; confirmed receipt; guest denied administrator.

Additional5 local DB checks rejected nonexistent product and unavailable quantity without creating customers/orders or changing inventory. Confirmation was a restricted service-role RPC using an existing allowlisted synthetic administrator; admin UI login was not repeated and this does not certify Production banking accreditation. No funds were transferred. All records/files created by the run are synthetic local data.

## Outstanding launch gates

Fresh bounded preconditions of the Production schema/permissions at an explicitly authorized cutover; authorized domain/Auth/Turnstile/private bucket configuration; coordinated Vercel/DB cutover with old tabs failing closed/reloading; explicit SQL/merge/deployment authorization. Keep Cron and ClickUp inactive. Existing dependency advisories remain a separate baseline risk: the lockfile was not changed or automatically fixed in this task.
