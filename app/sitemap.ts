import type { MetadataRoute } from "next";
import { getCatalogPublications } from "@/services/products";


const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function getActiveProductUrls() {
 const products=await getCatalogPublications();
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
