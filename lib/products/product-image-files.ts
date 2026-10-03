export const PRODUCT_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif";

export const PRODUCT_IMAGE_OUTPUT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const PRODUCT_IMAGE_SOURCE_MIME_TYPES = [
  ...PRODUCT_IMAGE_OUTPUT_MIME_TYPES,
  "image/heic",
  "image/heif",
] as const;

export const MAX_PRODUCT_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_PRODUCT_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ProductImageOutputMimeType =
  (typeof PRODUCT_IMAGE_OUTPUT_MIME_TYPES)[number];

export type StoredProductImageObject = {
  name: string;
  metadata?: {
    eTag?: unknown;
    mimetype?: unknown;
    size?: unknown;
  } | null;
};

export function isSupportedProductImageSourceMimeType(type: string) {
  return PRODUCT_IMAGE_SOURCE_MIME_TYPES.includes(
    type.toLowerCase() as (typeof PRODUCT_IMAGE_SOURCE_MIME_TYPES)[number],
  );
}

export function detectProductImageOutputMimeType(
  bytes: Uint8Array,
): ProductImageOutputMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export function normalizeProductImageEtag(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^"|"$/g, "")
    .toLowerCase();
}

export function findMatchingStoredProductImage(
  objects: StoredProductImageObject[],
  input: {
    contentHash: string;
    mimeType: ProductImageOutputMimeType;
    size: number;
  },
) {
  const expectedHash = normalizeProductImageEtag(input.contentHash);

  return objects.find((object) => {
    const metadata = object.metadata;

    return (
      normalizeProductImageEtag(metadata?.eTag) === expectedHash &&
      Number(metadata?.size) === input.size &&
      String(metadata?.mimetype ?? "").toLowerCase() === input.mimeType
    );
  });
}
