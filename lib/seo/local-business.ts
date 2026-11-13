import { brand, brandLinks } from "@/lib/brand";
import { brandLogoPath } from "@/lib/seo/share-image";

export function buildLocalBusinessJsonLd(siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000") {
  const url = new URL("/", siteUrl).href;
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${url}#store`,
    name: brand.name,
    url,
    logo: new URL(brandLogoPath, url).href,
    image: new URL(brandLogoPath, url).href,
    telephone: `+549${brand.whatsapp}`,
    address: { "@type": "PostalAddress", ...brand.location },
    hasMap: brandLinks.maps,
    openingHoursSpecification: [{
      "@type": "OpeningHoursSpecification",
      dayOfWeek: brand.openingHours.days,
      opens: brand.openingHours.opens,
      closes: brand.openingHours.closes,
    }],
    sameAs: [brandLinks.instagram],
  };
}

export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
