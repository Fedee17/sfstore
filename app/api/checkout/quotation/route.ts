import { handleShippingAction } from "@/lib/checkout/shipping-http";
import type { CheckoutRequest } from "@/lib/checkout/contract";
import { authorizeCheckoutBuyer } from "@/services/checkout-server";
import { getBuyerShippingQuotation, requestCheckoutShippingQuotation } from "@/services/checkout-shipping";
export async function POST(request: Request) {
  return handleShippingAction(request,{ authorize:authorizeCheckoutBuyer,perform:(buyer,input)=>requestCheckoutShippingQuotation(buyer,input as CheckoutRequest) },"request");
}
export async function GET(request: Request) {
  try {
    const data = await getBuyerShippingQuotation(new URL(request.url).searchParams.get("id")??"");
    return Response.json(data??{error:"Solicitud no disponible."},{ status:data?200:404,headers:{"Cache-Control":"no-store"} });
  } catch { return Response.json({error:"Solicitud no disponible."},{status:404,headers:{"Cache-Control":"no-store"}}); }
}
