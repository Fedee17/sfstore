export type PurchaseStatus = "draft" | "confirmed" | "cancelled";

export function assertPurchaseIsDraft(status: PurchaseStatus) {
  if (status !== "draft") {
    throw new Error("Solo se pueden modificar compras en borrador.");
  }
}
