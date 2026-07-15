import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/perfumes", "/mates", "/producto/"],
      disallow: ["/admin", "/checkout", "/carrito", "/api"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
