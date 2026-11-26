import research from "./perfume-accords-research.json";

export const PERFUME_ACCORD_ATTRIBUTE = "perfume_accords_v1";
export const PERFUME_ACCORD_INPUT = "perfumeAccords";

export type PerfumeAccord = { label: string; originalLabel: string; relativeStrength?: number };
export type PerfumeAccords = {
  version: 1;
  sourceUrl: string;
  consultedAt: string;
  method: "documented-list" | "source-bar-width";
  methodNote: string;
  accords: PerfumeAccord[];
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Revisá los textos y la fuente de los acordes.");
  return value.trim();
}

export function validatePerfumeAccords(value: unknown): PerfumeAccords {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.accords) || value.accords.length > 6) {
    throw new Error("Ingresá hasta seis acordes documentados.");
  }
  const sourceUrl = text(value.sourceUrl, 500);
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("La fuente debe ser una dirección HTTPS pública.");
  const consultedAt = text(value.consultedAt, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(consultedAt) || !Number.isFinite(Date.parse(consultedAt)) ||
    new Date(consultedAt).toISOString().slice(0, 10) !== consultedAt || consultedAt > new Date().toISOString().slice(0, 10)) {
    throw new Error("Ingresá una fecha de consulta válida, sin fechas futuras.");
  }
  if (value.method !== "documented-list" && value.method !== "source-bar-width") throw new Error("Revisá el método de los acordes.");
  const methodNote = text(value.methodNote, 1000);
  const accords = value.accords.map((item): PerfumeAccord => {
    if (!record(item)) throw new Error("Acorde inválido.");
    const label = text(item.label, 60);
    const originalLabel = text(item.originalLabel, 60);
    const relativeStrength = item.relativeStrength;
    if (value.method === "documented-list") {
      if (relativeStrength !== undefined) throw new Error("Una lista sin medición no permite dibujar barras.");
      return { label, originalLabel };
    }
    if (typeof relativeStrength !== "number" || !Number.isFinite(relativeStrength) || relativeStrength <= 0 || relativeStrength > 100) {
      throw new Error("La longitud relativa debe estar entre 0 y 100, con respaldo de la fuente.");
    }
    return { label, originalLabel, relativeStrength };
  });
  if (new Set(accords.map(item => item.label.toLocaleLowerCase("es-AR"))).size !== accords.length) throw new Error("No repitas acordes.");
  return { version: 1, sourceUrl, consultedAt, method: value.method, methodNote, accords };
}

export function parsePerfumeAccords(raw: string): PerfumeAccords {
  if (raw.length > 12000) throw new Error("El bloque de acordes es demasiado largo.");
  return validatePerfumeAccords(JSON.parse(raw));
}

export function getPerfumeAccords(slug?: string, attributes?: readonly { name: string; value: string }[] | null): PerfumeAccords | undefined {
  const stored = attributes?.find(item => item.name === PERFUME_ACCORD_ATTRIBUTE);
  try {
    // An explicit empty record suppresses the researched default; a corrupt override never resurrects it.
    if (stored) return parsePerfumeAccords(stored.value);
    if (slug && Object.hasOwn(research, slug)) return validatePerfumeAccords(research[slug as keyof typeof research]);
  } catch { return undefined; }
}

export function perfumeAccordAttribute(formData: FormData, category: string) {
  const raw = formData.get(PERFUME_ACCORD_INPUT);
  if (raw === null) return null;
  if (category !== "perfumes") throw new Error("Los acordes sólo corresponden a perfumes.");
  if (typeof raw !== "string") throw new Error("Formato de acordes inválido.");
  return { name: PERFUME_ACCORD_ATTRIBUTE, value: JSON.stringify(parsePerfumeAccords(raw)), sort_order: 250 };
}
