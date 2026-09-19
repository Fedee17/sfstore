import {
  calculatePurchaseDraft,
  centsToDatabaseMoney,
  type PurchaseCalculationLineInput,
} from "@/lib/purchases/calculation";
import {
  assertPurchaseIsDraft,
  type PurchaseStatus,
} from "@/lib/purchases/lifecycle";
import { slugifyProductValue } from "@/lib/products/slug";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type PurchaseProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  cost: number | string | null;
  status: string;
};

export type PurchaseItem = {
  id: string;
  product_id: string;
  product_name_snapshot: string;
  product_slug_snapshot: string;
  sku_snapshot: string | null;
  quantity: number;
  unit_purchase_cost: number | string;
  supplier_line_total: number | string;
  allocated_shipping_total: number | string;
  allocated_shipping_per_unit: number | string;
  effective_unit_cost: number | string;
  effective_line_total: number | string;
};

export type Purchase = {
  id: string;
  supplier_id: string;
  supplier_name_snapshot: string;
  purchase_date: string;
  status: PurchaseStatus;
  shipping_cost: number | string;
  supplier_subtotal: number | string;
  total_cost: number | string;
  total_units: number;
  notes: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  distinct_product_count?: number;
  purchase_items?: PurchaseItem[];
};

export type SavePurchaseDraftInput = {
  purchaseId?: string;
  supplierId: string;
  purchaseDate: string;
  shippingCost: string;
  notes: string;
  createdBy: string;
  lines: PurchaseCalculationLineInput[];
};

export type CreatePurchaseProductInput = {
  name: string;
  categoryId: string;
  sku?: string;
  purchaseId?: string;
};

export type CreatePurchaseProductResult = {
  created: boolean;
  product: PurchaseProduct;
};

export type ConfirmPurchaseResult = {
  purchase_id: string;
  status: "confirmed" | "already_confirmed";
  confirmed_at: string;
  movements_created: number;
};

export async function listPurchaseProducts() {
  const { data, error } = await getSupabaseAdminClient()
    .from("products")
    .select("id, name, slug, sku, cost, status")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PurchaseProduct[];
}

function cleanProductName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

async function findPurchaseProductBySlug(slug: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("products")
    .select("id, name, slug, sku, cost, status")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as PurchaseProduct | null;
}

async function findPurchaseProductByName(name: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("products")
    .select("id, name, slug, sku, cost, status")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as PurchaseProduct | null;
}

export async function createPurchaseProduct(
  input: CreatePurchaseProductInput,
): Promise<CreatePurchaseProductResult> {
  const name = cleanProductName(input.name);
  const categoryId = input.categoryId.trim();
  const sku = input.sku?.trim() || null;
  const slug = slugifyProductValue(name);

  if (!name) {
    throw new Error("Nombre es requerido.");
  }

  if (!categoryId) {
    throw new Error("Categoria es requerida.");
  }

  if (!slug) {
    throw new Error("El nombre no permite generar un slug valido.");
  }

  if (input.purchaseId) {
    const purchase = await getPurchaseById(input.purchaseId);

    if (!purchase) {
      throw new Error("La compra no existe.");
    }

    assertPurchaseIsDraft(purchase.status);
  }

  const supabase = getSupabaseAdminClient();
  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("is_active", true)
    .maybeSingle();

  if (categoryError) {
    throw new Error(categoryError.message);
  }

  if (!category) {
    throw new Error("La categoria no existe o esta inactiva.");
  }

  const existingProduct =
    (await findPurchaseProductBySlug(slug)) ??
    (await findPurchaseProductByName(name));

  if (existingProduct) {
    return { created: false, product: existingProduct };
  }

  const productId = crypto.randomUUID();
  const { data, error } = await supabase
    .from("products")
    .insert({
      id: productId,
      category_id: categoryId,
      name,
      slug,
      short_description: "",
      description: null,
      price: 0,
      transfer_price: null,
      compare_at_price: null,
      cost: null,
      stock: 0,
      sku,
      featured: false,
      status: "active",
    })
    .select("id, name, slug, sku, cost, status")
    .single();

  if (error) {
    if (error.code === "23505") {
      const duplicate = await findPurchaseProductBySlug(slug);

      if (duplicate) {
        return { created: false, product: duplicate };
      }

      throw new Error("Ya existe un producto con ese SKU.");
    }

    throw new Error(error.message);
  }

  return { created: true, product: data as PurchaseProduct };
}

export async function listPurchases() {
  const { data, error } = await getSupabaseAdminClient()
    .from("purchases")
    .select(
      "id, supplier_id, supplier_name_snapshot, purchase_date, status, shipping_cost, supplier_subtotal, total_cost, total_units, notes, confirmed_at, cancelled_at, created_at, updated_at, purchase_items(count)",
    )
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const itemCount = Array.isArray(row.purchase_items)
      ? Number(row.purchase_items[0]?.count ?? 0)
      : 0;

    return {
      ...row,
      distinct_product_count: itemCount,
      purchase_items: undefined,
    } as Purchase;
  });
}

export async function getPurchaseById(purchaseId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("purchases")
    .select(
      `
      id,
      supplier_id,
      supplier_name_snapshot,
      purchase_date,
      status,
      shipping_cost,
      supplier_subtotal,
      total_cost,
      total_units,
      notes,
      confirmed_at,
      cancelled_at,
      created_at,
      updated_at,
      purchase_items (
        id,
        product_id,
        product_name_snapshot,
        product_slug_snapshot,
        sku_snapshot,
        quantity,
        unit_purchase_cost,
        supplier_line_total,
        allocated_shipping_total,
        allocated_shipping_per_unit,
        effective_unit_cost,
        effective_line_total
      )
    `,
    )
    .eq("id", purchaseId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Purchase | null;
}

export async function savePurchaseDraft(input: SavePurchaseDraftInput) {
  const supplierId = input.supplierId.trim();
  const purchaseDate = input.purchaseDate.trim();

  if (!supplierId) {
    throw new Error("El proveedor es requerido.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    throw new Error("La fecha de compra no es valida.");
  }

  const calculation = calculatePurchaseDraft({
    lines: input.lines,
    shippingCost: input.shippingCost,
  });
  const supabase = getSupabaseAdminClient();

  if (input.purchaseId) {
    const existingPurchase = await getPurchaseById(input.purchaseId);

    if (!existingPurchase) {
      throw new Error("La compra no existe.");
    }

    assertPurchaseIsDraft(existingPurchase.status);
  }

  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("is_active", true)
    .maybeSingle();

  if (supplierError) {
    throw new Error(supplierError.message);
  }

  if (!supplier) {
    throw new Error("El proveedor no existe o esta inactivo.");
  }

  const productIds = calculation.lines.map((line) => line.productId);
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id")
    .in("id", productIds);

  if (productsError) {
    throw new Error(productsError.message);
  }

  if ((products ?? []).length !== productIds.length) {
    throw new Error("Uno o mas productos no existen.");
  }

  const { data, error } = await supabase.rpc("save_purchase_draft", {
    p_purchase_id: input.purchaseId || null,
    p_supplier_id: supplierId,
    p_purchase_date: purchaseDate,
    p_shipping_cost: centsToDatabaseMoney(calculation.shippingCostCents),
    p_notes: input.notes.trim() || null,
    p_created_by: input.createdBy,
    p_items: calculation.lines.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      unit_purchase_cost: centsToDatabaseMoney(line.unitPurchaseCostCents),
    })),
  });

  if (error) {
    throw new Error(error.message);
  }

  return String(data);
}

export async function cancelPurchaseDraft(purchaseId: string) {
  const purchase = await getPurchaseById(purchaseId);

  if (!purchase) {
    throw new Error("La compra no existe.");
  }

  assertPurchaseIsDraft(purchase.status);

  const { error } = await getSupabaseAdminClient().rpc(
    "cancel_purchase_draft",
    { p_purchase_id: purchaseId },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function confirmPurchase(
  purchaseId: string,
  createdBy: string,
): Promise<ConfirmPurchaseResult> {
  const normalizedPurchaseId = purchaseId.trim();

  if (!normalizedPurchaseId) {
    throw new Error("Falta el ID de la compra.");
  }

  const { data, error } = await getSupabaseAdminClient().rpc(
    "confirm_purchase",
    {
      p_purchase_id: normalizedPurchaseId,
      p_created_by: createdBy,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("La base no devolvio el resultado de la confirmacion.");
  }

  return data as ConfirmPurchaseResult;
}
