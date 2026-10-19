import { downloadCheckoutProof } from "@/services/checkout-payment-reports";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{orderId:string}>}) {
 return downloadCheckoutProof((await params).orderId);
}
