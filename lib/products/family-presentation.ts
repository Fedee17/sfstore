import type { Product } from "../../types/product.ts";

type RepresentativeImageApproval = {
  familyId: string;
  sourceProductId: string;
  imageUrl: string;
  label: string;
};

// Explicit photo approval, never a default SKU or a price/stock rule.
const approvedRepresentatives: readonly RepresentativeImageApproval[] = [{
  familyId: "e0eab95c-2f62-5e54-8d12-69870bffbaf8",
  sourceProductId: "475f74c8-622e-5f0b-801b-309041a3dc3e",
  imageUrl: "https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/5585ed23-1d19-40b0-a443-81953a999e9c/7b39b57749fafde6eddde539961f1724.webp",
  label: "Gris",
}, {
  // Lata Matera: Cromado cover approved by the owner on 27/11.
  familyId: "06635cf0-f4ac-4e84-9539-17b7a277f9d8",
  sourceProductId: "b8a90822-19d2-4ade-b6f9-ce834a2a68a9",
  imageUrl: "https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/b8a90822-19d2-4ade-b6f9-ce834a2a68a9/e8ce5502cef7f135e3986239e2340900.webp",
  label: "Cromado",
}];

export function getFamilyRepresentativeImage(product: Product, approvals: readonly RepresentativeImageApproval[] = approvedRepresentatives) {
  if (product.kind !== "family") return null;
  const approval = approvals.find(entry => entry.familyId === product.id);
  if (!approval) return null;
  const source = product.variants?.find(variant => variant.id === approval.sourceProductId);
  const image = source?.images?.find(entry => entry.url === approval.imageUrl);
  // Never silently replace a removed/unpublished photo or source SKU.
  return image ? { image, label: approval.label } : null;
}
