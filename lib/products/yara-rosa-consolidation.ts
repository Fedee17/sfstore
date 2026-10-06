export const YARA_ROSA = Object.freeze({
  canonicalId: "f1cb2323-0e7f-49d6-a26f-110595c90e55",
  canonicalSlug: "lattafa-yara-rosa",
  archivedId: "05b34469-3eb8-4148-8e97-9a19f1c2df6e",
  archivedSlug: "perfume-yara-rosa",
});

export function getYaraRosaCanonicalId(slug: string) {
  return slug === YARA_ROSA.canonicalSlug || slug === YARA_ROSA.archivedSlug
    ? YARA_ROSA.canonicalId
    : null;
}

export function isSupersededYaraRosa(product: { id?: string; slug?: string }) {
  return product.id === YARA_ROSA.archivedId || product.slug === YARA_ROSA.archivedSlug;
}

type ConsolidationProduct = {
  id: string;
  slug: string;
  status: string;
  historical_identity: boolean;
  stock: number;
  price: number | null;
  transfer_price: number | null;
  cost: number | null;
  featured: boolean;
};

export function buildYaraRosaConsolidationPlan(products: readonly ConsolidationProduct[]) {
  const a = products.find((product) => product.id === YARA_ROSA.canonicalId);
  const b = products.find((product) => product.id === YARA_ROSA.archivedId);
  if (!a || !b || products.length !== 2) throw new Error("Expected exactly both Yara Rosa identities.");
  if (a.slug !== YARA_ROSA.canonicalSlug || b.slug !== YARA_ROSA.archivedSlug ||
      a.historical_identity || b.historical_identity || a.status !== "active" || b.status !== "active" ||
      a.stock !== 0 || b.stock !== 1) {
    throw new Error("ABORT_YARA_PRECONDITION_CHANGED: review the snapshot before planning writes.");
  }
  return {
    mode: "PRE_APPLY_ONLY",
    productUpdates: [
      { id: a.id, before: { price: a.price, transfer_price: a.transfer_price, cost: a.cost, featured: a.featured, status: a.status },
        patch: { price: 87000, transfer_price: 67050, cost: 44700, featured: true, status: "active" } },
      { id: b.id, before: { status: b.status, featured: b.featured }, patch: { status: "archived", featured: false } },
    ],
    inventoryAdjustments: [
      { productId: b.id, previousStock: 1, newStock: 0, rpc: "adjust_inventory_stock", reason: "Consolidacion Yara Rosa: reasignacion de la unidad fisica a la identidad comercial lattafa-yara-rosa." },
      { productId: a.id, previousStock: 0, newStock: 1, rpc: "adjust_inventory_stock", reason: "Consolidacion Yara Rosa: recepcion de la unidad fisica desde perfume-yara-rosa, sin compra ni venta." },
    ],
    executionRequirement: "One PostgreSQL transaction: lock both products, revalidate complete snapshot and references, identify the administrator, run both existing inventory RPC calls, apply only approved patches, verify stock total, commit or rollback everything.",
    expected: { canonicalStock: 1, archivedStock: 0, stockTotalDelta: 0, newAdjustmentMovements: 2 },
    preserve: ["historical purchase items and snapshots", "historical import records and mappings", "all attributes", "both image rows and Storage objects", "historical_identity=false", "cost_source_purchase_item_id", "other products"],
    imageAction: "KEEP_BOTH_FOR_TECHNICAL_TRACEABILITY_NO_STORAGE_DELETE",
    redirect: { source: `/producto/${b.slug}`, destination: `/producto/${a.slug}`, permanent: true, status: 308 },
  };
}
