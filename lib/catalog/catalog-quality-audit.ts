export type CatalogAuditAttribute = {
  name: string;
  value: string;
};

export type CatalogAuditImage = {
  id: string;
  url: string;
  sort_order: number;
  is_primary: boolean;
};

export type CatalogAuditProduct = {
  id: string;
  name: string;
  slug: string;
  status: string;
  stock: number;
  cost: number | null;
  price: number;
  transfer_price: number | null;
  short_description: string | null;
  description: string | null;
  category: { name: string; slug: string } | null;
  attributes: CatalogAuditAttribute[];
  images: CatalogAuditImage[];
  cost_source_purchase_item_id: string | null;
};

export type ConfirmedPurchaseCost = {
  id: string;
  product_id: string;
  effective_unit_cost: number;
  confirmed_at: string;
};

export type ImageHealth = Record<string, boolean>;

export type CatalogAuditRow = {
  id: string;
  name: string;
  slug: string;
  category: string;
  status: string;
  stock: number;
  cost: number | null;
  cost_status: string;
  latest_confirmed_purchase_cost: number | null;
  latest_confirmed_purchase_at: string | null;
  price: number;
  transfer_price: number | null;
  margin_price_pct: number | null;
  margin_transfer_pct: number | null;
  description_status: string;
  description_reason: string;
  attributes_status: string;
  attributes_reason: string;
  images_count: number;
  images_status: string;
  completeness: number;
  issues: string;
  suggested_action: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "NONE";
};

const GENERIC_DESCRIPTION_PATTERNS = [
  /producto de excelente calidad/i,
  /ideal para cualquier ocasi[oó]n/i,
  /opci[oó]n premium/i,
  /perfect[oa] para regalar/i,
  /es una opci[oó]n ideal para quienes/i,
  /es una alternativa pr[aá]ctica/i,
  /en sfstore (te ayudamos|pod[eé]s|buscamos)/i,
  /resolver un regalo simple y [uú]til/i,
];

const ATTRIBUTE_ALIASES: Record<string, string[]> = {
  brand: ["marca", "brand"],
  type: ["tipo", "concentracion", "concentración", "mate_type"],
  gender: ["gender", "genero", "género"],
  olfactory_family: ["olfactory_family", "familia olfativa", "familia / estilo olfativo"],
  intensity: ["intensity", "intensidad"],
  occasion: ["occasion", "ocasion", "ocasión", "momento", "momento de uso"],
  material: ["material"],
  color: ["color", "variante"],
  capacity: ["capacidad", "capacidad/potencia", "peso"],
  model: ["modelo"],
  connectivity: ["conectividad"],
  variety: ["variedad", "sabor"],
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hasAttribute(attributes: CatalogAuditAttribute[], key: string) {
  const accepted = new Set((ATTRIBUTE_ALIASES[key] ?? [key]).map(normalize));
  return attributes.some(
    (attribute) => accepted.has(normalize(attribute.name)) && attribute.value.trim() !== "",
  );
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function marginPercent(price: number | null, cost: number | null) {
  if (price === null || cost === null || cost <= 0) return null;
  return Math.round((((price - cost) / cost) * 100 + Number.EPSILON) * 100) / 100;
}

export function classifyDescription(product: CatalogAuditProduct) {
  const description = product.description?.trim() ?? "";
  if (!description) {
    return { status: "DESCRIPTION_MISSING", reason: "No tiene descripcion." };
  }
  if (description.length < 80 || description.split(/\s+/).length < 12) {
    return { status: "DESCRIPTION_TOO_SHORT", reason: "No aporta suficiente informacion especifica." };
  }
  if (GENERIC_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(description))) {
    return { status: "DESCRIPTION_GENERIC", reason: "Contiene texto comercial intercambiable entre productos." };
  }
  if (!normalize(description).includes(normalize(product.name).split("-").slice(0, 2).join("-"))) {
    return { status: "DESCRIPTION_NEEDS_VERIFICATION", reason: "No referencia claramente el producto auditado." };
  }
  if (description === product.short_description?.trim()) {
    return { status: "DESCRIPTION_SUSPICIOUS", reason: "Repite exactamente la descripcion corta." };
  }
  return { status: "DESCRIPTION_GOOD", reason: "Descripcion extensa y especifica." };
}

export function classifyCost(
  product: CatalogAuditProduct,
  latestPurchase: ConfirmedPurchaseCost | undefined,
) {
  if (product.cost === null || product.cost <= 0) return "COST_MISSING";
  if (!latestPurchase) return "COST_WITHOUT_PURCHASE_SOURCE";
  if (!Number.isFinite(product.cost) || product.cost < 0) return "COST_SUSPICIOUS";
  if (roundMoney(product.cost) !== roundMoney(latestPurchase.effective_unit_cost)) {
    return "COST_MISMATCH_LATEST_CONFIRMED_PURCHASE";
  }
  if (
    product.cost_source_purchase_item_id &&
    product.cost_source_purchase_item_id !== latestPurchase.id
  ) {
    return "COST_SUSPICIOUS";
  }
  return "COST_OK";
}

function expectedAttributeKeys(product: CatalogAuditProduct) {
  const slug = product.category?.slug ?? "";
  if (slug === "perfumes") {
    return ["brand", "type", "gender", "olfactory_family", "intensity", "occasion"];
  }
  if (slug === "mates") return ["type", "material", "color"];
  if (slug.includes("termo") || normalize(product.name).includes("termo")) {
    return ["brand", "type", "capacity", "material", "color"];
  }
  if (slug.includes("yerba") || normalize(product.name).includes("yerba")) {
    return ["brand", "type", "variety", "capacity"];
  }
  if (["electronica", "electronicos", "tecnologia"].includes(slug)) {
    return ["brand", "type", "model", "connectivity"];
  }
  return ["type"];
}

export function classifyAttributes(product: CatalogAuditProduct) {
  const expected = expectedAttributeKeys(product);
  const missing = expected.filter((key) => !hasAttribute(product.attributes, key));
  const invalid = product.attributes.some(
    (attribute) => !attribute.name.trim() || !attribute.value.trim(),
  );
  if (invalid) {
    return { status: "ATTRIBUTES_INVALID", reason: "Hay atributos sin nombre o valor." };
  }
  if (product.attributes.length === 0) {
    return { status: "ATTRIBUTES_MISSING", reason: `Faltan: ${expected.join(", ")}.` };
  }
  if (missing.length === expected.length) {
    return { status: "ATTRIBUTES_SUSPICIOUS", reason: `Los atributos existentes no cubren: ${missing.join(", ")}.` };
  }
  if (missing.length > 0) {
    return { status: "ATTRIBUTES_INCOMPLETE", reason: `Faltan: ${missing.join(", ")}.` };
  }
  return { status: "ATTRIBUTES_OK", reason: "Cubre los atributos esperados para la categoria." };
}

export function classifyImages(product: CatalogAuditProduct, health: ImageHealth) {
  if (product.images.length === 0) return "NO_IMAGES";
  if (product.images.some((image) => health[image.id] === false)) return "BROKEN_IMAGE";
  if (new Set(product.images.map((image) => image.url)).size !== product.images.length) {
    return "POSSIBLE_DUPLICATE";
  }
  const primaryCount = product.images.filter((image) => image.is_primary).length;
  const orders = product.images.map((image) => image.sort_order);
  if (primaryCount !== 1 || new Set(orders).size !== orders.length) return "ORDER_REVIEW";
  if (product.images.length === 1) return "ONLY_ONE_IMAGE";
  return "IMAGES_OK";
}

function buildSuggestedAction(issues: string[]) {
  if (issues.length === 0) return "Sin accion prioritaria.";
  if (issues.some((issue) => issue.startsWith("COST_"))) return "Revisar costo contra la ultima compra confirmada.";
  if (issues.some((issue) => issue.includes("PRICE") || issue.includes("MARGIN"))) return "Revisar precios y margen antes de vender.";
  if (issues.some((issue) => issue.startsWith("DESCRIPTION_"))) return "Redactar una descripcion especifica y verificable.";
  if (issues.some((issue) => issue.startsWith("ATTRIBUTES_"))) return "Completar atributos de la categoria sin inventar datos.";
  if (issues.some((issue) => issue.includes("IMAGE"))) return "Cargar y ordenar imagenes validas.";
  return "Revisar el estado comercial del producto.";
}

export function buildCatalogAudit(
  products: CatalogAuditProduct[],
  purchaseCosts: ConfirmedPurchaseCost[],
  imageHealth: ImageHealth = {},
) {
  const latestByProduct = new Map<string, ConfirmedPurchaseCost>();
  for (const item of [...purchaseCosts].sort((a, b) => b.confirmed_at.localeCompare(a.confirmed_at))) {
    if (!latestByProduct.has(item.product_id)) latestByProduct.set(item.product_id, item);
  }

  return [...products]
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
    .map((product): CatalogAuditRow => {
      const description = classifyDescription(product);
      const costStatus = classifyCost(product, latestByProduct.get(product.id));
      const attributes = classifyAttributes(product);
      const imagesStatus = classifyImages(product, imageHealth);
      const issues: string[] = [];

      if (costStatus !== "COST_OK") issues.push(costStatus);
      if (description.status !== "DESCRIPTION_GOOD") issues.push(description.status);
      if (attributes.status !== "ATTRIBUTES_OK") issues.push(attributes.status);
      if (imagesStatus !== "IMAGES_OK") issues.push(imagesStatus);
      if (product.price <= 0) issues.push("PRICE_INVALID");
      if (product.transfer_price !== null && product.transfer_price <= 0) issues.push("TRANSFER_PRICE_INVALID");
      if (product.transfer_price !== null && product.transfer_price > product.price) issues.push("TRANSFER_ABOVE_LIST_PRICE");

      const listMargin = marginPercent(product.price, product.cost);
      const transferMargin = marginPercent(product.transfer_price, product.cost);
      if (listMargin !== null && listMargin < 0) issues.push("LIST_MARGIN_NEGATIVE");
      else if (listMargin !== null && listMargin < 10) issues.push("LIST_MARGIN_VERY_LOW");
      if (transferMargin !== null && transferMargin < 0) issues.push("TRANSFER_MARGIN_NEGATIVE");
      else if (transferMargin !== null && transferMargin < 10) issues.push("TRANSFER_MARGIN_VERY_LOW");
      if (product.status === "draft" && product.stock > 0) issues.push("DRAFT_WITH_STOCK");
      if (product.status === "archived" && product.stock > 0) issues.push("ARCHIVED_WITH_STOCK");
      if (product.status === "active" && product.price <= 0) issues.push("ACTIVE_WITHOUT_SELLABLE_PRICE");
      if (product.status === "active" && description.status !== "DESCRIPTION_GOOD") issues.push("ACTIVE_WITHOUT_USEFUL_DESCRIPTION");
      if (product.status === "active" && imagesStatus === "NO_IMAGES") issues.push("ACTIVE_WITHOUT_IMAGE");
      if (product.status === "active" && attributes.status !== "ATTRIBUTES_OK") issues.push("ACTIVE_WITH_INCOMPLETE_ATTRIBUTES");

      const completenessChecks = [
        product.name.trim() !== "",
        product.category !== null,
        description.status === "DESCRIPTION_GOOD",
        costStatus === "COST_OK",
        product.price > 0,
        attributes.status === "ATTRIBUTES_OK",
        !["NO_IMAGES", "BROKEN_IMAGE", "ORDER_REVIEW"].includes(imagesStatus),
      ];
      const completeness = Math.round((completenessChecks.filter(Boolean).length / completenessChecks.length) * 100);
      const critical = issues.some((issue) => [
        "ACTIVE_WITHOUT_SELLABLE_PRICE",
        "COST_MISMATCH_LATEST_CONFIRMED_PURCHASE",
        "LIST_MARGIN_NEGATIVE",
        "TRANSFER_MARGIN_NEGATIVE",
      ].includes(issue));
      const high = issues.some((issue) => [
        "DESCRIPTION_GENERIC",
        "ACTIVE_WITHOUT_IMAGE",
        "ACTIVE_WITH_INCOMPLETE_ATTRIBUTES",
      ].includes(issue));
      const medium = issues.some((issue) => issue === "ONLY_ONE_IMAGE" || issue === "ATTRIBUTES_INCOMPLETE");

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        category: product.category?.name ?? "Sin categoria",
        status: product.status,
        stock: product.stock,
        cost: product.cost,
        cost_status: costStatus,
        latest_confirmed_purchase_cost: latestByProduct.get(product.id)?.effective_unit_cost ?? null,
        latest_confirmed_purchase_at: latestByProduct.get(product.id)?.confirmed_at ?? null,
        price: product.price,
        transfer_price: product.transfer_price,
        margin_price_pct: listMargin,
        margin_transfer_pct: transferMargin,
        description_status: description.status,
        description_reason: description.reason,
        attributes_status: attributes.status,
        attributes_reason: attributes.reason,
        images_count: product.images.length,
        images_status: imagesStatus,
        completeness,
        issues: [...new Set(issues)].join("|"),
        suggested_action: buildSuggestedAction(issues),
        priority: critical ? "CRITICAL" : high ? "HIGH" : medium ? "MEDIUM" : issues.length ? "MEDIUM" : "NONE",
      };
    });
}

function escapeCsv(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeCatalogAuditCsv(rows: CatalogAuditRow[]) {
  const headers: (keyof CatalogAuditRow)[] = [
    "id", "name", "slug", "category", "status", "stock", "cost", "cost_status",
    "latest_confirmed_purchase_cost", "latest_confirmed_purchase_at",
    "price", "transfer_price", "margin_price_pct", "margin_transfer_pct",
    "description_status", "description_reason", "attributes_status", "attributes_reason",
    "images_count", "images_status", "completeness", "issues", "suggested_action", "priority",
  ];
  return `${headers.join(",")}\n${rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(",")).join("\n")}\n`;
}

export function summarizeCatalogAudit(rows: CatalogAuditRow[]) {
  const count = (predicate: (row: CatalogAuditRow) => boolean) => rows.filter(predicate).length;
  return {
    total: rows.length,
    withoutRelevantIssues: count((row) => row.priority === "NONE"),
    withIssues: count((row) => row.priority !== "NONE"),
    missingCost: count((row) => row.cost_status === "COST_MISSING"),
    inconsistentCost: count((row) => row.cost_status === "COST_MISMATCH_LATEST_CONFIRMED_PURCHASE"),
    missingDescription: count((row) => row.description_status === "DESCRIPTION_MISSING"),
    genericDescription: count((row) => row.description_status === "DESCRIPTION_GENERIC"),
    noImages: count((row) => row.images_status === "NO_IMAGES"),
    oneImage: count((row) => row.images_status === "ONLY_ONE_IMAGE"),
    incompleteAttributes: count((row) => row.attributes_status !== "ATTRIBUTES_OK"),
    activeCritical: count((row) => row.status === "active" && row.priority === "CRITICAL"),
    draftsWithStock: count((row) => row.issues.split("|").includes("DRAFT_WITH_STOCK")),
  };
}

export function serializeCatalogAuditMarkdown(rows: CatalogAuditRow[], generatedAt: string) {
  const summary = summarizeCatalogAudit(rows);
  const lines = [
    "# Auditoria integral de calidad del catalogo",
    "",
    `Generado: ${generatedAt}`,
    "",
    "## Resumen ejecutivo",
    "",
    `- Total productos auditados: ${summary.total}`,
    `- Sin problemas relevantes: ${summary.withoutRelevantIssues}`,
    `- Con problemas: ${summary.withIssues}`,
    `- Sin costo: ${summary.missingCost}`,
    `- Costo inconsistente: ${summary.inconsistentCost}`,
    `- Sin descripcion: ${summary.missingDescription}`,
    `- Descripcion generica: ${summary.genericDescription}`,
    `- Sin imagenes: ${summary.noImages}`,
    `- Una sola imagen: ${summary.oneImage}`,
    `- Atributos incompletos: ${summary.incompleteAttributes}`,
    `- Activos con problemas criticos: ${summary.activeCritical}`,
    `- Drafts con stock: ${summary.draftsWithStock}`,
    "",
    "## Alcance y criterio",
    "",
    "- Fuente: lectura server-side de products, categories, product_attributes, product_images, purchases y purchase_items.",
    "- Costo autoritativo: effective_unit_cost de la ultima compra con status confirmed, ordenada por confirmed_at.",
    "- COST_WITHOUT_PURCHASE_SOURCE informa falta de trazabilidad historica; no afirma por si solo que el valor actual sea incorrecto.",
    "- Las imagenes se comprobaron por disponibilidad HTTP, principal, sort_order y URL duplicada exacta. No se evaluo estetica ni similitud visual.",
    "- Los atributos se evaluaron por categoria y solo contra claves existentes o aliases conocidos. Notas olfativas no se penalizan porque hoy no tienen una clave estructurada administrada.",
    "- La auditoria fue exclusivamente de lectura. No se modificaron productos, compras, atributos, imagenes ni Storage.",
    "",
    "## Diagnostico por producto",
    "",
    "| Prioridad | Producto | Categoria | Estado | Costo | Ultima compra confirmada | Precio | Transferencia | Descripcion | Atributos | Imagenes | Completitud | Problemas | Accion sugerida |",
    "| --- | --- | --- | --- | ---: | --- | ---: | ---: | --- | --- | --- | ---: | --- | --- |",
  ];
  for (const row of rows) {
    const cell = (value: unknown) => String(value ?? "").replaceAll("|", " / ").replaceAll("\n", " ");
    const latestPurchase = row.latest_confirmed_purchase_cost === null
      ? "Sin fuente"
      : `${row.latest_confirmed_purchase_cost} (${row.latest_confirmed_purchase_at})`;
    lines.push(`| ${row.priority} | ${cell(row.name)} | ${cell(row.category)} | ${row.status} | ${cell(row.cost)} | ${cell(latestPurchase)} | ${row.price} | ${cell(row.transfer_price)} | ${row.description_status} | ${row.attributes_status} | ${row.images_status} (${row.images_count}) | ${row.completeness}% | ${cell(row.issues)} | ${cell(row.suggested_action)} |`);
  }
  lines.push("");
  return lines.join("\n");
}
