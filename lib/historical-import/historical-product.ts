export type HistoricalProductIdentityInput = {
  historicalGroupKey: string;
  name: string;
  slug: string;
  categoryId: string;
};

export function buildHistoricalProductIdentity(
  input: HistoricalProductIdentityInput,
) {
  const historicalGroupKey = input.historicalGroupKey.trim();
  const name = input.name.trim();
  const slug = input.slug.trim();
  const categoryId = input.categoryId.trim();

  if (!historicalGroupKey || !name || !slug || !categoryId) {
    throw new Error("La identidad historica requiere grupo, nombre, slug y categoria.");
  }

  return {
    category_id: categoryId,
    name,
    slug,
    short_description: null,
    description: null,
    price: null,
    transfer_price: null,
    compare_at_price: null,
    cost: null,
    cost_source_purchase_item_id: null,
    stock: 0,
    sku: null,
    featured: false,
    status: "archived" as const,
    historical_identity: true,
    historical_group_key: historicalGroupKey,
  };
}

export function historicalProductIdentityMatches(
  current: Record<string, unknown>,
  expected: ReturnType<typeof buildHistoricalProductIdentity>,
) {
  return Object.entries(expected).every(([key, value]) => current[key] === value);
}
