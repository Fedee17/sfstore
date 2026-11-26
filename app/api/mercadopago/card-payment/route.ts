import { handleCardPayment } from "@/lib/payments/mercadopago-handlers";
import { mercadoPagoDeps } from "@/services/mercadopago-server";

// Checkout API (financiado: list price in 2-3 credit card installments) with the Card Payment Brick token.
export async function POST(request: Request) {
  return handleCardPayment(request, mercadoPagoDeps());
}
