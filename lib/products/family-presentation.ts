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
