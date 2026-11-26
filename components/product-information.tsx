import { getProductCommercialInformation } from "@/lib/products/commercial-information";
import { ProductAccordion } from "./product-accordion";

import { noteChipImage, noteImage, noteKeys, PerfumeInformation, separateCatalogNotes } from "./perfume-information";
import type { Product } from "@/types/product";

type InformationProduct = Parameters<typeof getProductCommercialInformation>[0] & Partial<Pick<Product, "name" | "primaryImageUrl">>;
type CommercialInformation = ReturnType<typeof getProductCommercialInformation>;

export function getPerfumeHighlights(information: CommercialInformation) {
  const field = (label: string) => information.fields.find(item => item.label === label);
  const fields = information.fields.filter(item => item.label.startsWith("Notas"));
  const legacy = information.notesSource ? [] : separateCatalogNotes(information.description).fields;
  const summary = " " + (noteKeys([information.shortDescription]).join(" ").replace(/[^\p{L}\p{N}]+/gu, " ")) + " ";
  const notes = new Map<string, string>();
  for (const field of [...fields, ...legacy.filter(item => !fields.some(note => note.label === item.label))]) {
    for (const note of field.values.flatMap(value => value.split(/[,;·]|\s+y\s+/iu))) {
      const label = note.trim().replace(/\.$/u, "");
      const key = noteKeys([label])[0];
      if (key && !notes.has(key)) notes.set(key, label);
    }
  }
  const featuredNotes = Array.from(notes, ([key, label]) => {
    const position = summary.indexOf(" " + key + " ");
    return { key, label, position: position === -1 ? Infinity : position };
  })
    .sort((a, b) => a.position - b.position)
    .flatMap(({ key, label }) => {
      const asset = noteChipImage(key) ?? noteImage([key]);
      return asset ? [{ label, asset }] : [];
    })
    .slice(0, 4);

  return {
    brand: field("Marca")?.values[0],
    content: field("Contenido")?.values.join(" · "),
    presentation: field("Presentación")?.values.join(" · "),
    notes: featuredNotes,
  };
}

/** Existing product details block, shared by simple products and the chosen SKU. */
export function ProductInformation({ product, showSummary = false, omitFields = [], standalone = false }: {
  product: InformationProduct;
  showSummary?: boolean;
  omitFields?: readonly string[];
  standalone?: boolean;
}) {
  const information = getProductCommercialInformation(product);
  const fields = information.fields.filter(field => !omitFields.includes(field.label));
  if (!fields.length && !(standalone && information.accords?.accords.length) && !information.description && !((showSummary || (standalone && product.category === "perfumes")) && information.shortDescription)) return null;
  if (standalone && product.category === "perfumes") {
    return <PerfumeInformation name={product.name} photo={product.primaryImageUrl} information={{ ...information, fields }} />;
  }
  const content = <>
    {showSummary && information.shortDescription ? <p className="whitespace-pre-line break-words text-sm leading-6">{information.shortDescription}</p> : null}
    {fields.length ? <dl aria-label="Características del producto" className="grid gap-x-6 gap-y-4 text-sm leading-6 sm:grid-cols-2">
        {fields.map(field => <div key={field.label} className="min-w-0">
          <dt className={standalone ? "inline font-semibold text-[var(--boutique-heading,#102747)]" : "mb-1 text-xs font-semibold text-[var(--boutique-muted,#45576A)]"}>{field.label}{standalone ? ": " : null}</dt>
          <dd className={standalone ? "inline break-words text-[var(--boutique-ink,#102033)]" : "break-words text-[var(--boutique-ink,#102033)]"}>{field.values.join(" · ")}</dd>
        </div>)}
      </dl> : null}
    {information.description && standalone ? <p className="whitespace-pre-line break-words text-sm leading-7 text-[var(--boutique-muted,#45576A)]">{information.description}</p>
      : information.description ? <details className="border-t border-[var(--boutique-border,#DCE3EA)] pt-4">
      <summary className="cursor-pointer rounded font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--boutique-focus,#003B73)]">Sobre este producto</summary>
      <p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-[var(--boutique-muted,#45576A)]">{information.description}</p>
    </details> : null}
  </>;

  if (!standalone) return content;

  return <ProductAccordion title="Sobre este producto" icon="information" open>
    {content}
  </ProductAccordion>;
}
