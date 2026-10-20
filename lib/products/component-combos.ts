/** A combo is a selection of real SKU, never a second inventory balance. */
export type ComponentRecipe = {
  id: string;
  name: string;
  source_product: string;
  head_product: string;
  cable_cc_product: string;
  cable_lightning_product: string;
  presentation_product: string;
  legacy_cable_product: string;
  prices_approved: boolean;
  combo_list_price?: number;
  combo_transfer_price?: number;
  combo_price_version?: string;
};
export type CableConnector = "cc" | "lightning";
export function commercialLineKey(id: string, connector?: CableConnector) { return connector ? `${id}:${connector}` : id; }
export type ComponentStockLine = { productId: string; stock: number; quantity: number; components?: { productId: string; stock: number }[] };
export function fitsComponentInventory(lines: ComponentStockLine[]): boolean {
  const demand = new Map<string, number>(), stock = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) return false;
    for (const p of line.components ?? [{ productId: line.productId, stock: line.stock }]) {
      if (!Number.isSafeInteger(p.stock) || p.stock < 0) return false;
      demand.set(p.productId, (demand.get(p.productId) ?? 0) + line.quantity);
      stock.set(p.productId, Math.min(stock.get(p.productId) ?? p.stock, p.stock));
    }
  }
  return [...demand].every(([id, quantity]) => quantity <= stock.get(id)!);
}
export function componentIds(recipe: ComponentRecipe, connector: CableConnector): [string, string] {
  if (connector !== "cc" && connector !== "lightning") throw new Error("Elegí el tipo de cable.");
  const ids: [string, string] = [recipe.head_product, connector === "cc" ? recipe.cable_cc_product : recipe.cable_lightning_product];
  if (!ids[0] || !ids[1] || ids[0] === ids[1]) throw new Error("La composición no es válida.");
  return ids;
}
export function addComponentSelection<T extends { product: { id: string; stock: number }; quantity: number }>(
  current: T[], products: T["product"][], makeLine: (product: T["product"]) => T,
): T[] {
  if (products.length !== 2 || new Set(products.map(p => p.id)).size !== 2) throw new Error("La composición no es válida.");
  // Validate every component before changing any line; no silently incomplete combo.
  for (const p of products) {
    const quantity = current.find(l => l.product.id === p.id)?.quantity ?? 0;
    if (!Number.isSafeInteger(p.stock) || p.stock < quantity + 1) throw new Error("No hay stock para agregar el conjunto completo.");
  }
  const next = current.map(l => ({ ...l }));
  for (const product of products) {
    const index = next.findIndex(l => l.product.id === product.id);
    if (index < 0) next.push(makeLine(product));
    else next[index] = { ...next[index], product, quantity: next[index].quantity + 1 };
  }
  return next;
}
