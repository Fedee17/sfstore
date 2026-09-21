import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  getCustomerOrderDisplayName,
  isCustomerOrderEditable,
  type CustomerOrderItemInput,
  type CustomerOrderStatus,
} from "@/lib/orders/workflow";
import {
  addOrderPayment,
  calculateOrderPaymentSummary,
  type OrderPayment,
  type OrderPaymentMethod,
  type OrderPaymentStatus,
} from "@/services/order-payments";

export type CustomerOrderProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: number;
  transfer_price: number | null;
  stock: number;
  status: string;
  categories: { name: string } | null;
};

export type CustomerOrderLine = {
  id: string;
  product_id: string | null;
  product_name: string;
  product_slug: string;
  category_name: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
  created_at: string;
};

export type CustomerOrder = {
  id: string;
  order_number: string;
  channel: "order";
  status: CustomerOrderStatus;
  payment_status: OrderPaymentStatus;
  customer_name: string;
  customer_phone: string | null;
  estimated_date: string | null;
  delivered_at: string | null;
  subtotal: number;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order_items: CustomerOrderLine[];
  order_payments: OrderPayment[];
  inventory_movements?: {
    id: string;
    product_id: string;
    order_item_id: string | null;
    quantity: number;
    previous_stock: number;
    new_stock: number;
    reason: string | null;
    created_at: string;
  }[];
};

export type CustomerOrderListItem = Omit<
  CustomerOrder,
  "order_payments" | "inventory_movements"
> & {
  displayName: string;
  productCount: number;
  totalPaid: number;
  remainingAmount: number;
};

export type CustomerOrderFilters = {
  status?: string;
  paymentStatus?: string;
  search?: string;
  date?: string;
};

type SaveCustomerOrderResult = {
  order_id: string;
  order_number: string;
  operation: "created" | "updated" | "already_applied";
  total: number;
  payment_status: OrderPaymentStatus;
};

type RelationOne<T> = T | T[] | null;

function firstRelation<T>(value: RelationOne<T>) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function paymentSummary(total: number, payments: OrderPayment[]) {
  return calculateOrderPaymentSummary(
    Number(total),
    payments.map((payment) => ({
      amount: Number(payment.amount),
      status: payment.status,
    })),
  );
}

function mapOrderError(message: string) {
  const errors: Record<string, string> = {
    CUSTOMER_ORDER_CUSTOMER_REQUIRED: "Ingresa el nombre del cliente.",
    CUSTOMER_ORDER_NO_ITEMS: "El pedido debe incluir al menos un producto.",
    CUSTOMER_ORDER_DUPLICATE_PRODUCT: "Un producto aparece mas de una vez.",
    CUSTOMER_ORDER_ITEM_INVALID: "Revisa cantidades y precios acordados.",
    CUSTOMER_ORDER_PRODUCT_INACTIVE: "Uno de los productos ya no esta activo.",
    CUSTOMER_ORDER_PRODUCT_NOT_FOUND: "Uno de los productos ya no existe.",
    CUSTOMER_ORDER_NOT_FOUND: "El pedido no existe.",
    CUSTOMER_ORDER_READ_ONLY: "Un pedido entregado o cancelado no puede modificarse.",
    CUSTOMER_ORDER_TOTAL_BELOW_PAID: "El nuevo total no puede ser inferior a lo ya pagado.",
    CUSTOMER_ORDER_TRANSITION_INVALID: "Ese cambio de estado no esta permitido.",
    CUSTOMER_ORDER_NOT_READY: "El pedido debe estar listo antes de entregarlo.",
    CUSTOMER_ORDER_PAYMENT_INCOMPLETE: "El pedido debe estar pagado antes de entregarlo.",
    SALE_INVENTORY_STOCK_INSUFFICIENT: "No hay stock suficiente para entregar el pedido.",
  };
  return Object.entries(errors).find(([code]) => message.includes(code))?.[1];
}

export async function listCustomerOrderProducts() {
  const { data, error } = await getSupabaseAdminClient()
    .from("products")
    .select("id, name, slug, sku, price, transfer_price, stock, status, categories(name)")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) throw new Error("No se pudieron cargar los productos.");

  return (data ?? []).map((product) => ({
    ...product,
    categories: firstRelation(product.categories),
  })) as CustomerOrderProduct[];
}

export async function saveCustomerOrder(input: {
  orderId?: string;
  idempotencyKey?: string;
  createdBy: string;
  customerName: string;
  customerPhone: string;
  estimatedDate: string;
  notes: string;
  items: CustomerOrderItemInput[];
}) {
  const { data, error } = await getSupabaseAdminClient().rpc("save_customer_order", {
    p_order_id: input.orderId || null,
    p_idempotency_key: input.idempotencyKey || null,
    p_created_by: input.createdBy,
    p_customer_name: input.customerName.trim(),
    p_customer_phone: input.customerPhone.trim() || null,
    p_estimated_date: input.estimatedDate || null,
    p_notes: input.notes.trim() || null,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
    })),
  });

  if (error) throw new Error(mapOrderError(error.message) ?? "No se pudo guardar el pedido.");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("La base no devolvio el pedido guardado.");
  }
  return data as SaveCustomerOrderResult;
}

export async function listCustomerOrders(filters: CustomerOrderFilters = {}) {
  let query = getSupabaseAdminClient()
    .from("orders")
    .select(`
      id, order_number, channel, status, payment_status, customer_name,
      customer_phone, estimated_date, delivered_at, subtotal, total, notes,
      created_at, updated_at,
      order_items (id, product_id, product_name, product_slug, category_name, unit_price, quantity, subtotal, created_at),
      order_payments (id, order_id, method, amount, status, reference, notes, paid_at, created_at, updated_at)
    `)
    .eq("channel", "order")
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.paymentStatus) query = query.eq("payment_status", filters.paymentStatus);
  if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
    query = query.gte("created_at", `${filters.date}T00:00:00.000Z`).lt("created_at", `${filters.date}T23:59:59.999Z`);
  }

  const { data, error } = await query;
  if (error) throw new Error("No se pudieron cargar los pedidos.");

  const search = filters.search?.trim().toLocaleLowerCase("es") ?? "";
  return ((data ?? []) as unknown as CustomerOrder[])
    .filter((order) => {
      if (!search) return true;
      const haystack = [
        order.customer_name,
        order.customer_phone,
        order.order_number,
        ...order.order_items.map((item) => item.product_name),
      ].join(" ").toLocaleLowerCase("es");
      return haystack.includes(search);
    })
    .map((order) => {
      const items = [...order.order_items].sort((left, right) => left.created_at.localeCompare(right.created_at));
      const summary = paymentSummary(Number(order.total), order.order_payments);
      const { order_payments: _payments, ...listOrder } = order;
      void _payments;
      return {
        ...listOrder,
        order_items: items,
        displayName: getCustomerOrderDisplayName(order.order_number, items),
        productCount: items.length,
        ...summary,
      } satisfies CustomerOrderListItem;
    });
}

export async function getCustomerOrderById(orderId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, order_number, channel, status, payment_status, customer_name,
      customer_phone, estimated_date, delivered_at, subtotal, total, notes,
      created_at, updated_at,
      order_items (id, product_id, product_name, product_slug, category_name, unit_price, quantity, subtotal, created_at),
      order_payments (id, order_id, method, amount, status, reference, notes, paid_at, created_at, updated_at)
    `)
    .eq("id", orderId)
    .eq("channel", "order")
    .maybeSingle();

  if (error) throw new Error("No se pudo cargar el pedido.");
  if (!data) return null;

  const { data: movements, error: movementError } = await supabase
    .from("inventory_movements")
    .select("id, product_id, order_item_id, quantity, previous_stock, new_stock, reason, created_at")
    .eq("order_id", orderId)
    .eq("movement_type", "sale")
    .order("created_at", { ascending: true });
  if (movementError) throw new Error("No se pudieron cargar los movimientos del pedido.");

  const order = data as unknown as CustomerOrder;
  order.order_items = [...order.order_items].sort((left, right) => left.created_at.localeCompare(right.created_at));
  order.inventory_movements = movements ?? [];
  return { ...order, ...paymentSummary(Number(order.total), order.order_payments) };
}

export async function addCustomerOrderPayment(input: {
  orderId: string;
  method: OrderPaymentMethod;
  amount: number;
  reference: string;
  notes?: string;
}) {
  const { data: order, error } = await getSupabaseAdminClient()
    .from("orders")
    .select("channel, status")
    .eq("id", input.orderId)
    .maybeSingle();

  if (error || !order || order.channel !== "order") {
    throw new Error("El pedido no existe.");
  }
  if (!isCustomerOrderEditable(order.status)) {
    throw new Error("Un pedido entregado o cancelado es de solo lectura.");
  }
  return addOrderPayment({ ...input, status: "approved" });
}

export async function transitionCustomerOrder(orderId: string, nextStatus: CustomerOrderStatus, changedBy: string) {
  const { data, error } = await getSupabaseAdminClient().rpc("transition_customer_order", {
    p_order_id: orderId,
    p_next_status: nextStatus,
    p_changed_by: changedBy,
  });
  if (error) throw new Error(mapOrderError(error.message) ?? "No se pudo cambiar el estado del pedido.");
  return data as { order_id: string; status: CustomerOrderStatus };
}

export async function deliverCustomerOrder(orderId: string, deliveredBy: string) {
  const { data, error } = await getSupabaseAdminClient().rpc("deliver_order", {
    p_order_id: orderId,
    p_delivered_by: deliveredBy,
  });
  if (error) throw new Error(mapOrderError(error.message) ?? "No se pudo entregar el pedido.");
  return data as {
    order_id: string;
    status: "delivered" | "already_delivered";
    inventory: { status: "applied" | "already_applied"; movements_created: number };
  };
}
