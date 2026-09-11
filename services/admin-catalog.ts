import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  QuickCatalogAttribute,
  QuickCatalogImage,
  QuickCatalogProduct,
} from "@/lib/admin/quick-catalog";

type RelationOne<T> = T | T[] | null;

type QuickCatalogRow = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  status: string;
  stock: number;
  price: number | string;
  transfer_price: number | string | null;
  categories: RelationOne<{
    id: string;
    name: string;
    slug: string;
  }>;
  product_attributes: QuickCatalogAttribute[] | null;
  product_images: QuickCatalogImage[] | null;
};

function firstRelation<T>(relation: RelationOne<T>) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export async function getQuickCatalogProducts(): Promise<{
  data: QuickCatalogProduct[];
  error: string | null;
}> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id,
        name,
        slug,
        sku,
        status,
        stock,
        price,
        transfer_price,
        categories (id, name, slug),
        product_attributes (name, value),
        product_images (url, alt, sort_order, is_primary)
      `,
      )
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);

    const products = ((data ?? []) as unknown as QuickCatalogRow[]).map(
      (row): QuickCatalogProduct => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        sku: row.sku,
        status: row.status,
        stock: row.stock,
        price: Number(row.price),
        transfer_price:
          row.transfer_price === null ? null : Number(row.transfer_price),
        category: firstRelation(row.categories),
        attributes: row.product_attributes ?? [],
        images: row.product_images ?? [],
      }),
    );

    return { data: products, error: null };
  } catch (error) {
    return {
      data: [],
      error:
        error instanceof Error
          ? error.message
          : "No se pudo leer el catalogo de Supabase.",
    };
  }
}
