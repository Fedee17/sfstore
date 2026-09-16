import {
  CATALOG_ATTRIBUTE_KEYS,
  getCatalogAttributeOptionLabel,
  getCatalogAttributeValues,
} from "@/lib/catalog/attribute-config";
import { getQuickCatalogPrimaryImage } from "@/lib/admin/quick-catalog";
import { getPerfumeRecommendationReasons } from "@/lib/admin/perfume-recommendation-reasons";
import type { QuickCatalogProduct } from "@/lib/admin/quick-catalog";
import type { PerfumeRecommendation } from "@/lib/catalog/perfume-recommendation";

type RecommendationTone = "primary" | "secondary" | "unavailable" | "decant";

type ConsultationProductCardProps = {
  product: QuickCatalogProduct;
  recommendation?: PerfumeRecommendation<QuickCatalogProduct>;
  tone?: RecommendationTone;
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

const toneClasses: Record<RecommendationTone, string> = {
  primary: "border-[#556B2F]/35",
  secondary: "border-[#8B5E3C]/20",
  unavailable: "border-[#A33A2B]/20 opacity-90",
  decant: "border-[#0066CC]/20",
};

function getStockLabel(stock: number) {
  if (stock <= 0) {
    return {
      label: "Sin stock",
      className: "border-[#A33A2B]/20 bg-[#A33A2B]/10 text-[#8B2F24]",
    };
  }
  if (stock === 1) {
    return {
      label: "Última unidad",
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

function getDisplayValues(
  product: QuickCatalogProduct,
  key: keyof typeof CATALOG_ATTRIBUTE_KEYS,
) {
  const attributeKey = CATALOG_ATTRIBUTE_KEYS[key];
  return getCatalogAttributeValues(product.attributes, attributeKey).map(
    (value) => getCatalogAttributeOptionLabel(attributeKey, value),
  );
}

function getPerfumeSummary(product: QuickCatalogProduct) {
  if (product.category?.slug !== "perfumes") return [];
  const commercialCategory = getDisplayValues(product, "commercialCategory")[0];
  const gender = getDisplayValues(product, "gender")[0];
  const families = getDisplayValues(product, "olfactoryFamily");
  const intensity = getDisplayValues(product, "intensity")[0];
  const occasions = getDisplayValues(product, "occasion");
  const mainLine = [
    commercialCategory,
    gender,
    families.length > 0 ? families.join(" / ") : null,
    intensity,
  ].filter(Boolean);

  return [mainLine.join(" · "), occasions.join(" · ")].filter(Boolean);
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

export function ConsultationProductCard({
  product,
  recommendation,
  tone = "secondary",
}: ConsultationProductCardProps) {
  const stock = getStockLabel(product.stock);
  const perfumeSummary = getPerfumeSummary(product);
  const reasons = recommendation
    ? getPerfumeRecommendationReasons(recommendation)
    : [];

  return (
    <article
      className={`grid min-w-0 overflow-hidden rounded-lg border bg-white/85 shadow-sm sm:grid-cols-[128px_minmax(0,1fr)] ${toneClasses[tone]}`}
    >
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
              {product.category?.name ?? "Sin categoría"}
              {product.sku ? ` · SKU ${product.sku}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {recommendation ? (
              <span className="rounded-full border border-[#556B2F]/25 bg-[#556B2F]/10 px-3 py-1 text-xs font-semibold text-[#465826]">
                {recommendation.matchPercentage}% de coincidencia
              </span>
            ) : null}
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${stock.className}`}
            >
              {stock.label}
            </span>
          </div>
        </div>

        {reasons.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <span
                key={reason}
                className="rounded-full bg-[#F7F4ED] px-3 py-1 text-xs font-semibold text-[#6F4B30]"
              >
                {reason}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
          <div className="min-w-0 bg-[#F7F4ED] px-3 py-2">
            <p className="text-xs font-semibold text-[#8B5E3C]">Precio lista</p>
            <p className="mt-1 break-words font-semibold">
              {formatMoney(product.price)}
            </p>
          </div>
          <div className="min-w-0 bg-[#556B2F]/10 px-3 py-2">
            <p className="text-xs font-semibold text-[#556B2F]">
              Efectivo / transferencia
            </p>
            <p className="mt-1 break-words font-semibold">
              {formatMoney(product.transfer_price)}
            </p>
          </div>
        </div>

        {perfumeSummary.length > 0 ? (
          <div className="mt-3 min-w-0 border-l-2 border-[#8B5E3C]/20 pl-3 text-sm text-[#1F1F1F]/70">
            {perfumeSummary.map((line) => (
              <p key={line} className="break-words">
                {line}
              </p>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-[#1F1F1F]/10 px-3 py-1 font-semibold text-[#1F1F1F]/65">
            {statusLabels[product.status] ?? product.status}
          </span>
          <span className="rounded-full border border-[#1F1F1F]/10 px-3 py-1 font-semibold text-[#1F1F1F]/65">
            {product.stock} unidad{product.stock === 1 ? "" : "es"}
          </span>
        </div>

        <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <details className="group min-w-0 border border-[#8B5E3C]/15 bg-[#F7F4ED] px-3 py-2">
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
            className="flex min-h-11 items-center justify-center rounded-md border border-[#556B2F]/30 px-4 text-center text-sm font-semibold text-[#465826] transition hover:bg-[#556B2F]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
          >
            Editar
          </a>
        </div>
      </div>
    </article>
  );
}
