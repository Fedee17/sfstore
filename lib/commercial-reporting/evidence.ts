import type { EvidencePolicy } from "./contracts.ts";

/** Reviewed identifiers only: no customers, auth users, credentials or private reports. */
export const COMMERCIAL_EVIDENCE: EvidencePolicy = {
  version: "2026-10-17-phase2a-v1",
  // Registry from the authorized 2026-10-16 acceptance, not name-based matching.
  excludedOrderIds: ["349d9f2a-d7dc-4ea8-bb11-75499cb59e18"],
  excludedPurchaseIds: [],
  excludedProductIds: [
    "9f8334ac-4a0d-42c9-975e-f580c564a0d5",
    "9d779bd4-b545-4f6e-a984-580d29015de9",
  ],
  excludedCategoryIds: [
    "c4a8867a-e2dc-45dd-9040-d649f85aa97d",
    "2bee1ca8-c78e-4815-8d03-8a32823f0ced",
  ],
  // This is not an assertion that all future/unknown fixtures are inventoried.
  exclusionCoverage: "known_fixtures_only",
  sourceBatches: [{
    id: "dc3c0509-4eb4-4808-aedc-c426e5773d7d",
    sha256: "26c184c27fb8d86835fa1ca47df49c6e3e6dbc0f0a68fa46925fdd065191fcc2",
  }],
  imputedPurchases: [{
    batchId: "dc3c0509-4eb4-4808-aedc-c426e5773d7d",
    sheet: "Control de compras", rows: [154, 155, 156, 157, 158, 159],
  }],
};
