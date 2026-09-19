import {
  cleanSupplierName,
  normalizeSupplierName,
} from "@/lib/purchases/supplier";

export type SupplierFormInput = {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  website?: string;
  address?: string;
  notes?: string;
  isActive?: boolean;
};

function optionalText(value: string | undefined) {
  return value?.trim() || null;
}

export function validateSupplierInput(input: SupplierFormInput) {
  const name = cleanSupplierName(input.name);
  const normalizedName = normalizeSupplierName(input.name);
  const email = optionalText(input.email)?.toLowerCase() ?? null;
  const website = optionalText(input.website);

  if (!name || !normalizedName) {
    throw new Error("El nombre del proveedor es requerido.");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("El email del proveedor no es valido.");
  }

  if (website) {
    try {
      const url = new URL(website);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error();
      }
    } catch {
      throw new Error("El sitio web debe ser una URL valida.");
    }
  }

  return {
    name,
    normalized_name: normalizedName,
    contact_name: optionalText(input.contactName),
    phone: optionalText(input.phone),
    email,
    whatsapp: optionalText(input.whatsapp),
    website,
    address: optionalText(input.address),
    notes: optionalText(input.notes),
    ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
  };
}
