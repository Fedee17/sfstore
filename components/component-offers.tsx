import { ComponentBuyTogether } from "@/components/component-buy-together";
import { getComponentOffers } from "@/services/public-component-offers";
export async function ComponentOffers({ headId }: { headId: string }) {
  let offers;
  try { offers = await getComponentOffers(headId); }
  catch { return <p role="status" className="mt-5 rounded-xl border p-4 text-sm">No pudimos consultar los conjuntos. Podés comprar este artículo por separado.</p>; }
  return <ComponentBuyTogether offers={offers}/>;
}
