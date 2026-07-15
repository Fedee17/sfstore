import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import {
  getAdminCategories,
  getAdminProducts,
  type AdminProduct,
  type AdminProductFilters,
} from "@/services/admin";
import {
  archiveProduct,
  toggleProductFeatured,
  updateProductStock,
} from "./actions";

const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
const LOW_STOCK_LIMIT = 3;

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

type ProductsSearchParams = Record<string, string | string[] | undefined>;

type AdminProductsPageProps = {
  searchParams?: Promise<ProductsSearchParams>;
};

function getParam(params: ProductsSearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildProductsUrl(params: {
  search: string;
  category: string;
  status: string;
  stock: string;
  featured: string;
}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const queryString = query.toString();
  return `/admin/productos${queryString ? `?${queryString}` : ""}`;
}

function getStockState(stock: number) {
  if (stock <= 0) {
    return {
      label: "Sin stock",
      className: "border-[#8B5E3C]/25 bg-[#8B5E3C]/10 text-[#8B5E3C]",
    };
  }

  if (stock <= LOW_STOCK_LIMIT) {
    return {
      label: "Stock bajo",
      className: "border-[#8B5E3C]/25 bg-[#F7F4ED] text-[#8B5E3C]",
    };
  }

  return {
    label: "Disponible",
    className: "border-[#556B2F]/25 bg-[#556B2F]/10 text-[#556B2F]",
  };
}

function formatMoney(value: number | null | undefined) {
  return value !== null && value !== undefined
    ? currencyFormatter.format(value)
    : "-";
}

function formatMargin(
  cost: number | null | undefined,
  price: number | null | undefined,
) {
  if (cost === null || cost === undefined || cost <= 0) {
    return "-";
  }

  if (price === null || price === undefined || price <= 0) {
    return "-";
  }

  const margin = price - cost;
  const marginPercentage = (margin / price) * 100;

  return `${currencyFormatter.format(margin)} (${marginPercentage.toFixed(0)}%)`;
}

function hasActiveFilters(filters: AdminProductFilters) {
  return Boolean(
    filters.search ||
      filters.category ||
      filters.status ||
      filters.stock ||
      filters.featured,
  );
}

function getPrimaryProductImage(product: AdminProduct) {
  const images = [...(product.product_images ?? [])].sort((first, second) => {
    if (first.is_primary && !second.is_primary) {
      return -1;
    }

    if (!first.is_primary && second.is_primary) {
      return 1;
    }

    return first.sort_order - second.sort_order;
  });

  return images[0] ?? null;
}

function ProductThumbnail({ product }: { product: AdminProduct }) {
  const image = getPrimaryProductImage(product);

  if (!image) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8B5E3C]/70 sm:h-16 sm:w-16">
        Sin imagen
      </div>
    );
  }

  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] sm:h-16 sm:w-16">
      <img
        src={image.url}
        alt={image.alt ?? product.name}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function ProductStockForm({
  product,
  returnTo,
}: {
  product: AdminProduct;
  returnTo: string;
}) {
  return (
    <form
      action={updateProductStock}
      className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
    >
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="slug" value={product.slug} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input
        name="stock"
        type="number"
        min="0"
        step="1"
        defaultValue={product.stock}
        aria-label={`Stock de ${product.name}`}
        className="h-11 w-full min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm font-semibold outline-none transition focus:border-[#556B2F]"
      />
      <button
        type="submit"
        className="h-11 w-full min-w-0 rounded-2xl border border-[#556B2F]/25 px-4 text-xs font-semibold text-[#556B2F] transition hover:border-[#556B2F] hover:bg-[#556B2F]/10 sm:w-auto"
      >
        Cambiar stock
      </button>
    </form>
  );
}

function PriceBlock({
  label,
  value,
  variant = "neutral",
  note,
}: {
  label: string;
  value: string;
  variant?: "neutral" | "highlight";
  note?: string;
}) {
  return (
    <div
      className={
        variant === "highlight"
          ? "min-w-0 overflow-hidden rounded-2xl border border-[#556B2F]/15 bg-[#556B2F]/5 p-4"
          : "min-w-0 overflow-hidden rounded-2xl border border-[#8B5E3C]/10 bg-[#F7F4ED] p-4"
      }
    >
      <p
        className={
          variant === "highlight"
            ? "break-words text-xs font-semibold uppercase tracking-[0.08em] text-[#556B2F]"
            : "break-words text-xs font-semibold uppercase tracking-[0.08em] text-[#8B5E3C]"
        }
      >
        {label}
      </p>
      <p className="mt-2 break-words font-semibold">{value}</p>
      {note ? (
        <p className="mt-1 break-words text-xs text-[#1F1F1F]/45">{note}</p>
      ) : null}
    </div>
  );
}

export default async function AdminProductsPage({
  searchParams,
}: AdminProductsPageProps) {
  await requireAdminSession();

  const params = searchParams ? await searchParams : {};
  const selectedFilters = {
    search: getParam(params, "search").trim(),
    category: getParam(params, "category").trim(),
    status: getParam(params, "status").trim(),
    stock: getParam(params, "stock").trim(),
    featured: getParam(params, "featured").trim(),
  };
  const productsPath = buildProductsUrl(selectedFilters);
  const productsFilters: AdminProductFilters = {
    search: selectedFilters.search || undefined,
    category: selectedFilters.category || undefined,
    status: PRODUCT_STATUSES.includes(
      selectedFilters.status as (typeof PRODUCT_STATUSES)[number],
    )
      ? selectedFilters.status
      : undefined,
    stock:
      selectedFilters.stock === "low" || selectedFilters.stock === "out"
        ? selectedFilters.stock
        : undefined,
    featured: selectedFilters.featured === "true" ? true : undefined,
  };

  const [productsResult, categoriesResult] = await Promise.all([
    getAdminProducts(productsFilters),
    getAdminCategories(),
  ]);
  const products = productsResult.data ?? [];
  const categories = categoriesResult.data ?? [];
  const isFiltered = hasActiveFilters(productsFilters);

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="flex min-w-0 flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
              Admin
            </p>
            <h1 className="mt-3 break-words text-4xl font-semibold">
              Productos
            </h1>
            <p className="mt-2 break-words text-sm text-[#1F1F1F]/60">
              Gestion rapida del catalogo real, stock manual y productos destacados.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a
              href="/admin/productos/importar"
              className="w-full rounded-full border border-[#8B5E3C]/30 px-6 py-3 text-center text-sm font-semibold text-[#8B5E3C] transition hover:border-[#556B2F] hover:text-[#556B2F] sm:w-auto"
            >
              Importar productos
            </a>
            <a
              href="/admin/productos/nuevo"
              className="w-full rounded-full bg-[#556B2F] px-6 py-3 text-center text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] sm:w-auto"
            >
              Nuevo producto
            </a>
          </div>
        </div>

        {productsResult.error || categoriesResult.error ? (
          <div className="mt-8 overflow-hidden rounded-3xl border border-[#8B5E3C]/20 bg-white/70 p-5 text-sm font-semibold text-[#8B5E3C]">
            <p className="break-words">
              {productsResult.error ?? categoriesResult.error}
            </p>
          </div>
        ) : null}

        <form className="mt-8 overflow-hidden rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="grid min-w-0 gap-2">
              <span className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
                Buscar producto
              </span>
              <input
                name="search"
                defaultValue={selectedFilters.search}
                placeholder="Nombre, slug o SKU"
                className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
              />
            </label>

            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <button
                type="submit"
                className="h-12 min-w-0 rounded-2xl bg-[#556B2F] px-5 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826]"
              >
                Aplicar filtros
              </button>
              {isFiltered ? (
                <a
                  href="/admin/productos"
                  className="flex h-12 min-w-0 items-center justify-center rounded-2xl border border-[#8B5E3C]/30 px-5 text-center text-sm font-semibold text-[#8B5E3C] transition hover:border-[#8B5E3C] hover:bg-[#F7F4ED]"
                >
                  Limpiar
                </a>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid min-w-0 gap-2">
              <span className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
                Categoria
              </span>
              <select
                name="category"
                defaultValue={selectedFilters.category}
                className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
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
              <span className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
                Estado
              </span>
              <select
                name="status"
                defaultValue={selectedFilters.status}
                className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
              >
                <option value="">Todos</option>
                {PRODUCT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-2">
              <span className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
                Stock
              </span>
              <select
                name="stock"
                defaultValue={selectedFilters.stock}
                className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
              >
                <option value="">Todos</option>
                <option value="low">Stock bajo</option>
                <option value="out">Sin stock</option>
              </select>
            </label>

            <label className="grid min-w-0 gap-2">
              <span className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
                Destacados
              </span>
              <select
                name="featured"
                defaultValue={selectedFilters.featured}
                className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
              >
                <option value="">Todos</option>
                <option value="true">Solo destacados</option>
              </select>
            </label>
          </div>
        </form>

        <div className="mt-5 flex min-w-0 flex-wrap gap-3 text-sm text-[#1F1F1F]/60">
          <span className="break-words rounded-full border border-[#8B5E3C]/15 bg-white/60 px-4 py-2">
            {products.length} producto{products.length === 1 ? "" : "s"}
          </span>
          <span className="break-words rounded-full border border-[#556B2F]/15 bg-white/60 px-4 py-2">
            Stock bajo:{" "}
            {
              products.filter(
                (product) =>
                  product.stock > 0 && product.stock <= LOW_STOCK_LIMIT,
              ).length
            }
          </span>
          <span className="break-words rounded-full border border-[#8B5E3C]/15 bg-white/60 px-4 py-2">
            Sin stock: {products.filter((product) => product.stock <= 0).length}
          </span>
        </div>

        {products.length === 0 ? (
          <div className="mt-8 overflow-hidden rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-8 text-center shadow-sm">
            <h2 className="break-words text-2xl font-semibold">
              {isFiltered ? "Sin resultados" : "Sin productos en Supabase"}
            </h2>
            <p className="mx-auto mt-3 max-w-xl break-words text-sm leading-6 text-[#1F1F1F]/60">
              {isFiltered
                ? "No encontramos productos con esos filtros. Proba ajustar la busqueda."
                : "Todavia no hay productos cargados en Supabase. El catalogo publico sigue usando data/products.ts temporalmente."}
            </p>
          </div>
        ) : (
          <div className="mt-8 grid min-w-0 gap-4">
            {products.map((product) => {
              const stockState = getStockState(product.stock);
              const marginBasePrice = product.transfer_price ?? product.price;

              return (
                <article
                  key={product.id}
                  className="min-w-0 overflow-hidden rounded-[1.75rem] border border-[#8B5E3C]/15 bg-white/70 p-5 text-sm shadow-sm"
                >
                  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.9fr)] xl:items-start">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <ProductThumbnail product={product} />
                          <div className="min-w-0">
                            <p className="max-w-full break-words text-lg font-semibold leading-snug">
                              {product.name}
                            </p>
                            <p
                              className="mt-1 break-words text-xs text-[#1F1F1F]/55"
                              title={`${product.categories?.name ?? "Sin categoria"} - ${product.slug}`}
                            >
                              <span className="break-words">
                                {product.categories?.name ?? "Sin categoria"}
                              </span>{" "}
                              - <span className="break-all">{product.slug}</span>
                            </p>
                            <p
                              className="mt-1 break-all text-xs text-[#1F1F1F]/45"
                              title={product.sku ?? undefined}
                            >
                              SKU: {product.sku || "-"}
                            </p>
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-wrap gap-2 sm:justify-end">
                          <span className="max-w-full break-words rounded-full border border-[#8B5E3C]/20 px-3 py-1 text-xs font-semibold text-[#1F1F1F]/70">
                            {product.status}
                          </span>
                          {product.featured ? (
                            <span className="max-w-full break-words rounded-full bg-[#556B2F] px-3 py-1 text-xs font-semibold text-[#F7F4ED]">
                              Destacado
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <PriceBlock
                          label="Precio lista"
                          value={formatMoney(product.price)}
                        />
                        <PriceBlock
                          label="Transferencia/efectivo"
                          value={formatMoney(product.transfer_price)}
                          variant="highlight"
                        />
                        <PriceBlock
                          label="Costo"
                          value={formatMoney(product.cost)}
                        />
                        <PriceBlock
                          label="Margen"
                          value={formatMargin(product.cost, marginBasePrice)}
                          note={
                            product.transfer_price
                              ? "sobre precio especial"
                              : undefined
                          }
                        />
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-3 overflow-hidden rounded-3xl border border-[#8B5E3C]/10 bg-[#F7F4ED]/70 p-4">
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8B5E3C]">
                            Stock
                          </p>
                          <p className="mt-1 break-words text-lg font-semibold">
                            {product.stock} unidad
                            {product.stock === 1 ? "" : "es"}
                          </p>
                        </div>
                        <span
                          className={`max-w-full break-words rounded-full border px-3 py-1 text-xs font-semibold ${stockState.className}`}
                        >
                          {stockState.label}
                        </span>
                      </div>

                      <div className="grid min-w-0 gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8B5E3C]">
                          Acciones
                        </p>
                        <a
                          href={`/admin/productos/${product.id}/editar`}
                          className="flex h-11 min-w-0 items-center justify-center rounded-2xl border border-[#8B5E3C]/25 px-4 text-center text-xs font-semibold text-[#8B5E3C] transition hover:border-[#556B2F] hover:text-[#556B2F]"
                        >
                          Editar
                        </a>
                        <form action={toggleProductFeatured} className="min-w-0">
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="slug" value={product.slug} />
                          <input
                            type="hidden"
                            name="featured"
                            value={product.featured ? "false" : "true"}
                          />
                          <input type="hidden" name="returnTo" value={productsPath} />
                          <button
                            type="submit"
                            className={
                              product.featured
                                ? "h-11 w-full min-w-0 rounded-2xl bg-[#556B2F] px-4 text-xs font-semibold text-[#F7F4ED] transition hover:bg-[#465826]"
                                : "h-11 w-full min-w-0 rounded-2xl border border-[#556B2F]/25 px-4 text-xs font-semibold text-[#556B2F] transition hover:border-[#556B2F] hover:bg-[#556B2F]/10"
                            }
                          >
                            {product.featured ? "Quitar destacado" : "Destacar"}
                          </button>
                        </form>
                        <ProductStockForm product={product} returnTo={productsPath} />
                        {product.status !== "archived" ? (
                          <form action={archiveProduct} className="min-w-0">
                            <input
                              type="hidden"
                              name="productId"
                              value={product.id}
                            />
                            <input type="hidden" name="slug" value={product.slug} />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={productsPath}
                            />
                            <button
                              type="submit"
                              className="h-11 w-full min-w-0 rounded-2xl border border-[#1F1F1F]/15 px-4 text-xs font-semibold text-[#1F1F1F]/65 transition hover:border-[#8B5E3C] hover:text-[#8B5E3C]"
                            >
                              Archivar
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

