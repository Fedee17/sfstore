import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getStoreSaleDisplayName } from "@/lib/store-sales";
import { addOrderPayment, type OrderPayment } from "@/services/order-payments";

export type StoreSaleProduct = {
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

export type StoreSaleLine = {
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

export type StoreSale = {
  id: string;
  order_number: string;
  channel: "store";
  status: string;
  payment_status: string;
  subtotal: number;
  total: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  order_items: StoreSaleLine[];
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

export type StoreSaleListFilters = {
  channel?: "web" | "store" | "order";
  paymentStatus?: string;
  date?: string;
};

type CreateStoreSaleResult = {
  order_id: string;
  order_number: string;
  operation: "created" | "already_created";
  total: number;
};

type CompleteStoreSaleResult = {
  order_id: string;
  status: "paid";
  inventory: {
    order_id: string;
    status: "applied" | "already_applied";
    movements_created: number;
  };
};

type RelationOne<T> = T | T[] | null;

function firstRelation<T>(value: RelationOne<T>) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function paymentSummary(total: number, payments: OrderPayment[]) {
  const totalPaid = Math.round(
    payments
      .filter((payment) => payment.status === "approved")
      .reduce((sum, payment) => sum + Number(payment.amount), 0) * 100,
  ) / 100;

  return {
    totalPaid,
    remainingAmount: Math.max(Math.round((Number(total) - totalPaid) * 100) / 100, 0),
  };
}

export async function listStoreSaleProducts() {
  const { data, error } = await getSupabaseAdminClient()
    .from("products")
    .select("id, name, slug, sku, price, transfer_price, stock, status, categories(name)")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("No se pudieron cargar los productos para la venta.");
  }

  return (data ?? []).map((product) => ({
    ...product,
    categories: firstRelation(product.categories),
  })) as StoreSaleProduct[];
}

export async function createStoreSale(input: {
  idempotencyKey: string;
  createdBy: string;
  customerName: string;
  notes: string;
  items: { productId: string; quantity: number }[];
}) {
  const { data, error } = await getSupabaseAdminClient().rpc(
    "create_store_sale",
    {
      p_idempotency_key: input.idempotencyKey,
      p_created_by: input.createdBy,
      p_customer_name: input.customerName.trim() || null,
      p_notes: input.notes.trim() || null,
      p_items: input.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
    },
  );

  if (error) {
    const messages: Record<string, string> = {
      STORE_SALE_NO_ITEMS: "La venta debe incluir al menos un producto.",
      STORE_SALE_DUPLICATE_PRODUCT: "Un producto aparece mas de una vez.",
      STORE_SALE_QUANTITY_INVALID: "Las cantidades deben ser enteras mayores que cero.",
      STORE_SALE_PRODUCT_NOT_FOUND: "Uno o mas productos ya no existen.",
      STORE_SALE_PRODUCT_INACTIVE: "Uno o mas productos ya no estan activos.",
      STORE_SALE_PRICE_INVALID: "Uno o mas productos no tienen un precio valido.",
      STORE_SALE_STOCK_INSUFFICIENT: "No hay stock suficiente para registrar la venta.",
    };
    const known = Object.entries(messages).find(([code]) =>
      error.message.includes(code),
    );
    throw new Error(known?.[1] ?? "No se pudo crear la venta local.");
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("La base no devolvio la venta creada.");
  }

  return data as CreateStoreSaleResult;
}

export async function addStoreSalePayment(input: {
  orderId: string;
  method: "cash" | "transfer" | "card" | "other";
  amount: number;
  reference: string;
}) {
  return addOrderPayment({
    orderId: input.orderId,
    method: input.method,
    amount: input.amount,
    reference: input.reference,
  });
}

export async function completeStoreSale(orderId: string, createdBy: string) {
  const { data, error } = await getSupabaseAdminClient().rpc(
    "complete_store_sale",
    { p_order_id: orderId, p_created_by: createdBy },
  );

  if (error) {
    if (error.message.includes("SALE_INVENTORY_STOCK_INSUFFICIENT")) {
      throw new Error(
        "El pago quedo registrado, pero ya no hay stock suficiente. La venta requiere revision manual.",
      );
    }

    throw new Error("No se pudo completar la venta ni descontar el stock.");
  }

  return data as CompleteStoreSaleResult;
}

export async function listStoreSales(filters: StoreSaleListFilters = {}) {
  let query = getSupabaseAdminClient()
    .from("orders")
    .select(
      "id, order_number, channel, status, payment_status, total, metadata, created_at, order_items(id,product_name,created_at), order_payments(amount,status)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (filters.channel) {
    query = query.eq("channel", filters.channel);
  }

  if (filters.paymentStatus) {
    query = query.eq("payment_status", filters.paymentStatus);
  }

  if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
    query = query
      .gte("created_at", `${filters.date}T00:00:00.000Z`)
      .lt("created_at", `${filters.date}T23:59:59.999Z`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("No se pudieron cargar las ventas.");
  }

  return (data ?? []).map((sale) => {
    const payments = (sale.order_payments ?? []) as Pick<OrderPayment, "amount" | "status">[];
    const summary = paymentSummary(Number(sale.total), payments as OrderPayment[]);
    const items = Array.isArray(sale.order_items)
      ? [...sale.order_items].sort(
          (left, right) =>
            String(left.created_at).localeCompare(String(right.created_at)) ||
            String(left.id).localeCompare(String(right.id)),
        )
      : [];

    return {
      ...sale,
      displayName: getStoreSaleDisplayName(sale.order_number, items),
      productCount: items.length,
      ...summary,
      order_items: undefined,
      order_payments: undefined,
    };
  });
}

export async function getStoreSaleById(orderId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id, order_number, channel, status, payment_status, subtotal, total,
      notes, metadata, created_at,
      order_items (
        id, product_id, product_name, product_slug, category_name,
        unit_price, quantity, subtotal, created_at
      ),
      order_payments (
        id, order_id, method, amount, status, reference, notes,
        paid_at, created_at, updated_at
      )
    `,
    )
    .eq("id", orderId)
    .eq("channel", "store")
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo cargar la venta.");
  }

  if (!data) {
    return null;
  }

  const { data: movements, error: movementsError } = await supabase
    .from("inventory_movements")
    .select("id, product_id, order_item_id, quantity, previous_stock, new_stock, reason, created_at")
    .eq("order_id", orderId)
    .eq("movement_type", "sale")
    .order("created_at", { ascending: true });

  if (movementsError) {
    throw new Error("No se pudieron cargar los movimientos de la venta.");
  }

  const orderItems = [...(data.order_items ?? [])].sort(
    (left, right) =>
      String(left.created_at).localeCompare(String(right.created_at)) ||
      String(left.id).localeCompare(String(right.id)),
  );

  return {
    ...data,
    order_items: orderItems,
    inventory_movements: movements ?? [],
    ...paymentSummary(Number(data.total), (data.order_payments ?? []) as OrderPayment[]),
  } as StoreSale & { totalPaid: number; remainingAmount: number };
}
