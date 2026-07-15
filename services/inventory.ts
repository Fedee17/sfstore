import { getSupabaseAdminClient } from "@/lib/supabase/server";

type OrderMetadata = Record<string, unknown>;

type OrderRow = {
  id: string;
  metadata: OrderMetadata | null;
};

type OrderItemRow = {
  product_id: string | null;
  product_name: string;
  quantity: number;
};

type ProductRow = {
  id: string;
  stock: number;
};

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
      movementsCreated: 0;
    };

function isRecord(value: unknown): value is OrderMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function updateOrderStockMetadata(
  orderId: string,
  previousMetadata: unknown,
  update: OrderMetadata,
) {
  const supabase = getSupabaseAdminClient();
  const metadata = {
    ...(isRecord(previousMetadata) ? previousMetadata : {}),
    ...update,
  };

  const { error } = await supabase
    .from("orders")
    .update({ metadata })
    .eq("id", orderId);

  if (error) {
    console.error("[inventory] No se pudo actualizar metadata de stock", {
      orderId,
      error: error.message,
    });
  }
}

function aggregateItemsByProduct(items: OrderItemRow[]) {
  const aggregated = new Map<
    string,
    {
      productId: string;
      productName: string;
      quantity: number;
    }
  >();

  for (const item of items) {
    if (!item.product_id) {
      continue;
    }

    const current = aggregated.get(item.product_id);

    if (current) {
      current.quantity += item.quantity;
      continue;
    }

    aggregated.set(item.product_id, {
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
    });
  }

  return Array.from(aggregated.values());
}

export async function decreaseStockForOrder(
  orderId: string,
): Promise<DecreaseStockResult> {
  if (!orderId) {
    return {
      success: false,
      error: "Falta el ID de la orden para descontar stock.",
      movementsCreated: 0,
    };
  }

  const supabase = getSupabaseAdminClient();

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select("id, metadata")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    throw new Error(`No se pudo leer la orden para stock: ${orderError.message}`);
  }

  const order = orderData as OrderRow | null;

  if (!order) {
    return {
      success: false,
      error: "La orden no existe para descontar stock.",
      movementsCreated: 0,
    };
  }

  const metadata = isRecord(order.metadata) ? order.metadata : {};

  if (metadata.stock_decrease_status === "completed") {
    return {
      success: true,
      skipped: true,
      message: "El stock ya habia sido descontado para esta orden.",
      movementsCreated: 0,
    };
  }

  const { data: existingMovements, error: movementsError } = await supabase
    .from("inventory_movements")
    .select("id")
    .eq("order_id", orderId)
    .eq("movement_type", "sale")
    .limit(1);

  if (movementsError) {
    throw new Error(
      `No se pudo verificar movimientos existentes: ${movementsError.message}`,
    );
  }

  if ((existingMovements ?? []).length > 0) {
    await updateOrderStockMetadata(orderId, metadata, {
      stock_decrease_status: "completed",
      stock_decreased_at:
        metadata.stock_decreased_at ?? new Date().toISOString(),
      stock_decrease_note: "Movimiento de venta existente detectado.",
    });

    return {
      success: true,
      skipped: true,
      message: "Ya existia un movimiento de venta para esta orden.",
      movementsCreated: 0,
    };
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from("order_items")
    .select("product_id, product_name, quantity")
    .eq("order_id", orderId);

  if (itemsError) {
    throw new Error(`No se pudieron leer los items: ${itemsError.message}`);
  }

  const stockItems = aggregateItemsByProduct((itemsData ?? []) as OrderItemRow[]);

  if (stockItems.length === 0) {
    await updateOrderStockMetadata(orderId, metadata, {
      stock_decrease_status: "completed",
      stock_decreased_at: new Date().toISOString(),
      stock_decrease_note:
        "Orden sin items vinculados a products. No habia stock para descontar.",
    });

    return {
      success: true,
      skipped: true,
      message: "La orden no tiene items con product_id para descontar stock.",
      movementsCreated: 0,
    };
  }

  const productIds = stockItems.map((item) => item.productId);
  const { data: productsData, error: productsError } = await supabase
    .from("products")
    .select("id, stock")
    .in("id", productIds);

  if (productsError) {
    throw new Error(`No se pudieron leer productos: ${productsError.message}`);
  }

  const productsById = new Map(
    ((productsData ?? []) as ProductRow[]).map((product) => [
      product.id,
      product,
    ]),
  );
  const stockError = stockItems
    .map((item) => {
      const product = productsById.get(item.productId);

      if (!product) {
        return `${item.productName}: producto no encontrado.`;
      }

      if (product.stock < item.quantity) {
        return `${item.productName}: stock insuficiente (${product.stock} disponible, ${item.quantity} requerido).`;
      }

      return null;
    })
    .filter(Boolean)
    .join(" ");

  if (stockError) {
    console.warn("[inventory] Stock insuficiente para orden", {
      orderId,
      error: stockError,
    });
    await updateOrderStockMetadata(orderId, metadata, {
      stock_decrease_status: "failed",
      stock_decrease_error: stockError,
    });

    return {
      success: false,
      error: stockError,
      movementsCreated: 0,
    };
  }

  const movementRows = [];

  for (const item of stockItems) {
    const product = productsById.get(item.productId);

    if (!product) {
      continue;
    }

    const previousStock = product.stock;
    const newStock = previousStock - item.quantity;
    const { error: updateStockError } = await supabase
      .from("products")
      .update({ stock: newStock })
      .eq("id", item.productId);

    if (updateStockError) {
      throw new Error(
        `No se pudo actualizar stock de ${item.productName}: ${updateStockError.message}`,
      );
    }

    movementRows.push({
      id: crypto.randomUUID(),
      product_id: item.productId,
      order_id: orderId,
      movement_type: "sale",
      quantity: item.quantity,
      previous_stock: previousStock,
      new_stock: newStock,
      reason: "Venta confirmada",
    });
  }

  if (movementRows.length > 0) {
    const { error: movementInsertError } = await supabase
      .from("inventory_movements")
      .insert(movementRows);

    if (movementInsertError) {
      throw new Error(
        `No se pudieron crear movimientos de inventario: ${movementInsertError.message}`,
      );
    }
  }

  await updateOrderStockMetadata(orderId, metadata, {
    stock_decrease_status: "completed",
    stock_decreased_at: new Date().toISOString(),
    stock_decrease_error: null,
  });

  console.info("[inventory] Stock descontado para orden", {
    orderId,
    movementsCreated: movementRows.length,
  });

  return {
    success: true,
    message: "Stock descontado correctamente.",
    movementsCreated: movementRows.length,
  };
}
