import { createClient } from "@supabase/supabase-js";
import {
  recommendPerfumes,
  type PerfumeRecommendationPreferences,
  type PerfumeRecommendationProduct,
} from "../lib/catalog/perfume-recommendation.ts";

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  status: string;
  stock: number | null;
  price: number | string | null;
  transfer_price: number | string | null;
  categories:
    | { id: string; name: string; slug: string }
    | Array<{ id: string; name: string; slug: string }>;
  product_attributes: Array<{ name: string; value: string }> | null;
};

const scenarios: Array<{
  name: string;
  preferences: PerfumeRecommendationPreferences;
}> = [
  {
    name: "Caso A",
    preferences: {
      gender: "masculino",
      olfactoryFamilies: ["dulce"],
      intensity: "intensa",
      occasions: ["noche"],
      inStockOnly: false,
    },
  },
  {
    name: "Caso B",
    preferences: {
      gender: "femenino",
      olfactoryFamilies: ["frutal", "dulce"],
      occasions: ["cita"],
      inStockOnly: false,
    },
  },
  {
    name: "Caso C",
    preferences: {
      olfactoryFamilies: ["fresco"],
      occasions: ["diario"],
      maxTransferPrice: 80_000,
      inStockOnly: true,
    },
  },
];

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

function firstCategory(row: ProductRow) {
  return Array.isArray(row.categories) ? row.categories[0] : row.categories;
}

async function main() {
  const supabase = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase
    .from("products")
    .select(
      `
        id,
        name,
        slug,
        sku,
        status,
        stock,
        price,
        transfer_price,
        categories!inner (id, name, slug),
        product_attributes (name, value)
      `,
    )
    .eq("categories.slug", "perfumes");

  if (error) {
    throw new Error(`No se pudieron leer los perfumes: ${error.message}`);
  }

  const products = ((data ?? []) as unknown as ProductRow[]).map(
    (row): PerfumeRecommendationProduct => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      sku: row.sku,
      status: row.status,
      stock: row.stock,
      price: row.price === null ? null : Number(row.price),
      transfer_price:
        row.transfer_price === null ? null : Number(row.transfer_price),
      category: firstCategory(row),
      attributes: row.product_attributes ?? [],
    }),
  );

  console.log(`Perfumes leídos: ${products.length}`);
  for (const scenario of scenarios) {
    console.log(`\n${scenario.name}`);
    const recommendations = recommendPerfumes(products, scenario.preferences).slice(0, 5);
    recommendations.forEach((recommendation, index) => {
      console.log(
        `${index + 1}. ${recommendation.product.name} | ${recommendation.score}/${recommendation.maxScore} | ${recommendation.matchPercentage}% | transferencia: ${recommendation.product.transfer_price ?? "sin precio"} | stock: ${recommendation.product.stock ?? "sin dato"} | coincide: ${recommendation.matchedCriteria.join(", ")}`,
      );
    });
  }
}

await main();
