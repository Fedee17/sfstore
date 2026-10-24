export type GalleryConnector = "cc" | "lightning";
export function galleryConnector(value: unknown): GalleryConnector {
  if (value !== "cc" && value !== "lightning") throw new Error("Conector de fotografías inválido.");
  return value;
}
export function componentGalleryPath(productId: string, connector: GalleryConnector) {
  return `/admin/productos/combo-${productId}-${connector}/editar`;
}
