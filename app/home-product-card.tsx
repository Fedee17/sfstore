import { ProductCard } from "@/components/product-grid";
import { getHomeCardPricing, getHomeCardRecommendation } from "@/lib/catalog/home-card-presentation";
import type { HomeFeaturedProduct } from "@/lib/catalog/home-selection";
import { publicCategoryLabels } from "@/lib/catalog/public-product-visibility";
import { HomeFeaturedCarousel } from "./home-featured-carousel";

export function HomeProductCarousel({ products, label, directPurchase = false }: {
  products: HomeFeaturedProduct[];
  label?: string;
  directPurchase?: boolean;
}) {
  function renderCard(product: HomeFeaturedProduct, preview = false) {
    return <HomeProductCard key={product.id} product={product}
      label={label ?? product.categoryName ?? publicCategoryLabels[product.category]}
      directPurchase={directPurchase} preview={preview} />;
  }

  return <HomeFeaturedCarousel cards={products.map(product => renderCard(product))}
    previews={products.map(product => renderCard(product, true))} />;
}

function HomeProductCard({ product, label, directPurchase, preview }: {
  product: HomeFeaturedProduct;
  label: string;
  directPurchase: boolean;
  preview: boolean;
}) {
  return (
    <ProductCard
      product={product}
      label={label}
      featured
      directPurchase={directPurchase}
      preview={preview}
      featuredPricing={getHomeCardPricing(product)}
      recommendation={getHomeCardRecommendation(product)}
      from={product.homePriceFrom}
    />
  );
}
