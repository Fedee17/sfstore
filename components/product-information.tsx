import { getProductCommercialInformation } from "@/lib/products/commercial-information";

type InformationProduct = Parameters<typeof getProductCommercialInformation>[0];

/** Existing product details block, shared by simple products and the chosen SKU. */
export function ProductInformation({ product, showSummary = false }: { product: InformationProduct; showSummary?: boolean }) {
  const information = getProductCommercialInformation(product);
  if (!information.fields.length && !information.description && !(showSummary && information.shortDescription)) return null;
  return <>
    {showSummary && information.shortDescription ? <p className="whitespace-pre-line break-words text-sm leading-6">{information.shortDescription}</p> : null}
    {information.fields.length ? <dl aria-label="Características del producto" className="grid gap-x-6 gap-y-4 text-sm leading-6 sm:grid-cols-2">
        {information.fields.map(field => <div key={field.label} className="min-w-0">
          <dt className="mb-1 text-xs font-semibold text-[#45576A]">{field.label}</dt>
          <dd className="break-words text-[#102033]">{field.values.join(" · ")}</dd>
        </div>)}
      </dl> : null}
    {information.description ? <details className="border-t border-[#DCE3EA] pt-4">
      <summary className="cursor-pointer rounded font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#003B73]">Sobre este producto</summary>
      <p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-[#45576A]">{information.description}</p>
    </details> : null}
  </>;
}
