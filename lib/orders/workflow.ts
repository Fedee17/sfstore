export const CUSTOMER_ORDER_STATUSES = [
  "pending",
  "ordered",
  "ready",
  "delivered",
  "cancelled",
] as const;

export type CustomerOrderStatus = (typeof CUSTOMER_ORDER_STATUSES)[number];

export const CUSTOMER_ORDER_STATUS_LABELS: Record<CustomerOrderStatus, string> = {
  pending: "Pendiente",
  ordered: "Encargado",
  ready: "Listo para entregar",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export const CUSTOMER_ORDER_TRANSITIONS: Record<CustomerOrderStatus, CustomerOrderStatus[]> = {
  pending: ["ordered", "cancelled"],
  ordered: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export type CustomerOrderItemInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export function normalizeOrderMoney(value: number) {
  if (!Number.isFinite(value)) throw new Error("El importe no es valido.");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateCustomerOrderItems(items: CustomerOrderItemInput[]) {
  if (items.length === 0) throw new Error("El pedido debe incluir al menos un producto.");
  const seen = new Set<string>();

  return items.map((item) => {
    const productId = item.productId.trim();
    const quantity = Math.trunc(item.quantity);
    const unitPrice = normalizeOrderMoney(item.unitPrice);
    if (!productId) throw new Error("Hay un producto incompleto en el pedido.");
    if (seen.has(productId)) throw new Error("Un producto aparece mas de una vez.");
    if (!Number.isInteger(item.quantity) || quantity <= 0) {
      throw new Error("Las cantidades deben ser enteras mayores que cero.");
    }
    if (unitPrice <= 0) throw new Error("El precio acordado debe ser mayor que cero.");
    seen.add(productId);
    return { productId, quantity, unitPrice };
  });
}

export function getCustomerOrderDisplayName(
  orderNumber: string,
  items: { product_name: string }[],
) {
  const firstName = items[0]?.product_name?.trim();
  if (!firstName) return orderNumber;
  if (items.length === 1) return firstName;
  const extra = items.length - 1;
  return `${firstName} + ${extra} ${extra === 1 ? "producto" : "productos"}`;
}

export function getWhatsAppUrl(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export function isCustomerOrderEditable(status: string) {
  return status !== "delivered" && status !== "cancelled";
}
