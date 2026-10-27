import { projectComponentPublications, type PublicComponentOfferRow } from "@/lib/products/component-publications";
import { parseComponentPublicationSlug } from "@/lib/products/component-combos";
import { groupPublicProducts } from "@/lib/products/public-families";
import { getWebTransferPrice, hasValidWebPrice } from "@/lib/web-transfer-pricing";
import { products as fallbackProducts } from "@/data/products";
import {
  resolvePublicCatalogSection,
  type PublicCatalogSection,
} from "@/lib/catalog/public-product-visibility";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupersededYaraRosa } from "@/lib/products/yara-rosa-consolidation";
import type { Product } from "@/types/product";

type SupportedPublicCategory = PublicCatalogSection;

type SupabaseCategory = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
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
  family_id?: string | null;
  family_name?: string | null;
  family_slug?: string | null;
  commercial_label?: string | null;
  variant_options?: Record<string,string>;
  sku?: string | null;
  id: string;
  name: string;
  slug: string;
  short_description: string;
  description: string | null;
  price: number;
  transfer_price?: number | string | null;
  stock: number;
  featured: boolean;
  status: string;
  historical_identity: boolean;
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
  if (isSupersededYaraRosa(row)) return null;
  const category = firstRelation(row.categories);
  const publicCategory = resolvePublicCatalogSection({
    status: row.status,
    historicalIdentity: row.historical_identity,
    categorySlug: category?.slug,
    categoryIsActive: category?.is_active ?? false,
  });

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
    kind: row.family_id ? "variant" : "simple",
    familyId: row.family_id ?? undefined, familyName: row.family_name ?? undefined, familySlug: row.family_slug ?? undefined,
    variantLabel: row.family_id ? Object.entries(row.variant_options??{}).map(([k,v])=>`${k}: ${v}`).join(" / ") : undefined,
    variantOptions: row.variant_options,sku: row.sku,
    id: row.id,
    name: row.commercial_label ?? row.name,
    slug: row.slug,
    category: publicCategory,
    price: Number(row.price),
    transferPrice: hasValidWebPrice(Number(row.price)) ? getWebTransferPrice(Number(row.price)) : null,
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

function demoProducts(): PublicProduct[] {
  // A production outage or empty catalog must never publish synthetic products/stock.
  if (process.env.NODE_ENV === "production") return [];
  return fallbackProducts.map((product) => ({ ...product, transferPrice: getWebTransferPrice(product.price) }));
}

function fallbackByCategory(categorySlug: SupportedPublicCategory): PublicProduct[] {
  return demoProducts().filter((product) => product.category === categorySlug);
}

const CATALOG_COLUMNS="id,name,slug,short_description,description,price,stock,featured,status,historical_identity,category_id,categories,category_slug,product_images,product_attributes,family_id,family_name,family_slug,commercial_label,variant_options,sku";
async function readPublicSkuRows(slug?: string, family?: string, slugs?: string[]) {
 const db=getSupabaseClient(), rows:SupabaseProductRow[]=[];
 let after:string|null=null;
 for(let page=0;page<500;page++){
  let query=db.from("public_catalog_skus").select(CATALOG_COLUMNS).order("id").limit(200);
  if(after)query=query.gt("id",after);
  if(slug)query=query.eq("slug",slug);
  if(slugs)query=query.in("slug",slugs);
  if(family)query=query.eq("family_slug",family);
  const {data,error}=await query;
  if(error||data===null)throw new Error("PUBLIC_CATALOG_READ_FAILED");
  if(!data.length)return rows;
  for(const row of data as SupabaseProductRow[]){if(after&&row.id<=after)throw new Error("PUBLIC_CATALOG_PAGINATION_FAILED");rows.push(row);after=row.id;}
 }
 throw new Error("PUBLIC_CATALOG_INCOMPLETE");
}
const mapRows=(rows:SupabaseProductRow[])=>rows.map(mapSupabaseProduct).filter((p):p is PublicProduct=>p!==null);
const OFFER_COLUMNS="id,name,connector,head_slug,cable_slug,presentation_product,combo_list_price,combo_transfer_price,price_version,image_id,image_url,image_alt,image_gallery";
async function readPublicComboRows(selection?: {presentationId:string;connector:string}): Promise<PublicComponentOfferRow[]> {
 const rows: PublicComponentOfferRow[] = []; let after: PublicComponentOfferRow | undefined;
 for(let page=0;page<500;page++) {
  let query=getSupabaseClient().from("public_component_offers").select(OFFER_COLUMNS).order("id").order("connector").limit(200);
  if(selection)query=query.eq("presentation_product",selection.presentationId).eq("connector",selection.connector);
  if(after)query=query.or(`id.gt.${after.id},and(id.eq.${after.id},connector.gt.${after.connector})`);
  const {data,error}=await query;
  if(error||data===null)throw new Error("PUBLIC_COMBO_READ_FAILED");
  if(!data.length)return rows;
  for(const row of data as PublicComponentOfferRow[]) {
   if(!/^[0-9a-f-]{36}$/.test(row.id)||!["cc","lightning"].includes(row.connector)||
      (after&&(row.id<after.id||(row.id===after.id&&row.connector<=after.connector))))throw new Error("PUBLIC_COMBO_PAGINATION_FAILED");
   rows.push(row);after=row;
  }
 }
 throw new Error("PUBLIC_COMBO_INCOMPLETE");
}
async function comboPublications(physical: PublicProduct[]) {
 // A missing/unavailable offer contract must not prevent buying ordinary products.
 try{return projectComponentPublications(physical,await readPublicComboRows());}catch{return [];}
}
export async function getProductsByCategorySlug(categorySlug:SupportedPublicCategory):Promise<PublicProduct[]> {
 try{const physical=mapRows(await readPublicSkuRows());return [...groupPublicProducts(physical),...await comboPublications(physical)].filter(product=>product.category===categorySlug);}
 catch{return fallbackByCategory(categorySlug);}
}
export async function getProductBySlug(slug:string):Promise<PublicProduct|null> {
 try {
  if(!slug||slug.length>512)return null;
  const virtual=parseComponentPublicationSlug(slug);
  if(virtual){
   const offers=await readPublicComboRows(virtual);
   if(offers.length!==1)return null;
   const physical=mapRows(await readPublicSkuRows(undefined,undefined,[offers[0].head_slug,offers[0].cable_slug]));
   return projectComponentPublications(physical,offers)[0]??null;
  }
  const family=mapRows(await readPublicSkuRows(undefined,slug));
  if(family.length)return groupPublicProducts(family)[0]??null;
  const rows=mapRows(await readPublicSkuRows(slug));
  if(rows[0]?.familySlug)return groupPublicProducts(mapRows(await readPublicSkuRows(undefined,rows[0].familySlug)))[0]??null;
  return rows[0]??null;
 }catch{return demoProducts().find(p=>p.slug===slug)??null;}
}
export async function getRelatedProducts(categoryId:string|undefined,currentProductId:string) {
 if(!categoryId)return [];
 return (await getCatalogPublications()).filter(p=>p.categoryId===categoryId&&p.id!==currentProductId).slice(0,4);
}
export async function getCatalogPublications():Promise<PublicProduct[]> {
 try{const physical=mapRows(await readPublicSkuRows());return [...groupPublicProducts(physical),...await comboPublications(physical)];}catch{return [];}
}
