import Link from "next/link";

import { ConsultationProductCard } from "@/components/admin/consulta/consultation-product-card";
import {
  GetNavigationForm,
  GetNavigationSubmitButton,
} from "@/components/admin/get-navigation-form";
import {
  getCatalogAttributeNameAliases,
  getCatalogAttributeOptionLabel,
  getCatalogAttributeValues,
  MATE_ATTRIBUTE_FIELDS,
  PERFUME_ATTRIBUTE_FIELDS,
} from "@/lib/catalog/attribute-config";
import {
  filterQuickCatalogProducts,
  type QuickCatalogFilters,
  type QuickCatalogProduct,
} from "@/lib/admin/quick-catalog";
import type { ConsultationSearchParams } from "@/lib/admin/perfume-recommendation-query";

const managedAttributeFields = [
  ...PERFUME_ATTRIBUTE_FIELDS,
  ...MATE_ATTRIBUTE_FIELDS,
];

function getParam(params: ConsultationSearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getAvailableAttributeFilters(products: QuickCatalogProduct[]) {
  return managedAttributeFields
    .map((field) => {
      const values = new Set<string>();
      for (const product of products) {
        for (const value of getCatalogAttributeValues(
          product.attributes,
          field.key,
        )) {
          values.add(value);
        }
      }
      return {
        ...field,
        values: [...values].sort((left, right) =>
          left.localeCompare(right, "es"),
        ),
      };
    })
    .filter((field) => field.values.length > 0);
}

export function QuickCatalogView({
  products,
  params,
}: {
  products: QuickCatalogProduct[];
  params: ConsultationSearchParams;
}) {
  const categories = [
    ...new Map(
      products
        .map((product) => product.category)
        .filter((category): category is NonNullable<typeof category> =>
          Boolean(category),
        )
        .map((category) => [category.id, category]),
    ).values(),
  ].sort((left, right) => left.name.localeCompare(right.name, "es"));
  const availableAttributeFilters = getAvailableAttributeFilters(products);
  const attributes = Object.fromEntries(
    availableAttributeFilters.map((field) => [
      field.key,
      getParam(params, `attribute_${field.key}`),
    ]),
  );
  const stockParam = getParam(params, "stock");
  const filters: QuickCatalogFilters = {
    search: getParam(params, "search"),
    categoryId: getParam(params, "category"),
    status: getParam(params, "status"),
    stock: stockParam === "in" || stockParam === "out" ? stockParam : undefined,
    attributes,
    attributeAliases: Object.fromEntries(
      availableAttributeFilters.map((field) => [
        field.key,
        getCatalogAttributeNameAliases(field.key),
      ]),
    ),
  };
  const filteredProducts = filterQuickCatalogProducts(products, filters);

  return (
    <>
      <GetNavigationForm className="mt-6 border border-[#8B5E3C]/15 bg-white/80 p-4 shadow-sm">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(280px,1fr)_repeat(3,minmax(150px,0.35fr))_auto] lg:items-end">
          <label className="grid min-w-0 gap-2">
            <span className="text-xs font-semibold uppercase text-[#8B5E3C]">
              Buscar
            </span>
            <input
              name="search"
              defaultValue={filters.search}
              placeholder="Asad, perfume dulce, mate imperial..."
              autoFocus
              className="h-12 min-w-0 rounded-md border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
            />
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-xs font-semibold uppercase text-[#8B5E3C]">
              Categoría
            </span>
            <select
              name="category"
              defaultValue={filters.categoryId}
              className="h-12 min-w-0 rounded-md border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3 outline-none focus:border-[#556B2F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-xs font-semibold uppercase text-[#8B5E3C]">
              Estado
            </span>
            <select
              name="status"
              defaultValue={filters.status}
              className="h-12 min-w-0 rounded-md border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3 outline-none focus:border-[#556B2F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
            >
              <option value="">Todos</option>
              <option value="active">Activo</option>
              <option value="draft">Borrador</option>
              <option value="archived">Archivado</option>
            </select>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="text-xs font-semibold uppercase text-[#8B5E3C]">
              Stock
            </span>
            <select
              name="stock"
              defaultValue={filters.stock}
              className="h-12 min-w-0 rounded-md border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3 outline-none focus:border-[#556B2F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
            >
              <option value="">Todos</option>
              <option value="in">Con stock</option>
              <option value="out">Sin stock</option>
            </select>
          </label>

          <GetNavigationSubmitButton
            pendingLabel="Buscando..."
            className="h-12 rounded-md bg-[#556B2F] px-5 font-semibold text-white transition hover:bg-[#465826] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Buscar
          </GetNavigationSubmitButton>
        </div>

        {availableAttributeFilters.length > 0 ? (
          <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {availableAttributeFilters.map((field) => (
              <label key={field.key} className="grid min-w-0 gap-2">
                <span className="text-xs font-semibold uppercase text-[#8B5E3C]">
                  {field.label}
                </span>
                <select
                  name={`attribute_${field.key}`}
                  defaultValue={attributes[field.key]}
                  className="h-11 min-w-0 rounded-md border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3 text-sm outline-none focus:border-[#556B2F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
                >
                  <option value="">Todos</option>
                  {field.values.map((value) => (
                    <option key={value} value={value}>
                      {field.options.find((option) => option.value === value)
                        ?.label ??
                        getCatalogAttributeOptionLabel(field.key, value)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : null}
      </GetNavigationForm>

      <div className="mt-5 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#1F1F1F]/60">
          {filteredProducts.length} resultado
          {filteredProducts.length === 1 ? "" : "s"}
        </p>
        <Link
          href="/admin/consulta"
          className="text-sm font-semibold text-[#8B5E3C] hover:text-[#556B2F]"
        >
          Limpiar filtros
        </Link>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="mt-6 border border-[#8B5E3C]/15 bg-white/75 p-8 text-center">
          <h2 className="text-xl font-semibold">Sin resultados</h2>
          <p className="mt-2 text-sm text-[#1F1F1F]/60">
            Probá otro nombre o ampliá los filtros.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid min-w-0 gap-4 xl:grid-cols-2">
          {filteredProducts.map((product) => (
            <ConsultationProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </>
  );
}
