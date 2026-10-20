import { createHash } from "node:crypto";
import { calculatePurchaseDraft, centsToDatabaseMoney, parseMoneyToCents } from "./calculation.ts";

type Money = string | number;
export type AcquisitionLine = {
  id: string; product_id: string; product_name_snapshot: string; quantity: number; unit_purchase_cost: Money;
  supplier_line_total: Money; allocated_shipping_total: Money;
  effective_line_total: Money; effective_unit_cost: Money;
};
export type ChargerAcquisition = {
  id: string; status: string; total_units: number; shipping_cost: Money;
  supplier_subtotal: Money; total_cost: Money; purchase_items?: AcquisitionLine[];
};
const cents = (v: Money) => parseMoneyToCents(String(v));

/** Approved recipe only: 20 complete sets become 20 heads + 10 C/C + 10 C/Lightning.
 * This builds an immutable proposal; it has no persistence or inventory gateway.
 * Shipping is reclassified over ALL 49 pieces, not added to the old allocation.
 */
export function planChargerComponents(purchase: ChargerAcquisition, sourceLineId: string) {
  if (purchase.status !== "confirmed" || purchase.total_units !== 29 || purchase.purchase_items?.length !== 2) {
    throw new Error("La simulación requiere la compra confirmada de 20 conjuntos y otras 9 unidades.");
  }
  const source = purchase.purchase_items.find(i => i.id === sourceLineId);
  const other = purchase.purchase_items.find(i => i.id !== sourceLineId);
  if (!source || !other || source.quantity !== 20 || other.quantity !== 9 || source.product_id === other.product_id
    || !/cargador/i.test(source.product_name_snapshot) || !/vape/i.test(other.product_name_snapshot)) {
    throw new Error("Elegí la línea de los 20 cargadores completos; la otra debe conservar sus 9 unidades.");
  }
  const shipping = cents(purchase.shipping_cost);
  const sourceSupplier = cents(source.supplier_line_total);
  const otherSupplier = cents(other.supplier_line_total);
  for (const line of [source, other]) {
    if (cents(line.unit_purchase_cost) * line.quantity !== cents(line.supplier_line_total)
      || cents(line.supplier_line_total) + cents(line.allocated_shipping_total) !== cents(line.effective_line_total)
      || Math.round(cents(line.effective_line_total) / line.quantity) !== cents(line.effective_unit_cost)) {
      throw new Error("Los importes originales de la línea no reconcilian. No se genera una propuesta.");
    }
  }
  if (sourceSupplier + otherSupplier !== cents(purchase.supplier_subtotal)
    || cents(source.allocated_shipping_total) + cents(other.allocated_shipping_total) !== shipping
    || sourceSupplier + otherSupplier + shipping !== cents(purchase.total_cost)) {
    throw new Error("Los totales de la compra no reconcilian. No se genera una propuesta.");
  }
  // Dividing the supplier's unit cost by two may produce half a cent.
  // Preserve supplier totals using whole cents; unit residual stays explicit.
  const headSupplier = sourceSupplier / 2;
  if (!Number.isSafeInteger(headSupplier) || !Number.isSafeInteger(headSupplier / 2)) {
    throw new Error("El reparto 50/50 y entre los cables requiere una asignación residual adicional no contemplada por esta compra.");
  }
  const basis = [
    { key: "head", quantity: 20, supplier: headSupplier },
    { key: "cable-c-c", quantity: 10, supplier: headSupplier / 2 },
    { key: "cable-c-lightning", quantity: 10, supplier: headSupplier / 2 },
    { key: "other", quantity: 9, supplier: otherSupplier },
  ];
  // Reuse the existing deterministic shipping allocator. Supplier totals are
  // authoritative because split unit costs can contain half cents.
  const allocation = calculatePurchaseDraft({
    shippingCost: centsToDatabaseMoney(shipping),
    lines: basis.map(b => ({ productId: b.key, quantity: b.quantity, unitPurchaseCost: "0" })),
  });
  const lines = basis.map(b => {
    const allocated = allocation.lines.find(l => l.productId === b.key)!;
    const total = b.supplier + allocated.allocatedShippingTotalCents;
    const unit = Number((BigInt(total) + BigInt(Math.floor(b.quantity / 2))) / BigInt(b.quantity));
    return {
      ...b, shipping: allocated.allocatedShippingTotalCents, total, unit,
      residual: total - unit * b.quantity,
    };
  });
  const componentTotal = lines.filter(l => l.key !== "other").reduce((s, l) => s + l.total, 0);
  const otherTotal = lines.find(l => l.key === "other")!.total;
  const originalSourceTotal = cents(source.effective_line_total);
  const originalOtherTotal = cents(other.effective_line_total);
  if (componentTotal + otherTotal !== cents(purchase.total_cost)
    || componentTotal - originalSourceTotal + otherTotal - originalOtherTotal !== 0) {
    throw new Error("La reclasificación no conserva el valor original.");
  }
  const original = {
    purchaseId: purchase.id, totalUnits: purchase.total_units, shipping,
    supplierSubtotal: cents(purchase.supplier_subtotal), total: cents(purchase.total_cost),
    source: { id: source.id, productId: source.product_id, quantity: 20, total: originalSourceTotal, unit: cents(source.effective_unit_cost), shipping: cents(source.allocated_shipping_total) },
    other: { id: other.id, productId: other.product_id, quantity: 9, total: originalOtherTotal, unit: cents(other.effective_unit_cost), shipping: cents(other.allocated_shipping_total) },
  };
  const plan = {
    policy: "charger-components-50-50-shipping-49-v1", original, physicalPieces: 49, lines,
    componentTotal, otherTotal,
    componentReclassification: componentTotal - originalSourceTotal,
    otherReclassification: otherTotal - originalOtherTotal,
    unitResidual: lines.reduce((s, l) => s + l.residual, 0),
    originalUnitResidual: original.total - original.source.unit * 20 - original.other.unit * 9,
    stockProposal: { sourceSetsToConsume: 20, headsToAdd: 20, cableCCToAdd: 10, cableLightningToAdd: 10, otherUnitsToChange: 0 },
    salePricesApproved: false,
  };
  return { ...plan, fingerprint: createHash("sha256").update(JSON.stringify(plan)).digest("hex") };
}
export type ChargerComponentPlan = ReturnType<typeof planChargerComponents>;
