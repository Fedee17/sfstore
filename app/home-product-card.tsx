"use client";
import {useState} from 'react';
import { ProductCard } from "@/components/product-grid";
import { getHomeCardPricing, getHomeCardRecommendation } from "@/lib/catalog/home-card-presentation";
import type { HomeFeaturedProduct } from "@/lib/catalog/home-selection";
import { publicCategoryLabels, publicCategoryPaths } from "@/lib/catalog/public-product-visibility";
import { HomeFeaturedCarousel } from "./home-featured-carousel";

export function HomeProductCarousel({ products, label, directPurchase = true, hideLabel = false }: {
  products: HomeFeaturedProduct[];
  label?: string;
  directPurchase?: boolean;
  hideLabel?: boolean;
}) {
  const [failedPhotos,setFailedPhotos]=useState<Record<string,string>>({});
  const visible=products.filter(product=>product.primaryImageUrl?.trim()&&failedPhotos[product.id]!==product.primaryImageUrl);
  function renderCard(product: HomeFeaturedProduct, preview = false) {
    return <HomeProductCard key={product.id} product={product}
      label={label ?? product.categoryName ?? publicCategoryLabels[product.category]}
      directPurchase={directPurchase} hideLabel={hideLabel} preview={preview} onImageError={()=>setFailedPhotos(current=>current[product.id]===product.primaryImageUrl?current:{...current,[product.id]:product.primaryImageUrl!})} />;
  }

  if(!visible.length) return <p role="status">Estamos preparando las fotos de esta selección. <a href={publicCategoryPaths[products[0]?.category??'perfumes']}>Explorá el catálogo</a>.</p>;
  return <HomeFeaturedCarousel key={visible.map(product=>product.id).join(':')} cards={visible.map(product => renderCard(product))}
    previews={visible.map(product => renderCard(product, true))} />;
}

function HomeProductCard({ product, label, directPurchase, hideLabel, preview, onImageError }: {
  product: HomeFeaturedProduct;
  label: string;
  directPurchase: boolean;
  hideLabel: boolean;
  preview: boolean;
  onImageError: () => void;
}) {
  return (
    <ProductCard
      product={product}
      label={label}
      featured
      directPurchase={directPurchase}
      hideLabel={hideLabel}
      preview={preview}
      featuredPricing={getHomeCardPricing(product)}
      recommendation={getHomeCardRecommendation(product)}
      from={product.homePriceFrom}
      onImageError={onImageError}
    />
  );
}
