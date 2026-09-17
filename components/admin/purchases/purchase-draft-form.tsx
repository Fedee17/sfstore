"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import {
  createPurchaseProductAction,
  savePurchaseDraftAction,
  type CreatePurchaseProductActionResult,
} from "@/app/admin/compras/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { calculatePurchaseDraft } from "@/lib/purchases/calculation";
import type { AdminCategory } from "@/services/admin";
import type {
  Purchase,
  PurchaseProduct,
  Supplier,
} from "@/services/purchases";

type DraftLine = {
  key: string;
  productId: string;
  productQuery: string;
  quantity: string;
  unitPurchaseCost: string;
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

function moneyInput(value: number | string | null | undefined) {
  return value === null || value === undefined ? "0.00" : Number(value).toFixed(2);
}

function emptyLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    productId: "",
    productQuery: "",
    quantity: "1",
    unitPurchaseCost: "0.00",
  };
}

export function PurchaseDraftForm({
  suppliers,
  products,
  categories,
  purchase,
}: {
  suppliers: Supplier[];
  products: PurchaseProduct[];
  categories: AdminCategory[];
  purchase?: Purchase;
}) {
  const [availableProducts, setAvailableProducts] = useState(products);
  const [shippingCost, setShippingCost] = useState(
    moneyInput(purchase?.shipping_cost),
  );
  const [lines, setLines] = useState<DraftLine[]>(() => {
    const initialLines = purchase?.purchase_items?.map((item) => ({
      key: item.id,
      productId: item.product_id,
      productQuery:
        products.find((product) => product.id === item.product_id)?.name ??
        item.product_name_snapshot,
      quantity: String(item.quantity),
      unitPurchaseCost: moneyInput(item.unit_purchase_cost),
    }));

    return initialLines?.length ? initialLines : [emptyLine()];
  });
  const [createForLine, setCreateForLine] = useState<string | null>(null);
  const [openProductDropdownForLine, setOpenProductDropdownForLine] =
    useState<string | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCategoryId, setNewProductCategoryId] = useState("");
  const [newProductSku, setNewProductSku] = useState("");
  const [createResult, setCreateResult] =
    useState<CreatePurchaseProductActionResult | null>(null);
  const [isCreating, startCreating] = useTransition();
  const quantityInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const preview = useMemo(() => {
    try {
      return {
        calculation: calculatePurchaseDraft({
          shippingCost,
          lines: lines.map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity),
            unitPurchaseCost: line.unitPurchaseCost,
          })),
        }),
        error: null,
      };
    } catch (error) {
      return {
        calculation: null,
        error: error instanceof Error ? error.message : "Datos incompletos.",
      };
    }
  }, [lines, shippingCost]);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function selectProduct(lineKey: string, product: PurchaseProduct) {
    setOpenProductDropdownForLine(null);
    updateLine(lineKey, {
      productId: product.id,
      productQuery: product.name,
      unitPurchaseCost: moneyInput(product.cost),
    });
  }

  function openProductCreate(line: DraftLine) {
    setOpenProductDropdownForLine(null);
    setCreateForLine(line.key);
    setNewProductName(line.productQuery.trim());
    setNewProductCategoryId("");
    setNewProductSku("");
    setCreateResult(null);
  }

  function cancelProductCreate() {
    setCreateForLine(null);
    setOpenProductDropdownForLine(null);
    setCreateResult(null);
  }

  function submitProductCreate() {
    if (!createForLine || isCreating) {
      return;
    }

    const lineKey = createForLine;

    startCreating(async () => {
      const result = await createPurchaseProductAction({
        name: newProductName,
        categoryId: newProductCategoryId,
        sku: newProductSku,
        purchaseId: purchase?.id,
      });

      setCreateResult(result);

      if (!result.product) {
        return;
      }

      const product = result.product;

      setAvailableProducts((current) => {
        if (current.some((candidate) => candidate.id === product.id)) {
          return current;
        }

        return [...current, product].sort((first, second) =>
          first.name.localeCompare(second.name, "es"),
        );
      });
      selectProduct(lineKey, product);
      setCreateForLine(null);
      setOpenProductDropdownForLine(null);
      requestAnimationFrame(() => quantityInputRefs.current[lineKey]?.focus());
    });
  }

  return (
    <form action={savePurchaseDraftAction} className="mt-8 grid gap-6">
      {purchase ? <input type="hidden" name="purchaseId" value={purchase.id} /> : null}

      <section className="grid gap-4 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm md:grid-cols-2">
        <label className="grid min-w-0 gap-2 text-sm font-semibold">
          Proveedor
          <select
            name="supplierId"
            required
            defaultValue={purchase?.supplier_id ?? ""}
            className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]"
          >
            <option value="">Seleccionar proveedor</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-0 gap-2 text-sm font-semibold">
          Fecha de compra
          <input
            type="date"
            name="purchaseDate"
            required
            defaultValue={purchase?.purchase_date ?? new Date().toISOString().slice(0, 10)}
            className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]"
          />
        </label>

        <label className="grid min-w-0 gap-2 text-sm font-semibold md:col-span-2">
          Notas
          <textarea
            name="notes"
            defaultValue={purchase?.notes ?? ""}
            rows={3}
            className="min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] p-4 outline-none focus:border-[#556B2F]"
          />
        </label>
      </section>

      <section className="rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Productos</h2>
            <p className="mt-1 text-sm text-[#1F1F1F]/60">
              El costo efectivo incluye el envio prorrateado por unidad.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLines((current) => [...current, emptyLine()])}
            className="rounded-full border border-[#556B2F]/30 px-5 py-3 text-sm font-semibold text-[#556B2F] transition hover:bg-[#556B2F]/10"
          >
            Agregar producto
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          {lines.map((line, index) => {
            const previewLine = preview.calculation?.lines[index];
            const normalizedQuery = line.productQuery
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim()
              .toLowerCase();
            const matchingProducts = normalizedQuery
              ? availableProducts
                  .filter((product) => {
                    const searchable = `${product.name} ${product.sku ?? ""}`
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .toLowerCase();
                    return searchable.includes(normalizedQuery);
                  })
                  .slice(0, 8)
              : [];
            const exactProduct = availableProducts.find((product) => {
              const normalizedName = product.name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim()
                .toLowerCase();
              return (
                normalizedName === normalizedQuery ||
                product.sku?.trim().toLowerCase() === normalizedQuery
              );
            });

            return (
              <div
                key={line.key}
                className="grid min-w-0 gap-3 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4 lg:grid-cols-[minmax(0,2fr)_minmax(7rem,0.6fr)_minmax(9rem,0.8fr)_auto] lg:items-end"
              >
                <div className="relative grid min-w-0 gap-2 text-sm font-semibold">
                  Producto
                  <input type="hidden" name="productId" value={line.productId} />
                  <input
                    type="search"
                    required
                    value={line.productQuery}
                    placeholder="Buscar por nombre o SKU"
                    onFocus={() => {
                      if (createForLine !== line.key) {
                        setOpenProductDropdownForLine(line.key);
                      }
                    }}
                    onChange={(event) => {
                      const query = event.target.value;
                      setOpenProductDropdownForLine(line.key);
                      updateLine(line.key, {
                        productQuery: query,
                        productId: "",
                        unitPurchaseCost: "0.00",
                      });
                    }}
                    className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-white px-4 outline-none focus:border-[#556B2F]"
                  />
                  {openProductDropdownForLine === line.key &&
                  createForLine !== line.key &&
                  line.productQuery.trim() &&
                  !line.productId ? (
                    <div className="z-10 grid max-h-64 gap-1 overflow-y-auto rounded-2xl border border-[#8B5E3C]/20 bg-white p-2 shadow-lg lg:absolute lg:top-[4.75rem] lg:w-full">
                      {matchingProducts.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => selectProduct(line.key, product)}
                          className="min-h-11 rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-[#556B2F]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
                        >
                          {product.name}
                          {product.sku ? (
                            <span className="ml-2 text-xs font-normal text-[#1F1F1F]/50">
                              {product.sku}
                            </span>
                          ) : null}
                        </button>
                      ))}
                      {!exactProduct ? (
                        <button
                          type="button"
                          onClick={() => openProductCreate(line)}
                          className="min-h-11 rounded-xl border border-dashed border-[#556B2F]/35 px-3 py-2 text-left text-sm font-semibold text-[#556B2F] transition hover:bg-[#556B2F]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
                        >
                          + Crear producto nuevo
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <label className="grid min-w-0 gap-2 text-sm font-semibold">
                  Cantidad
                  <input
                    ref={(element) => {
                      quantityInputRefs.current[line.key] = element;
                    }}
                    name="quantity"
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-white px-4 outline-none focus:border-[#556B2F]"
                  />
                </label>

                <label className="grid min-w-0 gap-2 text-sm font-semibold">
                  Costo unitario
                  <input
                    name="unitPurchaseCost"
                    inputMode="decimal"
                    required
                    value={line.unitPurchaseCost}
                    onChange={(event) =>
                      updateLine(line.key, { unitPurchaseCost: event.target.value })
                    }
                    className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-white px-4 outline-none focus:border-[#556B2F]"
                  />
                </label>

                <button
                  type="button"
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) => current.filter((item) => item.key !== line.key))
                  }
                  className="h-12 rounded-2xl border border-[#8B5E3C]/30 px-4 text-sm font-semibold text-[#8B5E3C] transition hover:bg-[#8B5E3C]/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Quitar
                </button>

                {previewLine ? (
                  <p className="text-xs text-[#1F1F1F]/60 lg:col-span-4">
                    Subtotal {currencyFormatter.format(previewLine.supplierLineTotalCents / 100)} · Envio {currencyFormatter.format(previewLine.allocatedShippingTotalCents / 100)} · Costo efectivo unitario {currencyFormatter.format(previewLine.effectiveUnitCostCents / 100)} · Total efectivo {currencyFormatter.format(previewLine.effectiveLineTotalCents / 100)}
                  </p>
                ) : null}

                {createForLine === line.key ? (
                  <div
                    className="grid min-w-0 gap-3 rounded-2xl border border-[#556B2F]/25 bg-white p-4 lg:col-span-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] lg:items-end"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitProductCreate();
                      }
                    }}
                  >
                    <label className="grid min-w-0 gap-2 text-sm font-semibold">
                      Nombre
                      <input
                        autoFocus
                        required
                        value={newProductName}
                        onChange={(event) => setNewProductName(event.target.value)}
                        className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]"
                      />
                    </label>
                    <label className="grid min-w-0 gap-2 text-sm font-semibold">
                      Categoria
                      <select
                        required
                        value={newProductCategoryId}
                        onChange={(event) => setNewProductCategoryId(event.target.value)}
                        className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]"
                      >
                        <option value="">Seleccionar categoria</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid min-w-0 gap-2 text-sm font-semibold">
                      SKU opcional
                      <input
                        value={newProductSku}
                        onChange={(event) => setNewProductSku(event.target.value)}
                        className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          isCreating ||
                          !newProductName.trim() ||
                          !newProductCategoryId
                        }
                        onClick={submitProductCreate}
                        className="h-12 rounded-2xl bg-[#556B2F] px-5 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F] disabled:cursor-not-allowed disabled:bg-[#1F1F1F]/20 disabled:text-[#1F1F1F]/60"
                      >
                        {isCreating ? "Creando..." : "Crear y agregar"}
                      </button>
                      <button
                        type="button"
                        disabled={isCreating}
                        onClick={cancelProductCreate}
                        className="h-12 rounded-2xl border border-[#8B5E3C]/30 px-4 text-sm font-semibold text-[#8B5E3C] transition hover:bg-[#8B5E3C]/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                    {createResult?.status === "error" ? (
                      <p role="alert" className="text-sm font-semibold text-[#8B5E3C] lg:col-span-4">
                        {createResult.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {createResult && createResult.status !== "error" ? (
        <p role="status" className="rounded-2xl border border-[#556B2F]/20 bg-[#556B2F]/10 px-4 py-3 text-sm font-semibold text-[#556B2F]">
          {createResult.message}
        </p>
      ) : null}

      <section className="grid gap-4 rounded-[2rem] border border-[#556B2F]/20 bg-[#556B2F]/5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.7fr)] md:items-end">
        <label className="grid min-w-0 gap-2 text-sm font-semibold">
          Costo de envio
          <input
            name="shippingCost"
            inputMode="decimal"
            required
            value={shippingCost}
            onChange={(event) => setShippingCost(event.target.value)}
            className="h-12 min-w-0 rounded-2xl border border-[#556B2F]/25 bg-white px-4 outline-none focus:border-[#556B2F]"
          />
        </label>

        <div className="grid gap-1 text-sm">
          {preview.calculation ? (
            <>
              <p>Unidades: <strong>{preview.calculation.totalUnits}</strong></p>
              <p>Subtotal proveedor: <strong>{currencyFormatter.format(preview.calculation.supplierSubtotalCents / 100)}</strong></p>
              <p className="text-lg">Total: <strong>{currencyFormatter.format(preview.calculation.totalCostCents / 100)}</strong></p>
            </>
          ) : (
            <p role="alert" className="text-[#8B5E3C]">{preview.error}</p>
          )}
        </div>
      </section>

      <div className="flex justify-end">
        <PendingSubmitButton
          pendingLabel="Guardando borrador..."
          disabled={!preview.calculation || suppliers.length === 0 || availableProducts.length === 0}
          className="rounded-full bg-[#556B2F] px-7 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] disabled:cursor-not-allowed disabled:bg-[#1F1F1F]/20 disabled:text-[#1F1F1F]/60"
        >
          Guardar borrador
        </PendingSubmitButton>
      </div>
    </form>
  );
}
