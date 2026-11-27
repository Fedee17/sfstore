"use client";

import { useState, type ReactNode } from "react";
import { publicationAvailable } from "@/lib/products/public-families";
import { getSavingsPercent } from "@/lib/pricing";
import { cardCashPrice, formatWebPrice, hasValidWebPrice } from "@/lib/web-transfer-pricing";
import { getProductWhatsAppLink } from "@/lib/whatsapp";
import type { PublicProduct } from "@/services/products";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { AnalyticsView } from "@/components/analytics-view";
import { analyticsItem } from "@/lib/analytics/client";
import { cardPhotoFraming } from "@/lib/catalog/card-photo-framing";
import styles from "./product-card.module.css";

type CardPricing = { list: number; special: number; savings: number | null; reduced: boolean };
type ProductImageProps = {
  product: Pick<PublicProduct, "primaryImageUrl" | "primaryImageAlt" | "name" | "imagePlaceholder">;
  compact?: boolean;
  isolatedPhoto?: string | null;
  loading?: "eager" | "lazy";
  onImageError?: () => void;
};

export function ProductImage({ product, compact = false, loading = "lazy", isolatedPhoto, onImageError }: ProductImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const isolated = Boolean(isolatedPhoto);
  const url = isolatedPhoto === undefined ? product.primaryImageUrl : isolatedPhoto;
  const imageClass = compact ? styles.cartPhoto : styles.photo;
  const fetchPriority = loading === "eager" ? "low" : undefined;
  function handleFailure() {
    setFailedUrl(url ?? null);
    onImageError?.();
  }
  const inspectImage = (image: HTMLImageElement | null) => {
    if (!image?.complete || image.naturalWidth !== 0) return;
    handleFailure();
  };

  if (url && failedUrl !== url) {
    const framing = compact || isolated ? null : cardPhotoFraming(url);
    const zoomOut = framing?.width && framing.width < 1 ? framing.width : null;
    const framedStyle = framing ? {
      objectPosition: `50% ${framing.focusY}%`,
      ...(zoomOut ? { left: `${(1 - zoomOut) * 50}%`, width: `${zoomOut * 100}%` } : {}),
    } : undefined;
    return (
      <div className={imageClass} data-isolated={isolated ? true : undefined}>
        {zoomOut ? <img src={url} alt="" aria-hidden="true" loading={loading} fetchPriority={fetchPriority} decoding="async" className={styles.backdrop} /> : null}
        <img src={url} alt={product.primaryImageAlt ?? product.name} loading={loading} fetchPriority={fetchPriority} decoding="async" style={framedStyle}
          ref={inspectImage}
          onLoad={({ currentTarget }) => inspectImage(currentTarget)}
          onError={handleFailure} />
      </div>
    );
  }

  return <div className={imageClass} role="img" aria-label={`Imagen no disponible de ${product.name}`}>
    <span className={styles.placeholder}>Imagen no disponible</span>
  </div>;
}

export function ProductCard({ product, label, featured = false, directPurchase = !featured, preview = false, recommendation, featuredPricing, compact = false, from = false, presentation, hideLabel = false, imageLoading, onImageError, homeLayout, isolatedPhoto, pricePanel }: {
  product: PublicProduct;
  label: string;
  featured?: boolean;
  directPurchase?: boolean;
  preview?: boolean;
  recommendation?: string | null;
  featuredPricing?: CardPricing | null;
  compact?: boolean;
  from?: boolean;
  presentation?: "catalog" | "related";
  hideLabel?: boolean;
  homeLayout?: "featured" | "ritual";
  isolatedPhoto?: string;
  pricePanel?: ReactNode;
  imageLoading?: ProductImageProps["loading"];
  onImageError?: () => void;
}) {
  const available = publicationAvailable(product);
  const validPrice = hasValidWebPrice(product.price);
  const transfer = cardCashPrice(product);
  const pricing = featured ? featuredPricing : transfer === null ? null : {
    list: product.price,
    special: transfer,
    savings: getSavingsPercent(product.price, transfer),
    reduced: transfer < product.price,
  };
  const description = featured ? recommendation ?? product.shortDescription : product.shortDescription;
  const brand = product.attributes?.find(({ name }) => name === "Marca")?.value.trim();
  const href = `/producto/${encodeURIComponent(product.slug)}`;
  const related = presentation === "related";
  const fromLabel = featured ? from : (compact || related) && product.kind === "family";
  const Heading = featured || related ? "h3" : "h2";
  const catalogCard = presentation === "catalog";
  const showCategory = !catalogCard && !hideLabel;
  const chooseVariant = product.kind === "family";
  const canPurchase = !related && directPurchase && available && validPrice && Boolean(product.primaryImageUrl?.trim()) && !chooseVariant;

  return (
    <article className={styles.card} data-featured={featured || undefined} data-presentation={presentation} data-home-layout={homeLayout} data-product-slug={product.slug}>
      {!preview && (!featured || directPurchase) ? <AnalyticsView event="view_item_list" identity={`${label}:${product.id}`} params={{ items: [analyticsItem(product)].filter(Boolean) }} /> : null}
      <a href={href} aria-label={`Ver producto ${product.name}`} className={styles.imageLink}>
        <ProductImage product={product} loading={imageLoading}
          isolatedPhoto={isolatedPhoto} onImageError={onImageError} />
      </a>
      <div className={styles.body}>
        {showCategory || brand || !available ? <div className={styles.meta}>
          {showCategory ? <span className={styles.category}>{label}</span> : null}
          {brand ? <span className={styles.brand}>{brand}</span> : null}
          {!available ? <span className={styles.availability} data-available={false}>Agotado</span> : null}
        </div> : null}
        <Heading className={styles.name}>{catalogCard ? <a href={href} className={styles.nameLink}>{product.name}</a> : product.name}</Heading>
        {/* Owner request 20/11: Ritual Matero cards show the title only, without description. */}
        {description && !related && homeLayout !== "ritual" ? <p className={styles.description}>{description}</p> : null}
        <div className={styles.bottom}>
          {pricePanel ?? (pricing ? (
            <>
              {pricing.reduced || !featured ? <p className={styles.list}>
                {featured ? <span className="sr-only">Precio de lista: </span> : "Lista: "}
                {fromLabel ? "Desde " : ""}<s>{formatWebPrice(pricing.list)}</s>
              </p> : null}
              <div className={styles.priceRow}>
                <p className={styles.special}><span className="sr-only">Precio especial: </span>{fromLabel ? <small>Desde </small> : null}{formatWebPrice(pricing.special)}</p>
                <div className={styles.badges}>
                  <span className={styles.payment}>{pricing.savings !== null ? `${pricing.savings}% OFF · ` : ''}<span className={styles.paymentMethod} data-short="Transf.">Transferencia</span> · Efectivo</span>
                </div>
              </div>
            </>
          ) : <p className={styles.list}>Precio a confirmar</p>)}
          <div className={styles.actions}>
            {related || validPrice && (chooseVariant || !canPurchase && (!directPurchase || available)) ? <a href={href} className={styles.button}>{chooseVariant && !related ? "Elegir opción" : "Ver producto"}</a> : null}
            {canPurchase ? <AddToCartButton product={product} compact primary={catalogCard || featured} buttonClassName={homeLayout || catalogCard ? styles.homeBuy : undefined} /> : null}
            {!related && directPurchase && (!available || !validPrice) ? <a href={getProductWhatsAppLink(product)} target="_blank" rel="noopener noreferrer" className={styles.secondary}>
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
      <div className={`${styles.empty} mt-6 rounded-2xl p-6 text-center`}>
        <h2 className="catalog-subtitle">La vidriera se está preparando</h2>
        <p className={`${styles.emptyText} mx-auto mt-3 max-w-lg text-sm leading-6`}>
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

