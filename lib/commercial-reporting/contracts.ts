/** Read DTOs only. No operational lifecycle or mutation types are widened. */
export type Money = string | number;
export type Origin = "physical_historical" | "physical_current" | "online" | "other";
export type DateQuality = "recorded" | "source_date" | "imputed" | "unknown";
export type OrderRow = {
  id: string; order_number?: string; channel: string; status: string; payment_status: string;
  historical_import: boolean; historical_occurred_on: string | null;
  affects_inventory: boolean; created_at: string;
  subtotal: Money; discount: Money; shipping_cost: Money; total: Money;
  cost_snapshot_policy: string | null;
};
export type SaleLineRow = {
  family_id_snapshot?: string | null; family_name_snapshot?: string | null; sku_snapshot?: string | null; variant_options_snapshot?: Record<string,string> | null;
  id: string; order_id: string; product_id: string | null; product_name: string;
  category_name: string | null; quantity: number; unit_price: Money; subtotal: Money;
  list_unit_price_snapshot: Money | null; unit_cost_snapshot: Money | null;
};
export type PaymentRow = {
  id: string; order_id: string; method: string; store_payment_method: string | null;
  status: string; amount: Money; paid_at: string | null;
};
export type PurchaseRow = {
  id: string; supplier_name_snapshot?: string; total_units?: number; status: string; historical_import: boolean;
  historical_occurred_on: string | null; affects_inventory: boolean;
  purchase_date: string; total_cost: Money; supplier_subtotal: Money; shipping_cost: Money;
};
export type PurchaseLineRow = {
  id: string; purchase_id: string; product_id: string; product_name_snapshot: string;
  quantity: number; unit_purchase_cost: Money; supplier_line_total: Money;
  effective_unit_cost: Money; effective_line_total: Money;
};
export type ProvenanceRow = {
  id: string; batch_id: string; source_sheet: string; source_row: number;
  record_type: string; target_id: string;
};
export type ProductRow = { id: string; category_id: string | null };
export type CommercialSnapshot = {
  orders: OrderRow[]; saleLines: SaleLineRow[]; payments: PaymentRow[];
  purchases: PurchaseRow[]; purchaseLines: PurchaseLineRow[];
  provenance: ProvenanceRow[]; products: ProductRow[];
  batches: { id: string; source_sha256: string }[];
};
export type EvidencePolicy = {
  version: string;
  excludedOrderIds: readonly string[]; excludedPurchaseIds: readonly string[];
  excludedProductIds: readonly string[]; excludedCategoryIds: readonly string[];
  exclusionCoverage: "known_fixtures_only" | "reviewed_complete";
  sourceBatches: readonly { id: string; sha256: string }[];
  imputedPurchases: readonly { batchId: string; sheet: string; rows: readonly number[] }[];
};
export type SaleFact = {
  id: string; origin: Origin; original: OrderRow; lines: SaleLineRow[]; payments: PaymentRow[];
  occurredOn: string; dateQuality: DateQuality; provenance: ProvenanceRow | null;
  excluded: boolean; exclusionReasons: string[]; issues: string[];
  registered: boolean; confirmed: boolean;
  totalCents: number; approvedCents: number; pendingCents: number;
  lineCosts: { lineId: string; unitCostCents: number | null;
    evidence: "stored_positive_snapshot" | "unknown" | "zero_requires_evidence" | "unverified_snapshot" }[];
  linesWithVerifiedCost: number; linesWithUnknownCost: number;
  verifiedCostCents: number; revenueWithVerifiedCostCents: number;
  partialGrossMarginCents: number | null;
};
export type PurchaseFact = {
  id: string; original: PurchaseRow; lines: PurchaseLineRow[];
  origin: "historical" | "current"; occurredOn: string; dateQuality: DateQuality;
  provenance: ProvenanceRow | null; excluded: boolean; exclusionReasons: string[];
  recognized: boolean; totalCents: number;
};
export type ReceiptFact = {
  id: string; orderId: string; method: string; amountCents: number;
  paidAt: string | null; occurredOn: string | null; origin: Origin;
  dateQuality: "recorded" | "unknown"; parentCancelled: boolean;
};
export type MonthReport = {
  month: string; timeZone: "America/Argentina/Buenos_Aires";
  evidenceVersion: string; provisional: boolean;
  consistency: "best_effort_multi_select_not_transaction_snapshot";
  sales: SaleFact[]; purchases: PurchaseFact[];
  /** Receipts in this cash month, even if their order was registered earlier. */
  datedReceipts: ReceiptFact[];
  /** Undated receipts attributed to selected sales, NOT a cash date. */
  undatedReceiptsAttributedToSales: ReceiptFact[];
  totals: {
    registeredSalesCents: number; confirmedSalesCents: number;
    approvedPaymentsForSalesCents: number; pendingForSalesCents: number;
    datedReceiptsCents: number; undatedApprovedForSalesCents: number;
    purchasesCents: number; imputedPurchasesCents: number; unknownDatePurchasesCents: number;
  };
  paymentMethodsForSales: { method: string; amountCents: number; distinctOrders: number }[];
  paymentMethodsForDatedReceipts: { method: string; amountCents: number; distinctOrders: number }[];
  exclusions: { sales: number; purchases: number };
  warnings: string[];
};
