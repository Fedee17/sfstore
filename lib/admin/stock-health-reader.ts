import type { SupabaseClient } from '@supabase/supabase-js';
import type { StockSnapshot, StockProduct } from './stock-health.ts';

function record(value: unknown): value is Record<string,unknown> {
  return typeof value==='object' && value!==null && !Array.isArray(value);
}
export async function readStockSnapshot(client: Pick<SupabaseClient,'rpc'>): Promise<StockSnapshot> {
  const {data,error}=await client.rpc('get_stock_health_snapshot').abortSignal(AbortSignal.timeout(15000));
  if (error || !record(data) || typeof data.asOf!=='string' || !Array.isArray(data.products)) throw new Error('STOCK_HEALTH_READ_FAILED');
  const products=data.products.map((row:unknown):StockProduct=>{
    if (!record(row) || typeof row.id!=='string' || typeof row.name!=='string' ||
      typeof row.status!=='string' || typeof row.created_at!=='string' || typeof row.variant_label!=='string' ||
      typeof row.available!=='number' || typeof row.reserved!=='number' ||
      ![row.category_id,row.sku,row.family_id].every(value=>value===null || typeof value==='string') ||
      !(row.cost===null || typeof row.cost==='string')) throw new Error('STOCK_HEALTH_INVALID_SNAPSHOT');
    return row as StockProduct;
  });
  return {asOf:data.asOf,products};
}
