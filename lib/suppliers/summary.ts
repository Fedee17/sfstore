export type SupplierPurchaseSummaryInput = {
  status: "draft" | "confirmed" | "cancelled";
  total_cost: number | string;
  total_units: number;
  purchase_date: string;
  created_at: string;
};

export type SupplierPurchaseSummary = {
  purchaseCount: number;
  confirmedPurchaseCount: number;
  lastPurchaseDate: string | null;
  totalPurchased: number;
  totalUnits: number;
};

export function summarizeSupplierPurchases(
  purchases: readonly SupplierPurchaseSummaryInput[],
): SupplierPurchaseSummary {
  const confirmed = purchases.filter((purchase) => purchase.status === "confirmed");
  const mostRecent = [...purchases].sort(
    (left, right) =>
      right.purchase_date.localeCompare(left.purchase_date) ||
      right.created_at.localeCompare(left.created_at),
  )[0];

  return {
    purchaseCount: purchases.length,
    confirmedPurchaseCount: confirmed.length,
    lastPurchaseDate: mostRecent?.purchase_date ?? null,
    totalPurchased: confirmed.reduce(
      (total, purchase) => total + Number(purchase.total_cost),
      0,
    ),
    totalUnits: confirmed.reduce(
      (total, purchase) => total + Number(purchase.total_units),
      0,
    ),
  };
}
