export type ProductCategory = "perfumes" | "mates";

export type Product = {
  kind?: "simple" | "variant" | "family";
  familyId?: string;
  familyName?: string;
  familySlug?: string;
  variantLabel?: string;
  variantOptions?: Record<string,string>;
  sku?: string | null;
  variants?: Product[];
  images?: {url:string;alt:string|null;sort_order:number;is_primary:boolean}[];
  id: string;
  name: string;
  slug: string;
  category: ProductCategory;
  categoryId?: string;
  categoryName?: string;
  price: number;
  transferPrice?: number | null;
  stock: number;
  featured: boolean;
  shortDescription: string;
  description?: string | null;
  imagePlaceholder: string;
  primaryImageUrl?: string | null;
  primaryImageAlt?: string | null;
};
