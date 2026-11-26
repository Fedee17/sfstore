// Public quotes checked on 2026-11-14 from San Francisco (2400).
// One parcel, 80 g, 15 × 10 × 7 cm. Excludes 1% of declared value.
const regionalRate = { branch: 10762.70, home: 13890.41 };

const quotes = new Map([
  ["5000", { destination: "Córdoba capital", ...regionalRate }],
  ["2000", { destination: "Rosario", ...regionalRate }],
  ["1425", { destination: "Palermo, CABA", ...regionalRate }],
  ["5500", { destination: "Mendoza capital", ...regionalRate }],
  ["8300", { destination: "Neuquén capital", branch: 11805.90, home: 15140.85 }],
]);

export function getAndreaniPreviewQuote(postalCode: string) {
  return quotes.get(postalCode.trim());
}
