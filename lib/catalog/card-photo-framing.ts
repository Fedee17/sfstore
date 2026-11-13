// Owner-reviewed card framing (13/11/2026) for store photos whose product touches the top edge.
// Keyed by the stored file, so a replaced photo falls back to the default centred square crop.
// focusY: vertical crop position in %. width: share of the frame the photo keeps (zoom out); the rest shows a blurred copy.
export type CardPhotoFraming = { focusY: number; width?: number };

const framings: Record<string, CardPhotoFraming> = {
  "14ab2d31a1b440e0316cb6cdfe220583.webp": { focusY: 0, width: 0.8 }, // Termo GOAT Negro
  "7b39b57749fafde6eddde539961f1724.webp": { focusY: 0 }, // Termo Stanley 1L — Pico MateSystem
  "1780979018845-img-4921-optimizada.webp": { focusY: 25 }, // Lattafa Yara Rosa
  "1781366636539-img-4923-optimizada.webp": { focusY: 25 }, // Lattafa Yara Tous
  "1e24e764c046e451f23a7eb0896d0968.webp": { focusY: 0 }, // Lattafa Mayar
  "bea5f02b8e003a8ff45c0948977d153f.webp": { focusY: 0 }, // Lattafa Mayar Natural Intense
  "1781367271058-whatsapp-image-2026-01-26-at-18-33-16-optimizada.webp": { focusY: 0, width: 0.78 }, // Lattafa Bade'e Al Oud Sublime
  "1781480265866-img-0537-optimizada.webp": { focusY: 0, width: 0.8 }, // Porta mate cuero Marrón
  "1781480345115-img-0536-optimizada.webp": { focusY: 0 }, // Porta mate cuero Marrón Oscuro
  "1781481867482-img-0531-optimizada.webp": { focusY: 0, width: 0.8 }, // Box Argentina
  "1781481899287-img-0524-optimizada.webp": { focusY: 0, width: 0.8 }, // Box Los Simpson
};

export function cardPhotoFraming(url: string | null | undefined): CardPhotoFraming | null {
  const file = url?.split("?")[0].split("/").pop();
  return file ? framings[file] ?? null : null;
}
