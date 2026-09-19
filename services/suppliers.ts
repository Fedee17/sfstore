import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  summarizeSupplierPurchases,
  type SupplierPurchaseSummary,
} from "@/lib/suppliers/summary";
import {
  validateSupplierInput,
  type SupplierFormInput,
} from "@/lib/suppliers/validation";

export type Supplier = {
  id: string;
  name: string;
  normalized_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupplierPurchase = {
  id: string;
  supplier_id: string;
  supplier_name_snapshot: string;
  purchase_date: string;
  status: "draft" | "confirmed" | "cancelled";
  supplier_subtotal: number | string;
  shipping_cost: number | string;
  total_cost: number | string;
  total_units: number;
  created_at: string;
};

export type SupplierListItem = Supplier & SupplierPurchaseSummary;

function duplicateSupplierError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    throw new Error("Ya existe un proveedor con ese nombre.");
  }

  throw new Error(error.message);
}

export async function listSuppliers(filters: {
  search?: string;
  active?: "all" | "active" | "inactive";
} = {}) {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("suppliers")
    .select("id, name, normalized_name, contact_name, phone, email, whatsapp, website, address, notes, is_active, created_at, updated_at, purchases (id, supplier_id, supplier_name_snapshot, purchase_date, status, supplier_subtotal, shipping_cost, total_cost, total_units, created_at)")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  if (filters.active === "active") {
    query = query.eq("is_active", true);
  } else if (filters.active === "inactive") {
    query = query.eq("is_active", false);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const purchases = (row.purchases ?? []) as SupplierPurchase[];
    return {
      ...row,
      purchases: undefined,
      ...summarizeSupplierPurchases(purchases),
    } as SupplierListItem;
  });
}

export async function listActiveSuppliers() {
  const { data, error } = await getSupabaseAdminClient()
    .from("suppliers")
    .select("id, name, normalized_name, contact_name, phone, email, whatsapp, website, address, notes, is_active, created_at, updated_at")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as Supplier[];
}

export async function listSelectableSuppliers(currentSupplierId?: string) {
  const active = await listActiveSuppliers();
  if (!currentSupplierId || active.some((supplier) => supplier.id === currentSupplierId)) {
    return active;
  }

  const current = await getSupplierById(currentSupplierId);
  return current ? [current, ...active] : active;
}

export async function getSupplierById(supplierId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("suppliers")
    .select("id, name, normalized_name, contact_name, phone, email, whatsapp, website, address, notes, is_active, created_at, updated_at")
    .eq("id", supplierId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as Supplier | null;
}

async function getSupplierByNormalizedName(normalizedName: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("suppliers")
    .select("id, name, normalized_name, contact_name, phone, email, whatsapp, website, address, notes, is_active, created_at, updated_at")
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as Supplier | null;
}

export async function getSupplierPurchaseSummary(supplierId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("purchases")
    .select("id, supplier_id, supplier_name_snapshot, purchase_date, status, supplier_subtotal, shipping_cost, total_cost, total_units, created_at")
    .eq("supplier_id", supplierId)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const purchases = (data ?? []) as SupplierPurchase[];
  return { purchases, summary: summarizeSupplierPurchases(purchases) };
}

export async function createSupplier(input: SupplierFormInput) {
  const values = validateSupplierInput(input);
  const { data, error } = await getSupabaseAdminClient()
    .from("suppliers")
    .insert({ ...values, is_active: true })
    .select("id, name, normalized_name, contact_name, phone, email, whatsapp, website, address, notes, is_active, created_at, updated_at")
    .single();

  if (error) {
    duplicateSupplierError(error);
  }

  return data as unknown as Supplier;
}

export async function createOrReuseSupplier(input: SupplierFormInput) {
  const values = validateSupplierInput(input);
  const existing = await getSupplierByNormalizedName(values.normalized_name);

  if (existing) {
    return { supplier: existing, created: false };
  }

  try {
    const supplier = await createSupplier(input);
    return { supplier, created: true };
  } catch (error) {
    if (error instanceof Error && error.message === "Ya existe un proveedor con ese nombre.") {
      const concurrent = await getSupplierByNormalizedName(values.normalized_name);
      if (concurrent) {
        return { supplier: concurrent, created: false };
      }
    }

    throw error;
  }
}

export async function updateSupplier(
  supplierId: string,
  input: SupplierFormInput,
) {
  const values = validateSupplierInput(input);
  const { data, error } = await getSupabaseAdminClient()
    .from("suppliers")
    .update(values)
    .eq("id", supplierId)
    .select("id, name, normalized_name, contact_name, phone, email, whatsapp, website, address, notes, is_active, created_at, updated_at")
    .single();

  if (error) {
    duplicateSupplierError(error);
  }

  return data as unknown as Supplier;
}

export async function setSupplierActiveStatus(
  supplierId: string,
  isActive: boolean,
) {
  const { data, error } = await getSupabaseAdminClient()
    .from("suppliers")
    .update({ is_active: isActive })
    .eq("id", supplierId)
    .select("id, name, normalized_name, contact_name, phone, email, whatsapp, website, address, notes, is_active, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as Supplier;
}
