export type PriceImportField = "price" | "transfer_price" | "cost";

export type PriceImportSource = {
  price: number | null;
  transferPrice: number | null;
  cost: number | null;
  priceProvided: boolean;
  transferPriceProvided: boolean;
  costProvided: boolean;
};

export type ExistingPriceProduct = {
  id: string;
  price: number;
  transfer_price: number | null;
  cost: number | null;
};

export type PriceImportDiff = {
  field: PriceImportField;
  currentValue: number | null;
  nextValue: number | null;
};

export type SafePriceImportDecision =
  | { kind: "review"; patch: Record<string, never>; diffs: []; errors: string[] }
  | { kind: "invalid"; patch: Record<string, never>; diffs: []; errors: string[] }
  | { kind: "unchanged"; patch: Record<string, never>; diffs: []; errors: [] }
  | {
      kind: "update";
      patch: Partial<Record<PriceImportField, number | null>>;
      diffs: PriceImportDiff[];
      errors: [];
    };

const RESTRICTED_PRODUCT_TERMS = ["vape", "elfbar", "ignite", "ignate"];
const SUPABASE_MONEY_DECIMALS = 2;

export function normalizePriceImportMoney(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const shifted = Number(`${value}e${SUPABASE_MONEY_DECIMALS}`);
  const rounded = Number(`${Math.round(shifted)}e-${SUPABASE_MONEY_DECIMALS}`);
  return rounded === 0 ? 0 : rounded;
}

function normalizeSafetyText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isRestrictedPriceImportProduct(name: string) {
  const normalized = normalizeSafetyText(name);
  return RESTRICTED_PRODUCT_TERMS.some((term) => normalized.includes(term));
}

export function findDuplicateImportSlugs(rows: Array<{ slug: string }>) {
  const counts = rows.reduce(
    (result, row) => result.set(row.slug, (result.get(row.slug) ?? 0) + 1),
    new Map<string, number>(),
  );
  return new Set(
    [...counts.entries()]
      .filter(([slug, count]) => Boolean(slug) && count > 1)
      .map(([slug]) => slug),
  );
}

export function classifyPriceImportPreview(input: {
  source: PriceImportSource;
  existing: ExistingPriceProduct | null;
  duplicate: boolean;
  restricted: boolean;
  errors: string[];
}) {
  if (input.duplicate) {
    return {
      action: "duplicate" as const,
      rowState: "duplicate" as const,
      canImport: false,
      diffs: [] as PriceImportDiff[],
      errors: [...input.errors, "Slug duplicado dentro de la previsualización; corregí ambas filas."],
    };
  }
  if (input.restricted) {
    return {
      action: "blocked" as const,
      rowState: "blocked" as const,
      canImport: false,
      diffs: [] as PriceImportDiff[],
      errors: input.errors,
    };
  }
  if (input.errors.length > 0) {
    return {
      action: "error" as const,
      rowState: "error" as const,
      canImport: false,
      diffs: [] as PriceImportDiff[],
      errors: input.errors,
    };
  }

  const decision = buildSafePriceImportDecision(input.source, input.existing);
  return {
    action: decision.kind === "invalid" ? "error" as const : decision.kind,
    rowState: decision.kind === "invalid"
      ? "error" as const
      : decision.kind === "update"
        ? "valid" as const
        : decision.kind,
    canImport: decision.kind === "update",
    diffs: decision.diffs as PriceImportDiff[],
    errors: decision.errors,
  };
}

export function getPriceImportSource(row: {
  price: number | null;
  transferPrice: number | null;
  cost: number | null;
  commercialFields: {
    priceProvided: boolean;
    transferPriceProvided: boolean;
    costProvided: boolean;
  };
}): PriceImportSource {
  return {
    price: row.price,
    transferPrice: row.transferPrice,
    cost: row.cost,
    ...row.commercialFields,
  };
}

export function buildSafePriceImportDecision(
  source: PriceImportSource,
  existing: ExistingPriceProduct | null,
): SafePriceImportDecision {
  if (!existing) {
    return {
      kind: "review",
      patch: {},
      diffs: [],
      errors: ["Requiere revisión / posible nuevo producto."],
    };
  }

  const errors: string[] = [];
  const normalizedPrice = normalizePriceImportMoney(source.price);
  const normalizedTransferPrice = normalizePriceImportMoney(source.transferPrice);
  const normalizedCost = normalizePriceImportMoney(source.cost);
  if (source.priceProvided && (normalizedPrice === null || normalizedPrice <= 0)) {
    errors.push("Precio lista inválido; debe ser mayor que cero.");
  }
  if (
    source.transferPriceProvided &&
    (normalizedTransferPrice === null || normalizedTransferPrice <= 0)
  ) {
    errors.push("Precio efectivo/transferencia inválido; debe ser mayor que cero.");
  }
  if (
    source.costProvided &&
    (normalizedCost === null || source.cost === null || source.cost < 0)
  ) {
    errors.push("Costo inválido; no puede ser negativo.");
  }

  const effectivePrice = source.priceProvided
    ? normalizedPrice
    : normalizePriceImportMoney(existing.price);
  const effectiveTransferPrice = source.transferPriceProvided
    ? normalizedTransferPrice
    : normalizePriceImportMoney(existing.transfer_price);
  if (
    effectivePrice !== null &&
    effectiveTransferPrice !== null &&
    effectiveTransferPrice >= effectivePrice
  ) {
    errors.push("Precio efectivo/transferencia debe ser menor que precio lista.");
  }

  if (errors.length > 0) {
    return { kind: "invalid", patch: {}, diffs: [], errors };
  }

  const candidates: Array<{
    field: PriceImportField;
    provided: boolean;
    currentValue: number | null;
    nextValue: number | null;
  }> = [
    {
      field: "price",
      provided: source.priceProvided,
      currentValue: normalizePriceImportMoney(existing.price),
      nextValue: normalizedPrice,
    },
    {
      field: "transfer_price",
      provided: source.transferPriceProvided,
      currentValue: normalizePriceImportMoney(existing.transfer_price),
      nextValue: normalizedTransferPrice,
    },
    {
      field: "cost",
      provided: source.costProvided,
      currentValue: normalizePriceImportMoney(existing.cost),
      nextValue: normalizedCost,
    },
  ];
  const diffs = candidates
    .filter((candidate) => candidate.provided && candidate.currentValue !== candidate.nextValue)
    .map(({ field, currentValue, nextValue }) => ({ field, currentValue, nextValue }));

  if (diffs.length === 0) {
    return { kind: "unchanged", patch: {}, diffs: [], errors: [] };
  }

  return {
    kind: "update",
    patch: Object.fromEntries(diffs.map((diff) => [diff.field, diff.nextValue])),
    diffs,
    errors: [],
  };
}
