export type AtomicProductPayload = {
  product: Record<string, unknown>;
  attributes: { name: string; value: string; sort_order: number }[];
  images: AtomicProductImage[] | null;
};

export type AtomicProductImage = {
  id: string;
  url: string;
  alt: string | null;
  is_primary: boolean;
  path?: string;
  content_hash?: string;
  size?: number;
  mime?: string;
};

export type ProductUpload = {
  path: string;
  contentHash: string;
  size: number;
  mime: string;
  fileIndex: number;
};

export type ProductSavePlan = {
  requestHash: string;
  payload: AtomicProductPayload;
  uploads: ProductUpload[];
  previousSlug?: string;
  categorySlugs: string[];
};

export type ProductSaveResult = {
  product_id: string;
  version: string;
  product: { id: string; slug: string; status: string; category_id: string; updated_at: string };
};

export type ProductSaveOperation = {
  status: "not_found" | "prepared" | "committed" | "aborted";
  product_id?: string;
  operation_type?: string;
  result?: ProductSaveResult;
  recovery_metadata?: ProductSavePlan;
};

export type ProductSaveRequest = {
  operationKey: string;
  operationType: "create_product" | "update_product";
  productId: string;
  expectedVersion: string | null;
  requestHash: string;
};

export type ProductSaveGateway = {
  resolve(): Promise<ProductSaveOperation>;
  prepare(plan: ProductSavePlan): Promise<ProductSaveOperation>;
  persistPlan(plan: ProductSavePlan): Promise<ProductSavePlan>;
  queueReconciliation(upload: ProductUpload): Promise<void>;
  upload(upload: ProductUpload): Promise<void>;
  commit(plan: ProductSavePlan): Promise<ProductSaveResult>;
  abort(): Promise<void>;
};

export class ProductSaveError extends Error {
  retryMode: "retry" | "new" | "reload";
  constructor(message: string, retryMode: "retry" | "new" | "reload") {
    super(message);
    this.retryMode = retryMode;
  }
}

function assertSameRequest(operation: ProductSaveOperation, request: ProductSaveRequest) {
  if (operation.status === "not_found") return;
  if (operation.product_id !== request.productId || operation.operation_type !== request.operationType ||
    (operation.recovery_metadata?.requestHash && operation.recovery_metadata.requestHash !== request.requestHash)) {
    throw new ProductSaveError("La operacion pertenece a otro formulario. Recarga antes de guardar.", "reload");
  }
}

// A lost response is not proof of rollback. Resolve under the RPC's operation lock.
export async function saveProductWithRecovery(
  request: ProductSaveRequest,
  gateway: ProductSaveGateway,
  buildPlan: () => Promise<ProductSavePlan>,
) {
  let plan: ProductSavePlan | undefined;
  let prepared = false;
  let building = false;
  try {
    const existing = await gateway.resolve();
    assertSameRequest(existing, request);
    plan = existing.recovery_metadata?.requestHash ? existing.recovery_metadata : undefined;
    if (existing.status === "committed" && existing.result && plan) {
      return { result: existing.result, plan };
    }
    if (existing.status === "aborted") {
      throw new ProductSaveError("La operacion anterior fue cancelada. Volve a guardar.", "new");
    }
    if (!plan) {
      building = true;
      plan = await buildPlan();
      building = false;
    }
    const operation = await gateway.prepare(plan);
    prepared = true;
    if (operation.status === "committed" && operation.result) return { result: operation.result, plan };
    plan = await gateway.persistPlan(plan);
    if (plan.requestHash !== request.requestHash) {
      throw new ProductSaveError("El contenido del reintento cambio. Recarga el formulario.", "reload");
    }
    for (const upload of plan.uploads) {
      // Durable recovery intent precedes the non-transactional Storage request.
      await gateway.queueReconciliation(upload);
      await gateway.upload(upload);
    }
    return { result: await gateway.commit(plan), plan };
  } catch (error) {
    if (error instanceof ProductSaveError) throw error;
    if (building) throw new ProductSaveError(error instanceof Error ? error.message : "Revisa los campos del producto.", "new");
    if (prepared) {
      try {
        const resolved = await gateway.resolve();
        assertSameRequest(resolved, request);
        if (resolved.status === "committed" && resolved.result && plan) return { result: resolved.result, plan };
        if (resolved.status === "aborted") throw new ProductSaveError("Operacion cancelada. Volve a guardar.", "new");
        const message = error instanceof Error ? error.message : "";
        const terminal = /PRODUCT_|HISTORICAL_PRODUCT|violates|duplicate key|invalid input/i.test(message);
        if (resolved.status === "prepared" && terminal) {
          await gateway.abort();
          throw new ProductSaveError(
            /PRODUCT_STALE_VERSION/.test(message)
              ? "El producto cambio desde que abriste el formulario. Recarga para no sobrescribir cambios."
              : "No se guardo el producto. Revisa los campos y volve a intentar.",
            /PRODUCT_STALE_VERSION/.test(message) ? "reload" : "new",
          );
        }
      } catch (resolutionError) {
        if (resolutionError instanceof ProductSaveError) throw resolutionError;
      }
    }
    throw new ProductSaveError("No se pudo completar el guardado. Reintenta la misma operacion; no se duplicaran producto ni imagenes.", "retry");
  }
}

export async function readVersionedProduct<T>(
  version: () => Promise<string | null>,
  read: () => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await version();
    const product = await read();
    const after = await version();
    if (before === after) return { product, version: after };
  }
  throw new Error("El producto esta cambiando. Volve a abrirlo para editar.");
}
