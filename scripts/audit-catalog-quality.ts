import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildCatalogAudit,
  serializeCatalogAuditCsv,
  serializeCatalogAuditMarkdown,
  summarizeCatalogAudit,
  type CatalogAuditProduct,
  type ConfirmedPurchaseCost,
  type ImageHealth,
} from "../lib/catalog/catalog-quality-audit.ts";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

const supabase = createClient(
  requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function readAll<T>(table: string, select: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

async function readImageHealth(images: { id: string; url: string }[]) {
  const health: ImageHealth = {};
  const queue = [...images];
  const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
    while (queue.length > 0) {
      const image = queue.shift();
      if (!image) return;
      try {
        const response = await fetch(image.url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
        health[image.id] = response.ok;
      } catch {
        health[image.id] = false;
      }
    }
  });
  await Promise.all(workers);
  return health;
}

type ProductRow = Omit<CatalogAuditProduct, "category" | "attributes" | "images"> & {
  categories: { name: string; slug: string } | { name: string; slug: string }[] | null;
};
type AttributeRow = { product_id: string; name: string; value: string };
type ImageRow = { id: string; product_id: string; url: string; sort_order: number; is_primary: boolean };
type PurchaseRow = { id: string; status: string; confirmed_at: string | null };
type PurchaseItemRow = { id: string; purchase_id: string; product_id: string; effective_unit_cost: number };

const [productRows, attributes, images, purchases, purchaseItems] = await Promise.all([
  readAll<ProductRow>("products", "id,name,slug,status,stock,cost,price,transfer_price,short_description,description,cost_source_purchase_item_id,categories(name,slug)"),
  readAll<AttributeRow>("product_attributes", "product_id,name,value"),
  readAll<ImageRow>("product_images", "id,product_id,url,sort_order,is_primary"),
  readAll<PurchaseRow>("purchases", "id,status,confirmed_at").then((rows) =>
    rows.filter((row): row is PurchaseRow & { confirmed_at: string } => row.status === "confirmed" && Boolean(row.confirmed_at)),
  ),
  readAll<PurchaseItemRow>("purchase_items", "id,purchase_id,product_id,effective_unit_cost"),
]);

const confirmedAtByPurchase = new Map(purchases.map((purchase) => [purchase.id, purchase.confirmed_at]));
const confirmedCosts: ConfirmedPurchaseCost[] = purchaseItems.flatMap((item) => {
  const confirmedAt = confirmedAtByPurchase.get(item.purchase_id);
  return confirmedAt ? [{ ...item, effective_unit_cost: Number(item.effective_unit_cost), confirmed_at: confirmedAt }] : [];
});
const imageHealth = await readImageHealth(images);
const products: CatalogAuditProduct[] = productRows.map((row) => ({
  ...row,
  stock: Number(row.stock),
  cost: row.cost === null ? null : Number(row.cost),
  price: Number(row.price),
  transfer_price: row.transfer_price === null ? null : Number(row.transfer_price),
  category: Array.isArray(row.categories) ? row.categories[0] ?? null : row.categories,
  attributes: attributes.filter((attribute) => attribute.product_id === row.id),
  images: images.filter((image) => image.product_id === row.id),
}));

const generatedAt = new Date().toISOString();
const audit = buildCatalogAudit(products, confirmedCosts, imageHealth);
const reportsDirectory = join(process.cwd(), "reports");
await mkdir(reportsDirectory, { recursive: true });
await Promise.all([
  writeFile(join(reportsDirectory, "catalog-quality-audit.csv"), serializeCatalogAuditCsv(audit), "utf8"),
  writeFile(join(reportsDirectory, "catalog-quality-audit.md"), serializeCatalogAuditMarkdown(audit, generatedAt), "utf8"),
]);

const summary = summarizeCatalogAudit(audit);
console.log(`Productos auditados: ${summary.total}`);
console.log(`Sin problemas relevantes: ${summary.withoutRelevantIssues}`);
console.log(`Con problemas: ${summary.withIssues}`);
console.log(`Activos criticos: ${summary.activeCritical}`);
console.log(`Reportes: reports/catalog-quality-audit.md y reports/catalog-quality-audit.csv`);
