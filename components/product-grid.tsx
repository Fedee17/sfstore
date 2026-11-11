"use client";

import { useState, type CSSProperties } from "react";
import { publicationAvailable } from "@/lib/products/public-families";
import { getSavingsPercent } from "@/lib/pricing";
import { formatWebPrice, getWebTransferPrice, hasValidWebPrice } from "@/lib/web-transfer-pricing";
import { getProductWhatsAppLink } from "@/lib/whatsapp";
import type { PublicProduct } from "@/services/products";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { AnalyticsView } from "@/components/analytics-view";
import { analyticsItem } from "@/lib/analytics/client";
import styles from "./product-card.module.css";

type CardPricing = { list: number; special: number; savings: number | null; reduced: boolean };
type ProductImageProps = {
  product: Pick<PublicProduct, "primaryImageUrl" | "primaryImageAlt" | "name" | "imagePlaceholder">;
  compact?: boolean;
  onImageError?: () => void;
};

export function ProductImage({ product, compact = false, onImageError }: ProductImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = product.primaryImageUrl;
  const imageClass = compact ? styles.cartPhoto : styles.photo;
  const inspectImage = (image: HTMLImageElement | null) => {
    if (!image?.complete) return;
    if (image.naturalWidth === 0) {
      setFailedUrl(url ?? null);
      onImageError?.();
      return;
    }
    image.dataset.orientation = image.naturalHeight > image.naturalWidth ? "portrait" : "landscape";
  };

  if (url && failedUrl !== url) {
    return (
      <div className={imageClass}>
        <img src={url} alt={product.primaryImageAlt ?? product.name} loading="lazy" decoding="async"
          ref={inspectImage}
          onLoad={({ currentTarget }) => inspectImage(currentTarget)}
          onError={() => {setFailedUrl(url);onImageError?.();}} />
      </div>
    );
  }

  return <div className={imageClass} role="img" aria-label={`Imagen no disponible de ${product.name}`}>
    <span className={styles.placeholder}>Imagen no disponible</span>
  </div>;
}

export function ProductCard({ product, label, featured = false, directPurchase = !featured, preview = false, recommendation, featuredPricing, compact = false, from = false, presentation, onImageError }: {
  product: PublicProduct;
  label: string;
  featured?: boolean;
  directPurchase?: boolean;
  preview?: boolean;
  recommendation?: string | null;
  featuredPricing?: CardPricing | null;
  compact?: boolean;
  from?: boolean;
  presentation?: "catalog";
  onImageError?: () => void;
}) {
  const available = publicationAvailable(product);
  const validPrice = hasValidWebPrice(product.price);
  const transfer = validPrice ? getWebTransferPrice(product.price) : null;
  const pricing = featured ? featuredPricing : transfer === null ? null : {
    list: product.price,
    special: transfer,
    savings: getSavingsPercent(product.price, transfer),
    reduced: transfer < product.price,
  };
  const description = featured ? recommendation : product.shortDescription;
  const brand = featured ? undefined : product.attributes?.find(({ name }) => name === "Marca")?.value;
  const href = `/producto/${encodeURIComponent(product.slug)}`;
  const fromLabel = featured ? from : compact && product.kind === "family";
  const Heading = featured ? "h3" : "h2";
  const catalogCard = presentation === "catalog";
  const chooseVariant = product.kind === "family";
  const canPurchase = directPurchase && available && validPrice && Boolean(product.primaryImageUrl?.trim()) && !chooseVariant;

  return (
    <article className={styles.card} data-featured={featured || undefined} data-presentation={presentation} data-product-slug={product.slug}
      style={featured && product.primaryImageUrl ? { "--featured-photo": `url(${JSON.stringify(product.primaryImageUrl)})` } as CSSProperties : undefined}>
      {!preview && (!featured || directPurchase) ? <AnalyticsView event="view_item_list" identity={`${label}:${product.id}`} params={{ items: [analyticsItem(product)].filter(Boolean) }} /> : null}
      <a href={href} aria-label={`Ver producto ${product.name}`} className={styles.imageLink}>
        <ProductImage product={product} onImageError={onImageError} />
      </a>
      <div className={styles.body}>
        <div className={styles.meta}>
          {!catalogCard ? <span className={styles.category}>{label}</span> : null}
          {brand ? <span className={styles.brand}>{brand}</span> : null}
          {!featured || !available ? <span className={styles.availability} data-available={available}>{available ? "En stock" : "Agotado"}</span> : null}
        </div>
        <Heading className={styles.name}>{catalogCard ? <a href={href} className={styles.nameLink}>{product.name}</a> : product.name}</Heading>
        {description ? <p className={styles.description}>{description}</p> : null}
        <div className={styles.bottom}>
          {pricing ? (
            <>
              {pricing.reduced || !featured ? <p className={styles.list}>
                {featured ? <span className="sr-only">Precio de lista: </span> : "Lista: "}
                <s>{fromLabel ? "Desde " : ""}{formatWebPrice(pricing.list)}</s>
              </p> : null}
              <div className={styles.priceRow}>
                <p className={styles.special}><span className="sr-only">Precio especial: </span>{fromLabel ? <small>Desde </small> : null}{formatWebPrice(pricing.special)}</p>
                <div className={styles.badges}>
                  <span className={styles.payment}>{pricing.savings !== null ? `${pricing.savings}% OFF · ` : ''}Transferencia · Efectivo</span>
                </div>
              </div>
            </>
          ) : <p className={styles.list}>Precio a confirmar</p>}
          <div className={styles.actions}>
            {validPrice && (chooseVariant || !canPurchase && (!directPurchase || available)) ? <a href={href} className={styles.button}>{chooseVariant ? "Elegir opción" : "Ver producto"}</a> : null}
            {canPurchase ? <AddToCartButton product={product} compact primary={catalogCard || featured} /> : null}
            {directPurchase && (!available || !validPrice) ? <a href={getProductWhatsAppLink(product)} target="_blank" rel="noopener noreferrer" className={styles.secondary}>
              {validPrice ? "Sin stock: consultar" : "Consultar precio"}
            </a> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, label, priceMode = "full", presentation }: { products: PublicProduct[]; label: string; priceMode?: "full" | "compact"; presentation?: "catalog" }) {
  if (!products.length) {
    return (
      <div className="mt-6 rounded-2xl border border-[#003B73]/15 bg-white p-6 text-center">
        <h2 className="catalog-subtitle">La vidriera se está preparando</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#102033]/65">
          Todavía no hay productos disponibles en esta categoría. Consultanos y te ayudamos a encontrar una opción para regalar o disfrutar.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {products.map((product) => <ProductCard key={product.id} product={product} label={label} compact={priceMode === "compact"} presentation={presentation} />)}
    </div>
  );
}

