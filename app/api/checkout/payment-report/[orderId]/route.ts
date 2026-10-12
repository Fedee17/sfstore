import { reportCheckoutPayment } from "@/services/checkout-payment-reports";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{orderId:string}>}) {
 return reportCheckoutPayment(request,(await params).orderId);
}
