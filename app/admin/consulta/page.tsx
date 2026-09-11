import { AdminNav } from "@/components/admin/admin-nav";
import {
  PERFUME_ATTRIBUTE_FIELDS,
  MATE_ATTRIBUTE_FIELDS,
} from "@/lib/catalog/attribute-config";
import {
  filterQuickCatalogProducts,
  getQuickCatalogPrimaryImage,
  type QuickCatalogFilters,
  type QuickCatalogProduct,
} from "@/lib/admin/quick-catalog";
import { requireAdminSession } from "@/lib/admin-session";
import { getQuickCatalogProducts } from "@/services/admin-catalog";

type SearchParams = Record<string, string | string[] | undefined>;

type AdminQuickCatalogPageProps = {
  searchParams?: Promise<SearchParams>;
};

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

const statusLabels: Record<string, string> = {
  active: "Activo",
  draft: "Borrador",
  archived: "Archivado",
};

const managedAttributeFields = [
  ...PERFUME_ATTRIBUTE_FIELDS,
  ...MATE_ATTRIBUTE_FIELDS,
];

function getParam(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getStockLabel(stock: number) {
  if (stock <= 0) {
    return {
      label: "Sin stock",
      className: "border-[#A33A2B]/20 bg-[#A33A2B]/10 text-[#8B2F24]",
    };
  }

  if (stock === 1) {
    return {
      label: "Ultima unidad",
      className: "border-[#9A6700]/20 bg-[#F5C451]/15 text-[#7A5200]",
    };
  }

  return {
    label: "En stock",
    className: "border-[#556B2F]/20 bg-[#556B2F]/10 text-[#465826]",
  };
}

function formatMoney(value: number | null) {
  return value === null ? "No definido" : moneyFormatter.format(value);
}

function getAvailableAttributeFilters(products: QuickCatalogProduct[]) {
  return managedAttributeFields
    .map((field) => {
      const values = new Set<string>();

      for (const product of products) {
        for (const attribute of product.attributes) {
          if (attribute.name === field.key && attribute.value.trim()) {
            values.add(attribute.value.trim());
          }
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

function ProductImage({ product }: { product: QuickCatalogProduct }) {
  const image = getQuickCatalogPrimaryImage(product);

  if (!image) {
    return (
      <div className="flex aspect-square w-full items-center justify-center bg-[#EEE8DA] text-2xl font-semibold text-[#8B5E3C]">
        {product.name.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.url}
      alt={image.alt ?? product.name}
      className="aspect-square w-full object-cover"
      loading="lazy"
    />
  );
}

function ProductCard({ product }: { product: QuickCatalogProduct }) {
  const stock = getStockLabel(product.stock);

  return (
    <article className="grid min-w-0 overflow-hidden rounded-3xl border border-[#8B5E3C]/15 bg-white/80 shadow-sm sm:grid-cols-[128px_minmax(0,1fr)]">
      <div className="overflow-hidden border-b border-[#8B5E3C]/10 sm:border-b-0 sm:border-r">
        <ProductImage product={product} />
      </div>

      <div className="min-w-0 p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="break-words text-lg font-semibold leading-snug">
              {product.name}
            </p>
            <p className="mt-1 break-words text-xs text-[#1F1F1F]/55">
              {product.category?.name ?? "Sin categoria"}
              {product.sku ? ` · SKU ${product.sku}` : ""}
            </p>
          </div>
          <span
            className={`max-w-full rounded-full border px-3 py-1 text-xs font-semibold ${stock.className}`}
          >
            {stock.label}
          </span>
        </div>

        <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
          <div className="min-w-0 rounded-2xl bg-[#F7F4ED] px-3 py-2">
            <p className="text-xs font-semibold text-[#8B5E3C]">Precio lista</p>
            <p className="mt-1 break-words font-semibold">
              {formatMoney(product.price)}
            </p>
          </div>
          <div className="min-w-0 rounded-2xl bg-[#556B2F]/10 px-3 py-2">
            <p className="text-xs font-semibold text-[#556B2F]">
              Efectivo / transferencia
            </p>
            <p className="mt-1 break-words font-semibold">
              {formatMoney(product.transfer_price)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-[#1F1F1F]/10 px-3 py-1 font-semibold text-[#1F1F1F]/65">
            {statusLabels[product.status] ?? product.status}
          </span>
          <span className="rounded-full border border-[#1F1F1F]/10 px-3 py-1 font-semibold text-[#1F1F1F]/65">
            {product.stock} unidad{product.stock === 1 ? "" : "es"}
          </span>
        </div>

        <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <details className="group min-w-0 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] px-3 py-2">
            <summary className="cursor-pointer select-none font-semibold text-[#8B5E3C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]">
              Ver detalle
            </summary>
            <div className="mt-3 grid min-w-0 gap-2 text-xs text-[#1F1F1F]/70">
              <p className="break-all">Slug: {product.slug}</p>
              {product.attributes.length > 0 ? (
                product.attributes.map((attribute, index) => (
                  <p
                    key={`${attribute.name}-${attribute.value}-${index}`}
                    className="break-words"
                  >
                    <strong>{attribute.name}:</strong> {attribute.value}
                  </p>
                ))
              ) : (
                <p>Sin atributos comerciales cargados.</p>
              )}
            </div>
          </details>

          <a
            href={`/admin/productos/${product.id}/editar`}
            className="flex min-h-11 items-center justify-center rounded-2xl bg-[#556B2F] px-4 text-center text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
          >
            Editar producto
          </a>
        </div>
      </div>
    </article>
  );
}

export default async function AdminQuickCatalogPage({
  searchParams,
}: AdminQuickCatalogPageProps) {
  await requireAdminSession();

  const params = searchParams ? await searchParams : {};
  const catalog = await getQuickCatalogProducts();
  const categories = [
    ...new Map(
      catalog.data
        .map((product) => product.category)
        .filter((category): category is NonNullable<typeof category> =>
          Boolean(category),
        )
        .map((category) => [category.id, category]),
    ).values(),
  ].sort((left, right) => left.name.localeCompare(right.name, "es"));
  const availableAttributeFilters = getAvailableAttributeFilters(catalog.data);
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
  };
  const products = filterQuickCatalogProducts(catalog.data, filters);

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
            Atencion en mostrador
          </p>
          <h1 className="mt-2 break-words text-3xl font-semibold sm:text-4xl">
            Consulta rapida
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#1F1F1F]/60">
            Busca por nombre, SKU, categoria o atributos del catalogo real.
          </p>
        </div>

        <form className="mt-6 rounded-3xl border border-[#8B5E3C]/15 bg-white/80 p-4 shadow-sm">
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
                className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]"
              />
            </label>

            <label className="grid min-w-0 gap-2">
              <span className="text-xs font-semibold uppercase text-[#8B5E3C]">
                Categoria
              </span>
              <select
                name="category"
                defaultValue={filters.categoryId}
                className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3 outline-none focus:border-[#556B2F]"
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
                className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3 outline-none focus:border-[#556B2F]"
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
                className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3 outline-none focus:border-[#556B2F]"
              >
                <option value="">Todos</option>
                <option value="in">Con stock</option>
                <option value="out">Sin stock</option>
              </select>
            </label>

            <button
              type="submit"
              className="h-12 rounded-2xl bg-[#556B2F] px-5 font-semibold text-[#F7F4ED] transition hover:bg-[#465826] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
            >
              Buscar
            </button>
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
                    className="h-11 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3 text-sm outline-none focus:border-[#556B2F]"
                  >
                    <option value="">Todos</option>
                    {field.values.map((value) => (
                      <option key={value} value={value}>
                        {field.options.find((option) => option.value === value)
                          ?.label ?? value}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
        </form>

        {catalog.error ? (
          <p
            role="alert"
            className="mt-6 rounded-2xl border border-[#A33A2B]/20 bg-[#A33A2B]/10 p-4 text-sm font-semibold text-[#8B2F24]"
          >
            {catalog.error}
          </p>
        ) : null}

        <div className="mt-5 flex min-w-0 flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#1F1F1F]/60">
            {products.length} resultado{products.length === 1 ? "" : "s"}
          </p>
          <a
            href="/admin/consulta"
            className="text-sm font-semibold text-[#8B5E3C] hover:text-[#556B2F]"
          >
            Limpiar filtros
          </a>
        </div>

        {products.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-[#8B5E3C]/15 bg-white/75 p-8 text-center">
            <h2 className="text-xl font-semibold">Sin resultados</h2>
            <p className="mt-2 text-sm text-[#1F1F1F]/60">
              Proba otro nombre o amplia los filtros.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid min-w-0 gap-4 xl:grid-cols-2">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
