import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ProductInvariant = {
  id: string;
  stock: number;
  cost: number | null;
  cost_source_purchase_item_id: string | null;
};

type MovementInvariant = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  order_id: string | null;
  order_item_id: string | null;
  purchase_id: string | null;
  purchase_item_id: string | null;
  created_at: string;
};

export type HistoricalInvariantSnapshot = {
  captured_at: string;
  products_count: number;
  stock_total: number;
  products_hash: string;
  inventory_movements_count: number;
  inventory_movements_hash: string;
};

export function stableHash(rows: unknown[]) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function readAll<T>(client: SupabaseClient, table: string, select: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(select).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

export async function captureHistoricalImportInvariants(client: SupabaseClient): Promise<HistoricalInvariantSnapshot> {
  const [products, movements] = await Promise.all([
    readAll<ProductInvariant>(client, "products", "id,stock,cost,cost_source_purchase_item_id"),
    readAll<MovementInvariant>(client, "inventory_movements", "id,product_id,movement_type,quantity,previous_stock,new_stock,order_id,order_item_id,purchase_id,purchase_item_id,created_at"),
  ]);
  return {
    captured_at: new Date().toISOString(),
    products_count: products.length,
    stock_total: products.reduce((sum, product) => sum + Number(product.stock), 0),
    products_hash: stableHash(products),
    inventory_movements_count: movements.length,
    inventory_movements_hash: stableHash(movements),
  };
}

export function compareHistoricalImportInvariants(before: HistoricalInvariantSnapshot, after: HistoricalInvariantSnapshot) {
  const keys = ["products_count", "stock_total", "products_hash", "inventory_movements_count", "inventory_movements_hash"] as const;
  const changed = keys.filter((key) => before[key] !== after[key]);
  return { unchanged: changed.length === 0, changed };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const snapshot = await captureHistoricalImportInvariants(client);
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
    await writeFile(process.argv[outputIndex + 1], JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  }
  const compareIndex = process.argv.indexOf("--compare");
  if (compareIndex >= 0 && process.argv[compareIndex + 1]) {
    const before = JSON.parse(await readFile(process.argv[compareIndex + 1], "utf8")) as HistoricalInvariantSnapshot;
    const comparison = compareHistoricalImportInvariants(before, snapshot);
    if (!comparison.unchanged) throw new Error(`Invariantes alteradas: ${comparison.changed.join(", ")}.`);
  }
  console.log(JSON.stringify(snapshot, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
