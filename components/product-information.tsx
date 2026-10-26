import { getProductCommercialInformation } from "@/lib/products/commercial-information";

type InformationProduct = Parameters<typeof getProductCommercialInformation>[0];

/** Existing product details block, shared by simple products and the chosen SKU. */
export function ProductInformation({ product, showSummary = false }: { product: InformationProduct; showSummary?: boolean }) {
  const information = getProductCommercialInformation(product);
  return <>
    {showSummary && information.shortDescription ? <p className="whitespace-pre-line break-words text-sm leading-6">{information.shortDescription}</p> : null}
    <details className="mt-4 border-t border-[#003B73]/15 pt-3">
      <summary className="cursor-pointer font-semibold">Información del producto</summary>
      {information.fields.length ? <dl aria-label="Características del producto" className="mt-3 grid gap-3 text-sm leading-6 sm:grid-cols-2">
        {information.fields.map(field => <div key={field.label} className="min-w-0">
          <dt className="font-semibold text-[#003B73]">{field.label}</dt>
          <dd className="break-words text-[#102033]/80">{field.values.join(" · ")}</dd>
        </div>)}
      </dl> : null}
      {information.description ? <p className="mt-3 whitespace-pre-line break-words text-sm leading-6">{information.description}</p> : null}
    </details>
  </>;
}
