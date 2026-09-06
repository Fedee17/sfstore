import { products as fallbackProducts } from "@/data/products";
import { MATE_PUBLIC_CATEGORY_SLUGS } from "@/lib/product-taxonomy";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Product } from "@/types/product";

type SupportedPublicCategory = "perfumes" | "mates";

type SupabaseCategory = {
  id: string;
  name: string;
  slug: string;
};

type SupabaseImage = {
  url: string;
  alt: string | null;
  sort_order: number;
  is_primary: boolean;
};

type SupabaseAttribute = {
  name: string;
  value: string;
  sort_order: number;
};

type SupabaseProductRow = {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  description: string | null;
  price: number;
  transfer_price: number | string | null;
  stock: number;
  featured: boolean;
  category_id: string;
  categories: SupabaseCategory | SupabaseCategory[] | null;
  product_images?: SupabaseImage[];
  product_attributes?: SupabaseAttribute[];
};

export type PublicProduct = Product & {
  categoryId?: string;
  categoryName?: string;
  categorySlug?: string;
  description?: string | null;
  primaryImageUrl?: string | null;
  primaryImageAlt?: string | null;
  images?: SupabaseImage[];
  attributes?: SupabaseAttribute[];
};

function firstRelation<T>(relation: T | T[] | null | undefined) {
  return Array.isArray(relation) ? relation[0] ?? null : relation ?? null;
}

function getSupportedPublicCategory(
  categorySlug: string | undefined,
): SupportedPublicCategory | null {
  if (categorySlug === "perfumes") {
    return "perfumes";
  }

  if (
    MATE_PUBLIC_CATEGORY_SLUGS.includes(
      categorySlug as (typeof MATE_PUBLIC_CATEGORY_SLUGS)[number],
    )
  ) {
    return "mates";
  }

  return null;
}

function createImagePlaceholder(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function mapSupabaseProduct(row: SupabaseProductRow): PublicProduct | null {
  const category = firstRelation(row.categories);
  const categorySlug = category?.slug;
  const publicCategory = getSupportedPublicCategory(categorySlug);

  if (!publicCategory) {
    return null;
  }

  const images = [...(row.product_images ?? [])].sort((first, second) => {
    if (first.is_primary && !second.is_primary) {
      return -1;
    }

    if (!first.is_primary && second.is_primary) {
      return 1;
    }

    return first.sort_order - second.sort_order;
  });
  const primaryImage = images[0] ?? null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: publicCategory,
    price: Number(row.price),
    transferPrice:
      row.transfer_price !== null && row.transfer_price !== undefined
        ? Number(row.transfer_price)
        : null,
    stock: row.stock,
    featured: row.featured,
    shortDescription: row.short_description,
    imagePlaceholder: createImagePlaceholder(row.name),
    categoryId: row.category_id,
    categoryName: category?.name,
    categorySlug: category?.slug,
    description: row.description,
    primaryImageUrl: primaryImage?.url ?? null,
    primaryImageAlt: primaryImage?.alt ?? row.name,
    images,
    attributes: row.product_attributes ?? [],
  };
}

function fallbackByCategory(categorySlug: SupportedPublicCategory): PublicProduct[] {
  return fallbackProducts.filter((product) => product.category === categorySlug);
}

export async function getProductsByCategorySlug(
  categorySlug: SupportedPublicCategory,
) {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from("products")
      .select(
        `
        id,
        name,
        slug,
        short_description,
        description,
        price,
        transfer_price,
        stock,
        featured,
        category_id,
        categories!inner (
          id,
          name,
          slug
        ),
        product_images (
          url,
          alt,
          sort_order,
          is_primary
        ),
        product_attributes (
          name,
          value,
          sort_order
        )
      `,
      )
      .eq("status", "active")
      .order("featured", { ascending: false })
      .order("name", { ascending: true });

    if (categorySlug === "perfumes") {
      query = query.eq("categories.slug", "perfumes");
    } else {
      query = query.in("categories.slug", [...MATE_PUBLIC_CATEGORY_SLUGS]);
    }

    const { data, error } = await query;

    if (error) {
      return fallbackByCategory(categorySlug);
    }

    const products = ((data ?? []) as unknown as SupabaseProductRow[])
      .map(mapSupabaseProduct)
      .filter((product): product is PublicProduct => Boolean(product));

    return products.length > 0 ? products : fallbackByCategory(categorySlug);
  } catch {
    return fallbackByCategory(categorySlug);
  }
}
export async function getProductBySlug(slug: string) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id,
        name,
        slug,
        short_description,
        description,
        price,
        transfer_price,
        stock,
        featured,
        category_id,
        categories (
          id,
          name,
          slug
        ),
        product_images (
          url,
          alt,
          sort_order,
          is_primary
        ),
        product_attributes (
          name,
          value,
          sort_order
        )
      `,
      )
      .eq("status", "active")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !data) {
      return fallbackProducts.find((product) => product.slug === slug) ?? null;
    }

    return (
      mapSupabaseProduct(data as unknown as SupabaseProductRow) ??
      fallbackProducts.find((product) => product.slug === slug) ??
      null
    );
  } catch {
    return fallbackProducts.find((product) => product.slug === slug) ?? null;
  }
}

export async function getRelatedProducts(
  categoryId: string | undefined,
  currentProductId: string,
) {
  const currentFallbackProduct = fallbackProducts.find(
    (product) => product.id === currentProductId,
  );

  try {
    if (!categoryId) {
      throw new Error("Missing category id.");
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id,
        name,
        slug,
        short_description,
        description,
        price,
        transfer_price,
        stock,
        featured,
        category_id,
        categories (
          id,
          name,
          slug
        ),
        product_images (
          url,
          alt,
          sort_order,
          is_primary
        ),
        product_attributes (
          name,
          value,
          sort_order
        )
      `,
      )
      .eq("status", "active")
      .eq("category_id", categoryId)
      .neq("id", currentProductId)
      .limit(4);

    if (error) {
      throw new Error(error.message);
    }

    const relatedProducts = ((data ?? []) as unknown as SupabaseProductRow[])
      .map(mapSupabaseProduct)
      .filter((product): product is PublicProduct => Boolean(product));

    if (relatedProducts.length > 0) {
      return relatedProducts;
    }
  } catch {
    // Fallback below.
  }

  if (!currentFallbackProduct) {
    return [];
  }

  return fallbackProducts
    .filter(
      (product) =>
        product.category === currentFallbackProduct.category &&
        product.id !== currentFallbackProduct.id,
    )
    .slice(0, 4);
}
