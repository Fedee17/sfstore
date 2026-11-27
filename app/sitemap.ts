import type { MetadataRoute } from "next";
import { getCatalogPublicationsOrThrow } from "@/services/products";

// CAT-03: built per request from the live catalog, so new public products appear without a rebuild or a
// revalidation, and a failed read answers an error instead of a cached sitemap without products.
export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function getActiveProductUrls() {
 // A failed read must fail the sitemap, never be cached as a sitemap without products.
 const products=await getCatalogPublicationsOrThrow();
 return products.map(product=>({url:`${siteUrl}/producto/${product.slug}`,lastModified:new Date(),changeFrequency:"monthly" as const,priority:0.7}));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getActiveProductUrls();

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/perfumes`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/mates`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    { url: `${siteUrl}/accesorios`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    ...products,
  ];
}
