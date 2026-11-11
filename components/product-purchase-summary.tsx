import { brand } from "@/lib/brand";
import type { CatalogAttribute } from "@/lib/catalog/attribute-config";
import { formatWebPrice, getWebTransferPrice, hasValidWebPrice } from "@/lib/web-transfer-pricing";

export function ProductPricePanel({ price, from = false }: { price: number; from?: boolean }) {
  if (!hasValidWebPrice(price)) return <div><p className="text-sm text-[#45576A]">Precio a confirmar</p><p className="text-xl font-semibold">Consultar precio</p></div>;
  return <div className="min-w-0 space-y-2" aria-label="Precio del producto">
    <p className="text-sm text-[#45576A]">Lista: <span data-testid="variant-list-price" className="line-through">{from ? "Desde " : ""}{formatWebPrice(price)}</span></p>
    <p data-testid="variant-transfer-price" className="product-price-value text-4xl font-bold leading-tight tracking-tight text-[#0072CE]">{from ? "Desde " : ""}{formatWebPrice(getWebTransferPrice(price))}</p>
    <span className="inline-flex rounded-md bg-[#0072CE]/10 px-2 py-1 text-xs font-semibold text-[#003B73]">25% OFF · Transferencia · Efectivo</span>
  </div>;
}

export function ProductPurchaseConditions({ attributes = [] }: { attributes?: CatalogAttribute[] }) {
  const originality = [...new Set(attributes.filter(attribute => /^(originalidad|autenticidad)$/i.test(attribute.name.trim())).map(attribute => attribute.value.trim()).filter(Boolean))];
  return <div className="space-y-2 border-t border-[#DCE3EA] pt-4 text-xs leading-5 text-[#45576A]" aria-label="Entrega y retiro">
    <p><strong className="font-semibold text-[#102033]">Retiro.</strong> {brand.address}. {brand.hours}. Esperá la confirmación del local para retirar.</p>
    <p><strong className="font-semibold text-[#102033]">Envíos.</strong> Costo y plazo según destino; confirmá la cotización antes de pagar.</p>
    {originality.length ? <p><strong className="font-semibold text-[#102033]">Originalidad.</strong> {originality.join(" · ")}</p> : null}
  </div>;
}
