export function cleanSupplierName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function normalizeSupplierName(name: string) {
  return cleanSupplierName(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
