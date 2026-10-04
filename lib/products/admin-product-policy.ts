export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export function assertProductStatusTransition({
  currentStatus,
  nextStatus,
  historicalIdentity,
}: {
  currentStatus: ProductStatus;
  nextStatus: ProductStatus;
  historicalIdentity: boolean;
}) {
  if (historicalIdentity) {
    throw new Error("Las identidades historicas no admiten modificaciones operativas.");
  }

  if (!PRODUCT_STATUSES.includes(currentStatus) || !PRODUCT_STATUSES.includes(nextStatus)) {
    throw new Error("Estado de producto invalido.");
  }

  return nextStatus;
}

function moneyToCents(value: number | null) {
  return value === null ? null : Math.round(value * 100);
}

export function shouldClearCostSource(
  currentCost: number | null,
  nextCost: number | null,
) {
  return moneyToCents(currentCost) !== moneyToCents(nextCost);
}
