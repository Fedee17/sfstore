"use client";
import { ProductCard } from "@/components/product-grid";
import { getHomeCardPricing, getHomeCardRecommendation } from "@/lib/catalog/home-card-presentation";
import type { HomeFeaturedProduct } from "@/lib/catalog/home-selection";
import { publicCategoryLabels, publicCategoryPaths } from "@/lib/catalog/public-product-visibility";
import { ProductPricePanel } from "@/components/product-price-panel";
import isolatedPhotos from "@/lib/catalog/home-isolated-photos.json";
import { HomeFeaturedCarousel } from "./home-featured-carousel";

const isolatedPhotosBySource = new Map(isolatedPhotos.map(({ source, asset }) => [source, asset]));

export function HomeProductCarousel({ products, label, layout = "featured", directPurchase = true, hideLabel = false, eagerImageCount = 0 }: {
  products: HomeFeaturedProduct[];
  label?: string;
  layout?: "featured" | "ritual";
  directPurchase?: boolean;
  hideLabel?: boolean;
  eagerImageCount?: number;
}) {
  const visible = products.filter(product => product.primaryImageUrl?.trim());
  function renderCard(product: HomeFeaturedProduct, index: number, preview = false) {
    return <HomeProductCard key={product.id} product={product}
      label={label ?? product.categoryName ?? publicCategoryLabels[product.category]}
      directPurchase={directPurchase} hideLabel={hideLabel} preview={preview} layout={layout}
      imageLoading={!preview && index < eagerImageCount ? "eager" : "lazy"} />;
  }

  if(!visible.length) return <p role="status">Estamos preparando las fotos de esta selección. <a href={publicCategoryPaths[products[0]?.category??'perfumes']}>Explorá el catálogo</a>.</p>;
  return <HomeFeaturedCarousel key={visible.map(product=>product.id).join(':')} layout={layout} cards={visible.map((product, index) => renderCard(product, index))}
    previews={visible.map((product, index) => renderCard(product, index, true))} />;
}

function HomeProductCard({ product, label, directPurchase, hideLabel, preview, layout, imageLoading }: {
  product: HomeFeaturedProduct;
  label: string;
  directPurchase: boolean;
  hideLabel: boolean;
  preview: boolean;
  layout: "featured" | "ritual";
  imageLoading: "eager" | "lazy";
}) {
  const pricing = getHomeCardPricing(product);
  return (
    <ProductCard
      product={product}
      label={label}
      featured
      directPurchase={directPurchase}
      hideLabel={hideLabel}
      preview={preview}
      imageLoading={imageLoading}
      featuredPricing={pricing}
      homeLayout={layout}
      isolatedPhoto={isolatedPhotosBySource.get(product.primaryImageUrl ?? "")}
      pricePanel={pricing ? <ProductPricePanel prices={{ list: pricing.list, cash: pricing.special }} from={product.homePriceFrom} /> : undefined}
      recommendation={getHomeCardRecommendation(product)}
      from={product.homePriceFrom}
    />
  );
}
