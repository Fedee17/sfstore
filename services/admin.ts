import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { readVersionedProduct } from "@/lib/products/atomic-save";
import {mergeAdminProductPublications,type AdminComponentOffer} from "@/lib/products/admin-component-publications";

import { YARA_ROSA } from "@/lib/products/yara-rosa-consolidation";
import { LOW_STOCK_LIMIT } from "@/lib/admin/catalog-review";

export type AdminProduct = {
  component_offer?: boolean;
  save_version?: string;
  family_id?: string | null;
  id: string;
  category_id?: string;
  name: string;
  slug: string;
  short_description?: string;
  description?: string | null;
  status: string;
  price: number;
  transfer_price?: number | null;
  cash_price_approved_at?: string | null;
  compare_at_price?: number | null;
  cost?: number | null;
  stock: number;
  sku?: string | null;
  featured: boolean;
  web_visible?: boolean;
  commercial_blocked?: boolean;
  historical_identity?: boolean;
  categories: {
    name: string;
    slug: string;
    is_active?: boolean;
  } | null;
  product_attributes?: {
    id: string;
    name: string;
    value: string;
    sort_order: number;
  }[];
  product_images?: {
    id: string;
    url: string;
    alt: string | null;
    sort_order: number;
    is_primary: boolean;
    combo_connector?: string | null;
  }[];
};

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export type AdminProductFilters = {
  requireComplete?: boolean;
  /** Historical identities only (read-only records); otherwise they are excluded. */
  historical?: boolean;
  /** Products list default: hide archived rows unless a status is chosen. */
  excludeArchived?: boolean;
  search?: string;
  category?: string;
  status?: string;
  stock?: "low" | "out";
  featured?: boolean;
};

export type AdminResult<T> = {
  data: T | null;
  error: string | null;
};

type RelationOne<T> = T | T[] | null;

type AdminProductCategory = {
  name: string;
  slug: string;
  is_active?: boolean;
};

type AdminProductAttribute = NonNullable<AdminProduct["product_attributes"]>[number];
type AdminProductImage = NonNullable<AdminProduct["product_images"]>[number];

type AdminProductRow = Omit<
  AdminProduct,
  "categories" | "product_attributes" | "product_images"
> & {
  categories: RelationOne<AdminProductCategory>;
  product_attributes?: AdminProductAttribute[] | null;
  product_images?: AdminProductImage[] | null;
};

function firstRelation<T>(relation: RelationOne<T>) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function normalizeAdminProduct(row: AdminProductRow): AdminProduct {
  return {
    ...row,
    categories: firstRelation(row.categories),
    product_attributes: row.product_attributes ?? undefined,
    product_images: row.product_images ?? undefined,
  };
}

async function safeRead<T>(read: () => Promise<T>): Promise<AdminResult<T>> {
  try {
    return { data: await read(), error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron leer los datos de Supabase.",
    };
  }
}

export async function getAdminProducts(
  filters: AdminProductFilters = {},
): Promise<AdminResult<AdminProduct[]>> {
  return safeRead(async () => {
    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from("products")
      .select(
        `
        id,
        category_id,
        name,
        slug,
        short_description,
        description,
        status,
        price,
        transfer_price,
        cash_price_approved_at,
        compare_at_price,
        cost,
        stock,
        sku,
        featured,
        web_visible,
        commercial_blocked,
        historical_identity,
        categories (
          name,
          slug,
          is_active
        ),
        product_attributes (
          id,
          name,
          value,
          sort_order
        ),
        product_images (
          id,
          url,
          alt,
          sort_order,
          is_primary
        )
      `, filters.requireComplete ? { count: "exact" } : undefined,
      )
      .order("created_at", { ascending: false });

    // Historical records also hold the superseded Yara Rosa identity (kept for traceability, read-only);
    // the operational list never shows either.
    query = filters.historical
      ? query.or(`historical_identity.eq.true,id.eq.${YARA_ROSA.archivedId}`)
      : query.eq("historical_identity", false).neq("id", YARA_ROSA.archivedId);

    const search = filters.search?.trim();

    if (search) {
      const escapedSearch = search.replaceAll("%", "\\%").replaceAll("_", "\\_");
      query = query.or(
        `name.ilike.%${escapedSearch}%,slug.ilike.%${escapedSearch}%,sku.ilike.%${escapedSearch}%`,
      );
    }

    if (filters.category) {
      query = query.eq("category_id", filters.category);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    } else if (filters.excludeArchived) {
      query = query.neq("status", "archived");
    }

    if (filters.stock === "out") {
      query = query.eq("stock", 0);
    }

    if (filters.stock === "low") {
      query = query.gt("stock", 0).lte("stock", LOW_STOCK_LIMIT);
    }

    if (filters.featured) {
      query = query.eq("featured", true);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    if (filters.requireComplete && (count === null || count !== data?.length)) {
      throw new Error("El catálogo supera el límite de lectura. Acotá la búsqueda o categoría para no mostrar un listado incompleto.");
    }

    return ((data ?? []) as unknown as AdminProductRow[]).map(
      normalizeAdminProduct,
    );
  });
}

// Only the product administration list uses virtual rows; purchasing/inventory readers remain unchanged.
export async function getAdminProductPublications(filters:AdminProductFilters={}):Promise<AdminResult<AdminProduct[]>> {
  return safeRead(async()=>{
    const products=await getAdminProducts(filters);
    if(products.error)throw Error(products.error);
    // Component offers are current publications: never mixed into the historical records.
    if (filters.historical) return products.data??[];
    const db=getSupabaseAdminClient();
    const {data:offers,error,count}=await db.from("public_component_offers")
      .select("presentation_product,connector,head_product,available,combo_list_price,combo_transfer_price,image_id,image_url,image_alt",filters.requireComplete?{count:"exact"}:undefined)
      .order("id").order("connector").limit(101);
    if(error||(offers?.length??0)>100||(filters.requireComplete&&count!==offers?.length))throw Error("No se pudo recuperar el listado completo de cargadores.");
    if(!offers?.length)return products.data??[];
    const {data:heads,error:headError}=await db.from("products").select("id,category_id,categories(name,slug,is_active)").in("id",[...new Set(offers.map(o=>o.head_product))]);
    if(headError)throw Error("No se pudo verificar la categoría de los cargadores.");
    return mergeAdminProductPublications(products.data??[],offers as AdminComponentOffer[],heads as unknown as AdminProduct[],filters);
  });
}

export async function getAdminCategories(): Promise<AdminResult<AdminCategory[]>> {
  return safeRead(async () => {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as AdminCategory[];
  });
}

export async function getAdminProductById(
  id: string,
): Promise<AdminResult<AdminProduct | null>> {
  return safeRead(async () => {
    const supabase = getSupabaseAdminClient();
    const { product, version } = await readVersionedProduct(
      async () => {
        const { data, error } = await supabase.rpc("get_product_save_version", { p_product_id: id });
        if (error) throw new Error(error.message);
        return data as string | null;
      },
      async () => {
        const { data, error } = await supabase
          .from("products")
          .select(
            `
            id,
            category_id,
            family_id,
            name,
            slug,
            short_description,
            description,
            status,
            price,
            transfer_price,
            cash_price_approved_at,
            compare_at_price,
            cost,
            stock,
            sku,
            featured,
            web_visible,
            commercial_blocked,
            historical_identity,
            categories (
              name,
              slug,
              is_active
            ),
            product_attributes (
              id,
              name,
              value,
              sort_order
            ),
            product_images (
              id,
              url,
              alt,
              sort_order,
              is_primary,
              combo_connector
            )
          `,
          )
          .eq("historical_identity", false)
          .eq("id", id)
          .maybeSingle();

        if (error) {
          throw new Error(error.message);
        }

        return data
          ? normalizeAdminProduct(data as unknown as AdminProductRow)
          : null;
      },
    );
    return product ? { ...product, save_version: version ?? undefined } : null;
  });
}

export async function getAdminDashboardData() {
  const { getCommercialDay } = await import("@/services/commercial-history");
  return getCommercialDay();
}
