import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  runCurrentProductCreation,
  type CurrentProductRepository,
  type ExistingCategory,
  type ExistingProduct,
  type PlannedAttribute,
} from "../lib/current-products/create-current-products-required.ts";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--apply");
if (unknownArguments.length > 0) throw new Error(`Argumento desconocido: ${unknownArguments[0]}.`);
const apply = process.argv.includes("--apply");

const supabase = createClient(
  requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function repositoryFor(client: SupabaseClient): CurrentProductRepository {
  return {
    async listCategories() {
      const { data, error } = await client
        .from("categories")
        .select("id,name,slug,is_active,sort_order")
        .order("sort_order")
        .order("name");
      if (error) throw new Error(`No se pudieron leer categorías: ${error.message}`);
      return (data ?? []) as ExistingCategory[];
    },
    async listProducts() {
      const { data, error } = await client
        .from("products")
        .select("id,category_id,name,slug,short_description,description,price,transfer_price,compare_at_price,cost,stock,sku,featured,status,product_attributes(name,value)")
        .order("name");
      if (error) throw new Error(`No se pudieron leer productos: ${error.message}`);
      return (data ?? []) as ExistingProduct[];
    },
    async createCategory(input) {
      const { data, error } = await client
        .from("categories")
        .insert(input)
        .select("id,name,slug,is_active,sort_order")
        .single();
      if (error) throw new Error(`No se pudo crear categoría ${input.slug}: ${error.message}`);
      return data as ExistingCategory;
    },
    async createProduct(input) {
      const { error } = await client.from("products").insert(input);
      if (error) throw new Error(`No se pudo crear producto ${input.slug}: ${error.message}`);
    },
    async createAttributes(productId: string, attributes: PlannedAttribute[]) {
      const { error } = await client.from("product_attributes").insert(
        attributes.map((attribute, index) => ({
          product_id: productId,
          name: attribute.name,
          value: attribute.value,
          sort_order: (index + 1) * 10,
        })),
      );
      if (error) throw new Error(`No se pudieron crear atributos para ${productId}: ${error.message}`);
    },
    async deleteProduct(productId: string) {
      const { error } = await client.from("products").delete().eq("id", productId);
      if (error) throw new Error(`Falló la compensación del producto nuevo ${productId}: ${error.message}`);
    },
  };
}

const summary = await runCurrentProductCreation(repositoryFor(supabase), {
  apply,
  log: console.log,
});

console.log(JSON.stringify(summary));
console.log(apply ? "Aplicación finalizada." : "Dry-run finalizado. Use --apply para escribir.");
