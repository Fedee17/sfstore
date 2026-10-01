export type ProductCategoryInfo = {
  name: string;
  slug: string;
};

type AutoDescriptionInput = {
  name: string;
  category: ProductCategoryInfo | null;
  brand: string;
  type: string;
  price: number;
  transferPrice: number | null;
};

type ProductDescriptionFields = {
  short_description: string | null;
  description: string | null;
};

function withBrand(name: string, brand: string) {
  return brand ? `${name} de ${brand}` : name;
}

export function getAutoDescriptions({
  name,
  category,
  brand,
}: AutoDescriptionInput) {
  const displayName = withBrand(name, brand);
  const categorySlug = category?.slug ?? "";
  const categoryName = category?.name.toLowerCase() ?? "";
  const isPerfume =
    categorySlug === "perfumes" || categoryName.includes("perfume");
  const isMate = categorySlug === "mates" || categoryName.includes("mate");
  const isTermo = categorySlug === "termos" || categoryName.includes("termo");

  if (isPerfume) {
    return {
      shortDescription: `${displayName} es una opcion ideal para quienes buscan un aroma con presencia, pensado para uso diario, salida o regalo.`,
      description: `${displayName} combina estilo, presencia y una sensación de calidad desde el primer uso. Es una alternativa ideal si buscás un perfume para regalar bien, probar algo distinto o sumar a tu rutina un aroma que acompañe tu estilo. En SFSTORE te ayudamos a elegir según tus gustos, ocasión y presupuesto.`,
    };
  }

  if (isMate) {
    return {
      shortDescription: `${displayName} es una opcion ideal para quienes buscan un mate vistoso, comodo y con identidad argentina.`,
      description: `${displayName} esta pensado para quienes disfrutan el ritual del mate y quieren una pieza que se vea bien, se sienta comoda y tambien funcione como regalo. En SFSTORE podes combinarlo con termo, yerba, bombilla o accesorios para armar una compra mas completa.`,
    };
  }

  if (isTermo) {
    return {
      shortDescription: `${displayName} es una opcion practica para acompanar tu mate, tu dia y tus salidas.`,
      description: `${displayName} es una alternativa practica y funcional para mantener tu rutina siempre lista. Ideal para combinar con mate, bombilla, yerba o accesorios y armar un regalo util, vistoso y con identidad.`,
    };
  }

  return {
    shortDescription: `${displayName} es una opcion practica para resolver una compra util o un regalo.`,
    description: `${displayName} es una alternativa practica para sumar a tu dia a dia o resolver un regalo simple y util. En SFSTORE buscamos opciones funcionales, faciles de elegir y con buena presentacion.`,
  };
}

export function applyAutoDescriptionFallbacks<T extends ProductDescriptionFields>(
  product: T,
  autoDescriptions: ReturnType<typeof getAutoDescriptions>,
) {
  return {
    ...product,
    short_description:
      product.short_description || autoDescriptions.shortDescription,
    description: product.description || autoDescriptions.description,
  };
}
