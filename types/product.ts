export type ProductCategory = "perfumes" | "mates";

export type Product = {
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
