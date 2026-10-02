export type PlannedCategory = {
  name: string;
  slug: string;
  description: string;
  relatedExistingSlugs: string[];
};

export type PlannedAttribute = {
  name: string;
  value: string;
};

export type PlannedCurrentProduct = {
  name: string;
  slug: string;
  categorySlug: string;
  price: number;
  transferPrice: number;
  cost: number;
  stock: number;
  shortDescription: string;
  attributes: PlannedAttribute[];
  historicalNames: string[];
  notes: string;
};

export type ExistingCategory = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
};

export type ExistingProduct = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  short_description: string;
  description: string | null;
  price: number;
  transfer_price: number | null;
  compare_at_price: number | null;
  cost: number | null;
  stock: number;
  sku: string | null;
  featured: boolean;
  status: string;
  product_attributes: PlannedAttribute[] | null;
};

export type CurrentProductRepository = {
  listCategories(): Promise<ExistingCategory[]>;
  listProducts(): Promise<ExistingProduct[]>;
  createCategory(input: {
    name: string;
    slug: string;
    description: string;
    is_active: true;
    sort_order: number;
  }): Promise<ExistingCategory>;
  createProduct(input: Omit<ExistingProduct, "product_attributes">): Promise<void>;
  createAttributes(productId: string, attributes: PlannedAttribute[]): Promise<void>;
  deleteProduct(productId: string): Promise<void>;
};

export const CURRENT_PRODUCT_CATEGORIES: PlannedCategory[] = [
  {
    name: "Accesorios Materos",
    slug: "accesorios-materos",
    description: "Accesorios para el uso y la preparación del mate.",
    relatedExistingSlugs: ["accesorios"],
  },
  {
    name: "Vasos Térmicos",
    slug: "vasos-termicos",
    description: "Vasos térmicos.",
    relatedExistingSlugs: ["termos"],
  },
];

export const CURRENT_PRODUCTS_REQUIRED: PlannedCurrentProduct[] = [
  {
    name: "Lata Matera",
    slug: "lata-matera",
    categorySlug: "accesorios-materos",
    price: 15000,
    transferPrice: 12000,
    cost: 6700,
    stock: 6,
    shortDescription: "Set de latas para yerba y azúcar.",
    attributes: [
      { name: "Tipo", value: "Set de latas" },
      { name: "Uso", value: "Yerba y azúcar" },
    ],
    historicalNames: ["Lata Matera"],
    notes: "Cada par de latas cuenta como una unidad vendible.",
  },
  {
    name: "Mate Pampa Original boca abierta",
    slug: "mate-pampa-original-boca-abierta",
    categorySlug: "mates",
    price: 18000,
    transferPrice: 13000,
    cost: 10700,
    stock: 1,
    shortDescription: "Mate Pampa boca abierta, color negro.",
    attributes: [
      { name: "Color", value: "Negro" },
      { name: "Boca", value: "Abierta" },
    ],
    historicalNames: ["Mate Pampa Original boca abierta"],
    notes: "No equivale a otros Mate Pampa ni a mates de algarrobo.",
  },
  {
    name: "Vaso Cervecero Stanley",
    slug: "vaso-cervecero-stanley",
    categorySlug: "vasos-termicos",
    price: 30000,
    transferPrice: 27000,
    cost: 10200,
    stock: 2,
    shortDescription: "Vaso cervecero térmico Stanley.",
    attributes: [
      { name: "Tipo", value: "Vaso cervecero" },
      { name: "Marca", value: "Stanley" },
    ],
    historicalNames: ["Vaso Cervecero Stanley"],
    notes: "No equivale a TERMO STANLEY.",
  },
  {
    name: "Vaso Cervecero Liso",
    slug: "vaso-cervecero-liso",
    categorySlug: "vasos-termicos",
    price: 27000,
    transferPrice: 25000,
    cost: 9500,
    stock: 1,
    shortDescription: "Vaso cervecero térmico liso.",
    attributes: [
      { name: "Tipo", value: "Vaso cervecero" },
      { name: "Diseño", value: "Liso" },
    ],
    historicalNames: ["Vaso Cervecero Liso"],
    notes: "Producto actual confirmado por el usuario.",
  },
  {
    name: "Mate Algarrobo Simple",
    slug: "mate-algarrobo-simple",
    categorySlug: "mates",
    price: 25000,
    transferPrice: 21000,
    cost: 10000,
    stock: 3,
    shortDescription: "Mate de algarrobo sin acrílico.",
    attributes: [
      { name: "Material", value: "Algarrobo" },
      { name: "Acrílico", value: "No" },
    ],
    historicalNames: ["Mate Algarrobo Simple"],
    notes: "Es distinto de Mate Algarrobo Acrilico.",
  },
];

export function normalizeCatalogIdentity(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateCurrentProductPlan() {
  const categorySlugs = new Set<string>();
  for (const category of CURRENT_PRODUCT_CATEGORIES) {
    if (!category.name.trim() || normalizeCatalogIdentity(category.name) !== category.slug) {
      throw new Error(`Categoría inválida: ${category.name}.`);
    }
    if (categorySlugs.has(category.slug)) throw new Error(`Categoría duplicada: ${category.slug}.`);
    categorySlugs.add(category.slug);
  }

  const productSlugs = new Set<string>();
  for (const product of CURRENT_PRODUCTS_REQUIRED) {
    if (normalizeCatalogIdentity(product.name) !== product.slug) {
      throw new Error(`Slug inválido para ${product.name}.`);
    }
    if (productSlugs.has(product.slug)) throw new Error(`Producto duplicado: ${product.slug}.`);
    productSlugs.add(product.slug);
    if (!Number.isSafeInteger(product.stock) || product.stock < 0) {
      throw new Error(`Stock inválido para ${product.name}.`);
    }
    for (const [field, value] of [
      ["price", product.price],
      ["transfer_price", product.transferPrice],
      ["cost", product.cost],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0 || Math.round(value * 100) !== value * 100 || value > 9_999_999_999.99) {
        throw new Error(`${field} inválido para ${product.name}.`);
      }
    }
    if (product.transferPrice >= product.price) {
      throw new Error(`Transferencia debe ser menor al precio para ${product.name}.`);
    }
    if (!product.shortDescription.trim() || product.attributes.length === 0) {
      throw new Error(`Descripción o atributos faltantes para ${product.name}.`);
    }
  }
}

function findUniqueExact<T>(rows: T[], matches: (row: T) => boolean, label: string) {
  const exact = rows.filter(matches);
  if (exact.length > 1) throw new Error(`Conflicto múltiple para ${label}.`);
  return exact[0] ?? null;
}

export function findExactCategory(categories: ExistingCategory[], planned: PlannedCategory) {
  return findUniqueExact(
    categories,
    (category) => category.slug === planned.slug || normalizeCatalogIdentity(category.name) === planned.slug,
    planned.name,
  );
}

export function findExactProduct(products: ExistingProduct[], planned: PlannedCurrentProduct) {
  return findUniqueExact(
    products,
    (product) => product.slug === planned.slug || normalizeCatalogIdentity(product.name) === planned.slug,
    planned.name,
  );
}

function attributesMatch(current: PlannedAttribute[] | null, expected: PlannedAttribute[]) {
  const normalize = (attribute: PlannedAttribute) => `${attribute.name.trim()}=${attribute.value.trim()}`;
  const left = (current ?? []).map(normalize).sort();
  const right = expected.map(normalize).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function currentProductMatches(current: ExistingProduct, planned: PlannedCurrentProduct, categoryId: string) {
  return current.category_id === categoryId
    && current.name === planned.name
    && current.slug === planned.slug
    && current.short_description === planned.shortDescription
    && current.description === null
    && Number(current.price) === planned.price
    && Number(current.transfer_price) === planned.transferPrice
    && current.compare_at_price === null
    && Number(current.cost) === planned.cost
    && Number(current.stock) === planned.stock
    && current.sku === null
    && current.featured === false
    && current.status === "active"
    && attributesMatch(current.product_attributes, planned.attributes);
}

export type CreationSummary = {
  categoriesToCreate: string[];
  productsToCreate: string[];
  skippedProducts: string[];
};

export async function runCurrentProductCreation(
  repository: CurrentProductRepository,
  options: { apply: boolean; log?: (message: string) => void },
): Promise<CreationSummary> {
  validateCurrentProductPlan();
  const log = options.log ?? (() => undefined);
  const categories = await repository.listCategories();
  const products = await repository.listProducts();
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const categoriesToCreate: string[] = [];
  const productsToCreate: string[] = [];
  const skippedProducts: string[] = [];

  for (const planned of CURRENT_PRODUCT_CATEGORIES) {
    const exact = findExactCategory(categories, planned);
    if (exact) {
      if (!exact.is_active) throw new Error(`La categoría existente está inactiva: ${planned.name}.`);
      categoryBySlug.set(planned.slug, exact);
      log(`SKIP CATEGORY ${planned.slug}: ya existe como ${exact.name}.`);
      continue;
    }
    const related = categories.filter((category) => planned.relatedExistingSlugs.includes(category.slug));
    if (related.length > 0) {
      log(`INFO CATEGORY ${planned.slug}: relacionadas pero no equivalentes: ${related.map((item) => item.name).join(", ")}.`);
    }
    categoriesToCreate.push(planned.slug);
  }

  for (const planned of CURRENT_PRODUCTS_REQUIRED) {
    const exact = findExactProduct(products, planned);
    const category = categoryBySlug.get(planned.categorySlug);
    if (exact) {
      if (!category || !currentProductMatches(exact, planned, category.id)) {
        throw new Error(`El producto existente no coincide y no será modificado: ${planned.name}.`);
      }
      skippedProducts.push(planned.slug);
      log(`SKIP PRODUCT ${planned.slug}: ya existe y coincide.`);
    } else {
      productsToCreate.push(planned.slug);
    }
  }

  if (!options.apply) {
    for (const slug of categoriesToCreate) log(`DRY-RUN CREATE CATEGORY ${slug}.`);
    for (const slug of productsToCreate) log(`DRY-RUN CREATE PRODUCT ${slug}.`);
    return { categoriesToCreate, productsToCreate, skippedProducts };
  }

  let nextSortOrder = Math.max(0, ...categories.map((category) => category.sort_order)) + 10;
  for (const planned of CURRENT_PRODUCT_CATEGORIES) {
    if (categoryBySlug.has(planned.slug)) continue;
    const created = await repository.createCategory({
      name: planned.name,
      slug: planned.slug,
      description: planned.description,
      is_active: true,
      sort_order: nextSortOrder,
    });
    nextSortOrder += 10;
    categoryBySlug.set(planned.slug, created);
    log(`CREATE CATEGORY ${planned.slug}.`);
  }

  for (const planned of CURRENT_PRODUCTS_REQUIRED) {
    if (!productsToCreate.includes(planned.slug)) continue;
    const category = categoryBySlug.get(planned.categorySlug);
    if (!category) throw new Error(`Categoría no resuelta: ${planned.categorySlug}.`);
    const productId = crypto.randomUUID();
    await repository.createProduct({
      id: productId,
      category_id: category.id,
      name: planned.name,
      slug: planned.slug,
      short_description: planned.shortDescription,
      description: null,
      price: planned.price,
      transfer_price: planned.transferPrice,
      compare_at_price: null,
      cost: planned.cost,
      stock: planned.stock,
      sku: null,
      featured: false,
      status: "active",
    });
    try {
      await repository.createAttributes(productId, planned.attributes);
    } catch (error) {
      await repository.deleteProduct(productId);
      throw error;
    }
    log(`CREATE PRODUCT ${planned.slug}.`);
  }

  return { categoriesToCreate, productsToCreate, skippedProducts };
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeCurrentProductsCreatePlan(categoryIds: Record<string, string> = {}) {
  const headers = [
    "name", "slug", "category_name", "category_id", "price", "transfer_price", "cost", "stock",
    "short_description", "attributes_json", "existing_match", "ready_to_create", "notes",
  ];
  const categoryNames = new Map([
    ...CURRENT_PRODUCT_CATEGORIES.map((category) => [category.slug, category.name] as const),
    ["mates", "Mates"] as const,
  ]);
  const lines = CURRENT_PRODUCTS_REQUIRED.map((product) => [
    product.name,
    product.slug,
    categoryNames.get(product.categorySlug) ?? product.categorySlug,
    categoryIds[product.categorySlug] ?? "",
    product.price,
    product.transferPrice,
    product.cost,
    product.stock,
    product.shortDescription,
    JSON.stringify(Object.fromEntries(product.attributes.map((attribute) => [attribute.name, attribute.value]))),
    "NONE_READ_ONLY_PREFLIGHT",
    "true",
    `${product.notes} Stock físico confirmado previo al alta en sistema. Mapping histórico futuro: ${product.historicalNames.join(" | ")}.`,
  ]);
  return `${[headers, ...lines].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}
