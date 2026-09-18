import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const INVENTORY_MOVEMENT_TYPES = [
  "purchase",
  "sale",
  "adjustment",
  "return",
  "reservation",
  "release",
] as const;

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export type InventoryAdjustmentResult = {
  product_id: string;
  status: "adjusted" | "no_change";
  previous_stock: number;
  new_stock: number;
  quantity: number;
  movement_id: string | null;
};

export type InventoryMovement = {
  id: string;
  product_id: string;
  order_id: string | null;
  purchase_id: string | null;
  purchase_item_id: string | null;
  movement_type: InventoryMovementType;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  products: { id: string; name: string; slug: string; sku: string | null } | null;
  purchases: { id: string; supplier_name_snapshot: string } | null;
  orders: { id: string; order_number: string } | null;
};

type RelationOne<T> = T | T[] | null;

type InventoryMovementRow = Omit<
  InventoryMovement,
  "products" | "purchases" | "orders"
> & {
  products: RelationOne<NonNullable<InventoryMovement["products"]>>;
  purchases: RelationOne<NonNullable<InventoryMovement["purchases"]>>;
  orders: RelationOne<NonNullable<InventoryMovement["orders"]>>;
};

function firstRelation<T>(relation: RelationOne<T>) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export async function adjustInventoryStock({
  productId,
  newStock,
  reason,
  createdBy,
}: {
  productId: string;
  newStock: number;
  reason: string;
  createdBy: string;
}): Promise<InventoryAdjustmentResult> {
  const { data, error } = await getSupabaseAdminClient().rpc(
    "adjust_inventory_stock",
    {
      p_product_id: productId,
      p_new_stock: newStock,
      p_reason: reason,
      p_created_by: createdBy,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("La base no devolvio el resultado del ajuste.");
  }

  return data as InventoryAdjustmentResult;
}

export async function listInventoryMovements(filters: {
  search?: string;
  productId?: string;
  type?: InventoryMovementType;
  from?: string;
  to?: string;
}): Promise<{ data: InventoryMovement[] | null; error: string | null }> {
  try {
    const supabase = getSupabaseAdminClient();
    let productIds: string[] | undefined;

    if (filters.search?.trim()) {
      const escaped = filters.search.trim().replaceAll("%", "\\%").replaceAll("_", "\\_");
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("id")
        .or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%,sku.ilike.%${escaped}%`);

      if (productsError) {
        throw new Error(productsError.message);
      }

      productIds = (products ?? []).map((product) => String(product.id));

      if (productIds.length === 0) {
        return { data: [], error: null };
      }
    }

    let query = supabase
      .from("inventory_movements")
      .select(`
        id,
        product_id,
        order_id,
        purchase_id,
        purchase_item_id,
        movement_type,
        quantity,
        previous_stock,
        new_stock,
        reason,
        created_by,
        created_at,
        products (id, name, slug, sku),
        purchases (id, supplier_name_snapshot),
        orders (id, order_number)
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (filters.productId) {
      query = query.eq("product_id", filters.productId);
    } else if (productIds) {
      query = query.in("product_id", productIds);
    }

    if (filters.type) {
      query = query.eq("movement_type", filters.type);
    }

    if (filters.from) {
      query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
    }

    if (filters.to) {
      query = query.lt("created_at", `${filters.to}T23:59:59.999Z`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return {
      data: ((data ?? []) as unknown as InventoryMovementRow[]).map((row) => ({
        ...row,
        products: firstRelation(row.products),
        purchases: firstRelation(row.purchases),
        orders: firstRelation(row.orders),
      })),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo leer el historial de inventario.",
    };
  }
}

export type DecreaseStockResult =
  | {
      success: true;
      skipped?: boolean;
      message: string;
      movementsCreated: number;
    }
  | {
      success: false;
      error: string;
      code:
        | "order_not_found"
        | "no_lines"
        | "product_missing"
        | "invalid_quantity"
        | "stock_insufficient";
      movementsCreated: 0;
    };

type SaleInventoryRpcResult = {
  order_id: string;
  status: "applied" | "already_applied";
  movements_created: number;
};

const SALE_INVENTORY_ERRORS = {
  SALE_INVENTORY_ORDER_NOT_FOUND: {
    code: "order_not_found",
    message: "La orden no existe para descontar stock.",
  },
  SALE_INVENTORY_NO_LINES: {
    code: "no_lines",
    message: "La orden no tiene productos para descontar stock.",
  },
  SALE_INVENTORY_PRODUCT_MISSING: {
    code: "product_missing",
    message: "Un producto de la orden ya no existe.",
  },
  SALE_INVENTORY_INVALID_QUANTITY: {
    code: "invalid_quantity",
    message: "La orden contiene una cantidad de producto invalida.",
  },
  SALE_INVENTORY_STOCK_INSUFFICIENT: {
    code: "stock_insufficient",
    message: "No hay stock suficiente para completar la venta.",
  },
} as const;

function getSaleInventoryError(message: string) {
  const entry = Object.entries(SALE_INVENTORY_ERRORS).find(([key]) =>
    message.includes(key),
  );

  return entry?.[1] ?? null;
}

export async function decreaseStockForOrder(
  orderId: string,
  createdBy: string | null = null,
): Promise<DecreaseStockResult> {
  if (!orderId) {
    return {
      success: false,
      error: "Falta el ID de la orden para descontar stock.",
      code: "order_not_found",
      movementsCreated: 0,
    };
  }

  const { data, error } = await getSupabaseAdminClient().rpc(
    "apply_sale_inventory",
    {
      p_order_id: orderId,
      p_created_by: createdBy,
    },
  );

  if (error) {
    const domainError = getSaleInventoryError(error.message);

    if (domainError) {
      return {
        success: false,
        error: domainError.message,
        code: domainError.code,
        movementsCreated: 0,
      };
    }

    throw new Error("No se pudo aplicar el inventario de la venta.");
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("La base no devolvio el resultado del inventario de venta.");
  }

  const result = data as SaleInventoryRpcResult;

  if (result.status === "already_applied") {
    return {
      success: true,
      skipped: true,
      message: "El stock ya habia sido descontado para esta orden.",
      movementsCreated: 0,
    };
  }

  console.info("[inventory] Stock descontado para orden", {
    orderId,
    movementsCreated: result.movements_created,
  });

  return {
    success: true,
    message: "Stock descontado correctamente.",
    movementsCreated: result.movements_created,
  };
}
