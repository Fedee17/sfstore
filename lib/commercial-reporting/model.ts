import type {
  CommercialSnapshot, EvidencePolicy, Origin, DateQuality, ProvenanceRow,
  SaleFact, PurchaseFact, ReceiptFact, MonthReport,
} from "./contracts.ts";
import { moneyCents, sumCents } from "./money.ts";
import { commercialDate, sourceDate, validateMonth, COMMERCIAL_TIME_ZONE } from "./periods.ts";

function indexUnique<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const row of rows) {
    if (!row.id || index.has(row.id)) throw new Error("COMMERCIAL_DUPLICATE_ID");
    index.set(row.id, row);
  }
  return index;
}
function grouped<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = result.get(k);
    if (group) group.push(row); else result.set(k, [row]);
  }
  return result;
}
function origin(historical: boolean, channel: string): Origin {
  if (historical) return "physical_historical";
  return channel === "store" ? "physical_current" : channel === "web" ? "online" : "other";
}
function byMethod(rows: readonly ReceiptFact[]) {
  const groups = grouped(rows, row => row.method);
  return [...groups].map(([method, payments]) => ({
    method, amountCents: sumCents(payments.map(p => p.amountCents)),
    distinctOrders: new Set(payments.map(p => p.orderId)).size,
  })).sort((a, b) => a.method.localeCompare(b.method));
}

/** Pure projection. Never modifies source arrays or invokes commercial RPCs. */
export function buildCommercialFacts(input: CommercialSnapshot, policy: EvidencePolicy) {
  // Fail instead of quietly producing numbers from duplicate pages or orphan joins.
  for (const values of Object.values(input)) indexUnique<{ id: string }>(values);
  const orders = indexUnique(input.orders), purchases = indexUnique(input.purchases);
  for (const line of input.saleLines) {
    if (!orders.has(line.order_id)) throw new Error("COMMERCIAL_ORPHAN_SALE_LINE");
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new Error("COMMERCIAL_INVALID_QUANTITY");
  }
  for (const p of input.payments) if (!orders.has(p.order_id)) throw new Error("COMMERCIAL_ORPHAN_PAYMENT");
  for (const line of input.purchaseLines) {
    if (!purchases.has(line.purchase_id)) throw new Error("COMMERCIAL_ORPHAN_PURCHASE_LINE");
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new Error("COMMERCIAL_INVALID_QUANTITY");
  }
  const products = indexUnique(input.products);
  const excludedProducts = new Set(policy.excludedProductIds);
  const excludedCategories = new Set(policy.excludedCategoryIds);
  const excludedOrders = new Set(policy.excludedOrderIds);
  const excludedPurchases = new Set(policy.excludedPurchaseIds);
  const validBatches = new Set(policy.sourceBatches.filter(b => input.batches.some(x =>
    x.id === b.id && x.source_sha256 === b.sha256)).map(b => b.id));
  const provenance = new Map<string, ProvenanceRow>();
  for (const p of input.provenance) {
    const key = `${p.record_type}:${p.target_id}`;
    if (provenance.has(key)) throw new Error("COMMERCIAL_AMBIGUOUS_PROVENANCE");
    provenance.set(key, p);
  }
  function quality(historical: boolean, p: ProvenanceRow | null, purchase: boolean): DateQuality {
    if (!historical) return "recorded";
    if (!p || !validBatches.has(p.batch_id)) return "unknown";
    if (purchase && policy.imputedPurchases.some(x => x.batchId === p.batch_id &&
        x.sheet === p.source_sheet && x.rows.includes(p.source_row))) return "imputed";
    return "source_date";
  }
  function reasons(id: string, productIds: (string | null)[], type: "sale" | "purchase") {
    const result: string[] = [];
    if ((type === "sale" ? excludedOrders : excludedPurchases).has(id)) result.push("EXACT_OPERATION_ID");
    if (productIds.some(p => p && excludedProducts.has(p))) result.push("EXACT_SYNTHETIC_PRODUCT_ID");
    if (productIds.some(p => p && excludedCategories.has(products.get(p)?.category_id ?? ""))) {
      result.push("EXACT_SYNTHETIC_CATEGORY_ID");
    }
    return result;
  }
  const linesByOrder = grouped(input.saleLines, x => x.order_id);
  const paymentsByOrder = grouped(input.payments, x => x.order_id);
  const linesByPurchase = grouped(input.purchaseLines, x => x.purchase_id);
  const allSales: SaleFact[] = input.orders.map(order => {
    const lines = linesByOrder.get(order.id) ?? [], payments = paymentsByOrder.get(order.id) ?? [];
    const p = provenance.get(`sale:${order.id}`) ?? null;
    const dateQuality = quality(order.historical_import, p, false);
    const occurredOn = order.historical_import ? sourceDate(order.historical_occurred_on) : commercialDate(order.created_at);
    const exclusionReasons = reasons(order.id, lines.map(l => l.product_id), "sale");
    const totalCents = moneyCents(order.total), shipping = moneyCents(order.shipping_cost);
    const approvedCents = sumCents(payments.filter(p => p.status === "approved").map(p => moneyCents(p.amount)));
    const issues: string[] = [];
    const cancelled = order.status === "cancelled";
    const claimedPaid = ["paid", "approved"].includes(order.payment_status) || ["paid", "completed"].includes(order.status);
    if (claimedPaid && approvedCents !== totalCents) issues.push("PAID_STATE_WITHOUT_EXACT_APPROVED_PAYMENT");
    if (!claimedPaid && approvedCents >= totalCents && totalCents > 0) issues.push("PAYMENT_STATE_REQUIRES_REVIEW");
    if (approvedCents > totalCents) issues.push("APPROVED_OVERPAYMENT");
    if (payments.some(p => p.status === "refunded") || order.payment_status === "refunded") issues.push("REFUND_NET_NOT_CERTIFIED");
    if (!lines.length) issues.push("NO_SALE_LINES");
    const linesNet = sumCents(lines.map(l => moneyCents(l.subtotal)));
    if (linesNet + shipping !== totalCents) issues.push("LINES_HEADER_NET_NOT_RECONCILED");
    if (order.historical_import && order.affects_inventory) throw new Error("COMMERCIAL_HISTORICAL_INVENTORY_CONTRACT_VIOLATION");
    const verifiedLines = lines.filter(l => l.unit_cost_snapshot !== null &&
      moneyCents(l.unit_cost_snapshot) > 0 && order.cost_snapshot_policy === "current_product_cost_at_sale_v1");
    const verifiedCostCents = sumCents(verifiedLines.map(l => moneyCents(l.unit_cost_snapshot!) * l.quantity));
    const revenueWithVerifiedCostCents = sumCents(verifiedLines.map(l => moneyCents(l.subtotal)));
    const confirmed = !cancelled && totalCents > 0 && claimedPaid && approvedCents === totalCents &&
      !issues.includes("REFUND_NET_NOT_CERTIFIED");
    return {
      id: order.id, origin: origin(order.historical_import, order.channel), original: order,
      lines, payments, occurredOn, dateQuality, provenance: p, excluded: exclusionReasons.length > 0,
      exclusionReasons, issues, registered: !cancelled, confirmed, totalCents, approvedCents,
      pendingCents: cancelled ? 0 : Math.max(0, totalCents - approvedCents),
      lineCosts: lines.map(l => ({
        lineId: l.id, unitCostCents: l.unit_cost_snapshot === null ? null : moneyCents(l.unit_cost_snapshot),
        evidence: l.unit_cost_snapshot === null ? "unknown" as const
          : moneyCents(l.unit_cost_snapshot) === 0 ? "zero_requires_evidence" as const
          : verifiedLines.includes(l) ? "stored_positive_snapshot" as const : "unverified_snapshot" as const,
      })),
      linesWithVerifiedCost: verifiedLines.length, linesWithUnknownCost: lines.length - verifiedLines.length,
      verifiedCostCents, revenueWithVerifiedCostCents,
      partialGrossMarginCents: confirmed && verifiedLines.length > 0 && !issues.includes("LINES_HEADER_NET_NOT_RECONCILED")
        ? revenueWithVerifiedCostCents - verifiedCostCents : null,
    };
  });
  const allPurchases: PurchaseFact[] = input.purchases.map(purchase => {
    const lines = linesByPurchase.get(purchase.id) ?? [], p = provenance.get(`purchase:${purchase.id}`) ?? null;
    if (purchase.historical_import && purchase.affects_inventory) throw new Error("COMMERCIAL_HISTORICAL_INVENTORY_CONTRACT_VIOLATION");
    const exclusionReasons = reasons(purchase.id, lines.map(l => l.product_id), "purchase");
    return {
      id: purchase.id, original: purchase, lines, origin: purchase.historical_import ? "historical" : "current",
      occurredOn: sourceDate(purchase.historical_import ? purchase.historical_occurred_on : purchase.purchase_date),
      dateQuality: quality(purchase.historical_import, p, true), provenance: p,
      excluded: exclusionReasons.length > 0, exclusionReasons,
      recognized: ["historical", "confirmed"].includes(purchase.status), totalCents: moneyCents(purchase.total_cost),
    };
  });
  const saleIndex = new Map(allSales.map(s => [s.id, s]));
  const receipts: ReceiptFact[] = input.payments.filter(p => p.status === "approved" && !saleIndex.get(p.order_id)!.excluded)
    .map(p => {
      const sale = saleIndex.get(p.order_id)!;
      return { id: p.id, orderId: p.order_id, method: p.store_payment_method ?? p.method,
        amountCents: moneyCents(p.amount), paidAt: p.paid_at,
        occurredOn: p.paid_at === null ? null : commercialDate(p.paid_at),
        origin: sale.origin, dateQuality: p.paid_at === null ? "unknown" : "recorded",
        parentCancelled: sale.original.status === "cancelled",
      };
    });
  return { sales: allSales, purchases: allPurchases, receipts };
}

export function buildCommercialMonth(input: CommercialSnapshot, month: string, policy: EvidencePolicy): MonthReport {
  return buildCommercialMonthFromFacts(buildCommercialFacts(input, policy), month, policy);
}

/** Shared monthly selection: a multi-month dashboard projects its snapshot only once. */
export function buildCommercialMonthFromFacts(facts: ReturnType<typeof buildCommercialFacts>, month: string, policy: EvidencePolicy): MonthReport {
  validateMonth(month);
  const { sales: allSales, purchases: allPurchases, receipts } = facts;
  const selectedSales = allSales.filter(s => s.occurredOn.slice(0, 7) === month);
  const selectedPurchases = allPurchases.filter(p => p.occurredOn.slice(0, 7) === month);
  const sales = selectedSales.filter(s => !s.excluded), ps = selectedPurchases.filter(p => !p.excluded && p.recognized);
  const selectedIds = new Set(sales.map(s => s.id));
  const paymentsForSales = receipts.filter(p => selectedIds.has(p.orderId));
  const datedReceipts = receipts.filter(p => p.occurredOn?.slice(0, 7) === month);
  const undatedReceiptsAttributedToSales = paymentsForSales.filter(p => p.occurredOn === null);
  return {
    month, timeZone: COMMERCIAL_TIME_ZONE, evidenceVersion: policy.version,
    provisional: policy.exclusionCoverage !== "reviewed_complete",
    consistency: "best_effort_multi_select_not_transaction_snapshot",
    // Excluded rows stay visible for diagnostics, but never contribute to totals.
    sales: selectedSales, purchases: selectedPurchases, datedReceipts, undatedReceiptsAttributedToSales,
    totals: {
      registeredSalesCents: sumCents(sales.filter(s => s.registered).map(s => s.totalCents)),
      confirmedSalesCents: sumCents(sales.filter(s => s.confirmed).map(s => s.totalCents)),
      approvedPaymentsForSalesCents: sumCents(paymentsForSales.map(p => p.amountCents)),
      pendingForSalesCents: sumCents(sales.map(s => s.pendingCents)),
      datedReceiptsCents: sumCents(datedReceipts.map(p => p.amountCents)),
      undatedApprovedForSalesCents: sumCents(undatedReceiptsAttributedToSales.map(p => p.amountCents)),
      purchasesCents: sumCents(ps.map(p => p.totalCents)),
      imputedPurchasesCents: sumCents(ps.filter(p => p.dateQuality === "imputed").map(p => p.totalCents)),
      unknownDatePurchasesCents: sumCents(ps.filter(p => p.dateQuality === "unknown").map(p => p.totalCents)),
    },
    paymentMethodsForSales: byMethod(paymentsForSales), paymentMethodsForDatedReceipts: byMethod(datedReceipts),
    exclusions: { sales: selectedSales.filter(s => s.excluded).length, purchases: selectedPurchases.filter(p => p.excluded).length },
    warnings: [
      "APPROVED_LEDGER_AMOUNTS_NOT_CERTIFIED_NET_OF_REFUNDS",
      "MULTI_SELECT_READ_NOT_A_GLOBAL_DATABASE_SNAPSHOT",
      ...(policy.exclusionCoverage === "reviewed_complete" ? [] : ["ONLY_KNOWN_SYNTHETIC_IDENTIFIERS_REVIEWED"]),
      ...(undatedReceiptsAttributedToSales.length ? ["UNDATED_RECEIPTS_ATTRIBUTED_TO_SALE_MONTH_NOT_CASH_MONTH"] : []),
      ...(sales.some(s => s.linesWithUnknownCost > 0) ? ["MARGIN_COVERAGE_INCOMPLETE"] : []),
      ...(sales.some(s => s.issues.length) ? ["SALE_RECONCILIATION_ISSUES"] : []),
      ...([...sales, ...ps].some(x => x.dateQuality === "unknown") ? ["DATE_PROVENANCE_UNVERIFIED"] : []),
    ],
  };
}
