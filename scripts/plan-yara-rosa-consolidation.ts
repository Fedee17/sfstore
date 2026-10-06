import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { YARA_ROSA, buildYaraRosaConsolidationPlan } from "../lib/products/yara-rosa-consolidation.ts";

if (process.argv.slice(2).length) throw new Error("Read-only planner: no flags, --apply is not supported.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Server-side Supabase environment is required.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const ids = [YARA_ROSA.canonicalId, YARA_ROSA.archivedId];

async function readRows(table: string, column: string, values: string[]) {
  if (!values.length) return [];
  const { data, error } = await client.from(table).select("*").in(column, values).order("id");
  if (error) throw new Error(`Read ${table} failed: ${error.message}`);
  return data ?? [];
}

async function publicPage(path: string) {
  const response = await fetch(`https://sfstore-ten.vercel.app${path}`, { redirect: "manual", signal: AbortSignal.timeout(30000) });
  const body = await response.text();
  return { path, status: response.status, location: response.headers.get("location"),
    sha256: createHash("sha256").update(body).digest("hex"),
    canonicalPresent: body.includes(`/producto/${YARA_ROSA.canonicalSlug}`),
    duplicatedPresent: body.includes(`/producto/${YARA_ROSA.archivedSlug}`) };
}

const products = await readRows("products", "id", ids);
const plan = buildYaraRosaConsolidationPlan(products as Parameters<typeof buildYaraRosaConsolidationPlan>[0]);
const attributes = await readRows("product_attributes", "product_id", ids);
const images = await readRows("product_images", "product_id", ids);
const purchaseItems = await readRows("purchase_items", "product_id", ids);
const orderItems = await readRows("order_items", "product_id", ids);
const movements = await readRows("inventory_movements", "product_id", ids);
const purchases = await readRows("purchases", "id", purchaseItems.map((item) => String(item.purchase_id)));
const orders = await readRows("orders", "id", orderItems.map((item) => String(item.order_id)));
const orderPayments = await readRows("order_payments", "order_id", orders.map((order) => String(order.id)));
const records = await readRows("historical_import_records", "target_id", [...purchases, ...orders].map((operation) => String(operation.id)));
const analytics = await readRows("analytics_events", "product_id", ids);
if (purchaseItems.length !== 3 || purchases.length !== 3 || records.length !== 3 ||
    purchaseItems.some((item) => item.product_id !== YARA_ROSA.archivedId) ||
    purchases.some((purchase) => !purchase.historical_import || purchase.affects_inventory) ||
    orderItems.length || movements.length) throw new Error("ABORT_REFERENCES_CHANGED: new human review required.");

const storage = [];
for (const image of images) {
  const imageUrl = new URL(String(image.url));
  const prefix = "/storage/v1/object/public/product-images/";
  if (imageUrl.origin !== new URL(url).origin || !imageUrl.pathname.startsWith(prefix)) throw new Error("Unexpected image URL.");
  const path = decodeURIComponent(imageUrl.pathname.slice(prefix.length));
  const folder = path.slice(0, path.lastIndexOf("/"));
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await client.storage.from("product-images").list(folder, { limit: 1000 });
  if (error) throw new Error(`Read Storage failed: ${error.message}`);
  const object = data.find((item) => item.name === filename);
  if (!object) throw new Error("Image object missing.");
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Image is not accessible.");
  const bytes = Buffer.from(await response.arrayBuffer());
  storage.push({ rowId: image.id, productId: image.product_id, path, object,
    httpStatus: response.status, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length });
}
if (images.length !== 2 || storage[0]?.sha256 !== storage[1]?.sha256) throw new Error("ABORT_IMAGES_CHANGED: review images before consolidation.");
const { data: inventory, error: inventoryError } = await client.from("products")
  .select("id,stock,cost,cost_source_purchase_item_id").order("id");
if (inventoryError) throw new Error(inventoryError.message);
const { count: movementCount, error: countError } = await client.from("inventory_movements").select("id", { count: "exact", head: true });
if (countError) throw new Error(countError.message);
const pages = [];
for (const path of ["/sitemap.xml", "/perfumes", `/producto/${YARA_ROSA.canonicalSlug}`, `/producto/${YARA_ROSA.archivedSlug}`]) pages.push(await publicPage(path));
const snapshot = { capturedAt: new Date().toISOString(), mode: "READ_ONLY", products, attributes, images, storage,
  references: { purchases, purchaseItems, orders, orderItems, orderPayments, movements, records, analytics },
  invariants: { productsCount: inventory?.length, stockTotal: inventory?.reduce((total, row) => total + Number(row.stock), 0),
    inventorySha256: createHash("sha256").update(JSON.stringify(inventory)).digest("hex"), inventoryMovementCount: movementCount }, pages };
await writeFile("reports/yara-rosa-consolidation-pre.json", `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
await writeFile("reports/yara-rosa-consolidation-plan.json", `${JSON.stringify({ snapshot: "reports/yara-rosa-consolidation-pre.json", ...plan }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ mode: "READ_ONLY_PRE_APPLY", products: products.length, historicalPurchasesRetained: purchases.length,
  imagesRetained: images.length, imagesIdentical: true, invariants: snapshot.invariants, plan, productionWrites: 0 }, null, 2));
