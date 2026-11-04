import { getSavingsPercent } from "../pricing";

type CardProduct = {
  slug: string;
  name: string;
  shortDescription: string;
  price: number;
  transferPrice?: number | null;
};

// Approved home copy, shown only while the catalog still supports the claim.
const recommendations = [
  { slug: "al-haramain-dubai-night", evidence: ["salidas nocturnas"], text: "Para salidas nocturnas." },
  { slug: "french-avenue-liquid-broun", evidence: ["citas", "salidas nocturnas"], text: "Para citas o salidas." },
  { slug: "homme-black-100ml", evidence: ["cálida", "dulce"], text: "Para gustos dulces y cálidos." },
  { slug: "la-voie", evidence: ["florales", "dulce"], text: "Para gustos florales y dulces." },
  { slug: "lattafa-khamrah", evidence: ["ocasiones especiales"], text: "Para ocasiones especiales." },
] as const;

export function getHomeCardRecommendation(product: Pick<CardProduct, "slug" | "name" | "shortDescription">) {
  const description = (product.shortDescription ?? "").trim();
  const approved = recommendations.find(item => item.slug === product.slug);
  if (approved && approved.evidence.every(term => description.toLocaleLowerCase("es").includes(term))) return approved.text;
  if (description.toLocaleLowerCase("es").startsWith(product.name.toLocaleLowerCase("es")) && product.name.length <= 65) return `${product.name}.`;
  // Use a complete catalog sentence, never a fabricated benefit or a cut fragment.
  const sentence = description.match(/^[^.!?]+[.!?](?:\s|$)/)?.[0]?.trim() ?? description;
  if (sentence.length > 0 && sentence.length <= 85) return sentence;
  return null;
}

export function getHomeCardPricing(product: Pick<CardProduct, "price" | "transferPrice">) {
  if (!Number.isFinite(product.price) || product.price <= 0) return null;
  // The public catalog supplies the applicable price. Never impose a discount here.
  const special = typeof product.transferPrice === "number" && Number.isFinite(product.transferPrice) && product.transferPrice > 0
    ? product.transferPrice : product.price;
  return { list: product.price, special, savings: getSavingsPercent(product.price, special), reduced: special < product.price };
}
