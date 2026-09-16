import {
  CATALOG_ATTRIBUTE_KEYS,
  getCatalogAttributeOptionLabel,
} from "@/lib/catalog/attribute-config";
import type {
  PerfumeRecommendation,
  PerfumeRecommendationProduct,
} from "@/lib/catalog/perfume-recommendation";

const occasionReasons: Record<string, string> = {
  diario: "Ideal para todos los días",
  trabajo: "Para el trabajo",
  salida: "Para salir",
  cita: "Para una cita",
  noche: "Para la noche",
  evento: "Para eventos",
  regalo: "Buena opción para regalar",
};

const intensityReasons: Record<string, string> = {
  suave: "Intensidad suave",
  media: "Intensidad media",
  intensa: "Intensidad alta",
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function getPerfumeRecommendationReasons(
  recommendation: PerfumeRecommendation<PerfumeRecommendationProduct>,
  limit = 3,
) {
  const reasons: string[] = [];
  const { matches } = recommendation;

  if (matches.olfactoryFamily?.matched) {
    reasons.push(
      ...matches.olfactoryFamily.matchedValues.map((value) =>
        getCatalogAttributeOptionLabel(
          CATALOG_ATTRIBUTE_KEYS.olfactoryFamily,
          value,
        ),
      ),
    );
  }

  if (matches.intensity?.matched && matches.intensity.actual) {
    reasons.push(
      intensityReasons[matches.intensity.actual] ??
        `Intensidad ${getCatalogAttributeOptionLabel(
          CATALOG_ATTRIBUTE_KEYS.intensity,
          matches.intensity.actual,
        ).toLowerCase()}`,
    );
  }

  if (matches.occasion?.matched) {
    reasons.push(
      ...matches.occasion.matchedValues.map(
        (value) =>
          occasionReasons[value] ??
          getCatalogAttributeOptionLabel(CATALOG_ATTRIBUTE_KEYS.occasion, value),
      ),
    );
  }

  if (matches.gender?.matched && matches.gender.actual) {
    reasons.push(
      getCatalogAttributeOptionLabel(
        CATALOG_ATTRIBUTE_KEYS.gender,
        matches.gender.actual,
      ),
    );
  }

  if (matches.price?.matched) {
    reasons.push(
      matches.price.relation === "within"
        ? "Dentro de tu presupuesto"
        : "Cerca de tu presupuesto",
    );
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 3;
  return unique(reasons).slice(0, safeLimit);
}
