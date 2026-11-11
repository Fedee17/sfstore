import { ComponentBuyTogether } from "@/components/component-buy-together";
import { getComponentOffers } from "@/services/public-component-offers";
export async function ComponentOffers({ headId }: { headId: string }) {
  let offers;
  try { offers = await getComponentOffers(headId); }
  catch { return null; }
  return <ComponentBuyTogether offers={offers}/>;
}
