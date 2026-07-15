"use client";

import {
  formatSavingsLabel,
  getTransferUnitPrice,
  hasTransferPrice,
} from "@/lib/pricing";
import { getProductWhatsAppLink } from "@/lib/whatsapp";
import type { PublicProduct } from "@/services/products";
import { useCartStore } from "@/store/cart-store";

type ProductGridProps = {
  products: PublicProduct[];
  label: string;
  priceMode?: "full" | "compact";
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function getAttribute(product: PublicProduct, name: string) {
  return (
    product.attributes?.find((attribute) => attribute.name === name)?.value ??
    ""
  );
}

function ProductImage({ product }: { product: PublicProduct }) {
  if (product.primaryImageUrl) {
    return (
      <div className="aspect-[4/3] overflow-hidden bg-[#102033]">
        <img
          src={product.primaryImageUrl}
          alt={product.primaryImageAlt ?? product.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
      </div>
    );
  }

  return (
    <div className="flex aspect-[4/3] items-center justify-center bg-[#102033] text-[#F7F9FC]">
      <span className="break-all px-4 text-center text-5xl font-semibold tracking-wide text-[#DCE3EA]">
        {product.imagePlaceholder}
      </span>
    </div>
  );
}

export function ProductGrid({ products, label, priceMode = "full" }: ProductGridProps) {
  const addItem = useCartStore((state) => state.addItem);

  if (products.length === 0) {
    return (
      <div className="mt-10 rounded-[2rem] border border-[#003B73]/15 bg-white/65 p-8 text-center shadow-sm">
        <h2 className="text-2xl font-semibold">La vidriera se estÃ¡ preparando</h2>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[#102033]/65">
          TodavÃ­a no hay productos disponibles en esta categorÃ­a. Consultanos y te ayudamos a encontrar una opciÃ³n para regalar o disfrutar.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => {
        const isAvailable = product.stock > 0;
        const showTransferPrice = hasTransferPrice(product);
        const transferPrice = getTransferUnitPrice(product);
        const savingsLabel = formatSavingsLabel(product.price, product.transferPrice);
        const primaryPrice = showTransferPrice ? transferPrice : product.price;
        const brand = getAttribute(product, "Marca");

        return (
          <article
            key={product.id}
            className={`group flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-[1.75rem] border bg-white/75 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#102033]/10 ${
              isAvailable
                ? "border-[#003B73]/15"
                : "border-[#102033]/10 opacity-75"
            }`}
          >
            <a
              href={`/producto/${product.slug}`}
              className="flex min-w-0 flex-1 flex-col text-inherit outline-none transition focus-visible:ring-2 focus-visible:ring-[#0072CE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F9FC]"
              aria-label={`Ver producto ${product.name}`}
            >
              <ProductImage product={product} />
              <div className="flex min-w-0 flex-1 flex-col justify-between p-5 pb-0 sm:p-6 sm:pb-0">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="max-w-full break-words rounded-full bg-[#0072CE]/10 px-3 py-1 text-xs font-semibold text-[#0072CE]">
                      {label}
                    </span>
                    {brand ? (
                      <span
                        title={brand}
                        className="max-w-full break-words rounded-full bg-[#EEF2F6] px-3 py-1 text-xs font-semibold text-[#003B73]"
                      >
                        {brand}
                      </span>
                    ) : null}
                    <span
                      className={`max-w-full break-words rounded-full px-3 py-1 text-xs font-semibold ${
                        isAvailable
                          ? "bg-[#0072CE] text-[#F7F9FC]"
                          : "bg-[#E52620]/10 text-[#E52620]"
                      }`}
                    >
                      {isAvailable ? "En stock" : "Agotado"}
                    </span>
                  </div>

                  <h2 className="mt-5 break-words text-2xl font-semibold leading-tight text-[#102033] transition group-hover:text-[#0072CE]">
                    {product.name}
                  </h2>
                  <p className="mt-3 break-words text-sm leading-6 text-[#102033]/65">
                    {product.shortDescription}
                  </p>
                </div>

                <div className="mt-7 min-w-0 border-t border-[#003B73]/15 pt-5">
                  {priceMode === "compact" ? (
                    <p className="break-words text-3xl font-semibold leading-tight text-[#102033]">
                      {currencyFormatter.format(primaryPrice)}
                    </p>
                  ) : showTransferPrice ? (
                    <div className="min-w-0 rounded-2xl border border-[#DCE3EA] bg-[#EEF2F6] p-4">
                      <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#0072CE]">
                        Efectivo / transferencia
                      </p>
                      <p className="mt-1 break-words text-3xl font-semibold text-[#102033]">
                        {currencyFormatter.format(transferPrice)}
                      </p>
                      {savingsLabel ? (
                        <span className="mt-2 inline-flex max-w-full rounded-full bg-[#0072CE] px-3 py-1 text-xs font-semibold text-white">
                          {savingsLabel}
                        </span>
                      ) : null}
                      <p className="mt-2 break-words text-sm text-[#102033]/55">
                        Lista: {currencyFormatter.format(product.price)}
                      </p>
                    </div>
                  ) : (
                    <div className="min-w-0 rounded-2xl border border-[#003B73]/10 bg-[#F7F9FC] p-4">
                      <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#102033]/45">
                        Precio lista
                      </p>
                      <p className="mt-1 break-words text-3xl font-semibold text-[#102033]">
                        {currencyFormatter.format(product.price)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </a>

            <div className="min-w-0 p-5 pt-5 sm:p-6 sm:pt-5">
                {isAvailable ? (
                  <div className="mt-5 grid min-w-0 gap-3">
                    <button
                      type="button"
                      onClick={() => addItem(product)}
                      className="flex min-h-12 w-full min-w-0 items-center justify-center rounded-full bg-[#0072CE] px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#003B73]"
                    >
                      Agregar al carrito
                    </button>
                    <a
                      href={`/producto/${product.slug}`}
                      className="flex min-h-12 w-full min-w-0 items-center justify-center rounded-full border border-[#0072CE]/35 px-5 py-3 text-center text-sm font-semibold text-[#0072CE] transition hover:border-[#0072CE] hover:bg-[#EEF2F6]"
                    >
                      Ver producto
                    </a>
                  </div>
                ) : (
                  <a
                    href={getProductWhatsAppLink(product)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 flex min-h-12 w-full min-w-0 items-center justify-center rounded-full border border-[#0072CE]/35 px-5 py-3 text-center text-sm font-semibold text-[#0072CE] transition hover:border-[#0072CE] hover:bg-[#EEF2F6]"
                  >
                    Sin stock: consultar
                  </a>
                )}
            </div>
          </article>
        );
      })}
    </div>
  );
}



