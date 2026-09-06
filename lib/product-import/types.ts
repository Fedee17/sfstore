import type { CatalogAttributeKey } from "@/lib/catalog/attribute-config";

export const SUPPORTED_PRODUCT_SHEETS = [
  "Producto Perfumes",
  "Termos y Mates",
  "Precios Productos",
] as const;

export type SupportedProductSheet = (typeof SUPPORTED_PRODUCT_SHEETS)[number];

export type ImportAttribute = {
  name: string;
  value: string;
  sortOrder: number;
};

export type ImportCatalogAttributeUpdate = {
  key: CatalogAttributeKey;
  label: string;
  values: string[];
};

export type NormalizedProductImportRow = {
  rowNumber: number;
  sourceSheet: SupportedProductSheet;
  name: string;
  slug: string;
  categoryName: string;
  categorySlug: string;
  price: number | null;
  transferPrice: number | null;
  cost: number | null;
  stock: number;
  status: "draft" | "active";
  sku: string | null;
  shortDescription: string;
  description: string;
  attributes: ImportAttribute[];
  catalogAttributeUpdates: ImportCatalogAttributeUpdate[];
  warnings: string[];
  errors: string[];
};

export type ProductSyncInputRow = {
  rowNumber: number;
  row: Record<string, unknown>;
  editedColumn?: string;
  previousProductName?: string;
  timestamp?: string;
};

export type ProductSyncRowResult = {
  rowNumber: number;
  slug: string | null;
  status: "created" | "updated" | "blocked" | "invalid" | "error";
  message: string;
};
