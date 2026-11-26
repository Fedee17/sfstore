import { handleCreatePreference } from "@/lib/payments/mercadopago-handlers";
import { mercadoPagoDeps } from "@/services/mercadopago-server";

// Checkout Pro (contado, one payment). Answers 410 while Mercado Pago is not enabled (lib/payments/mercadopago.ts).
export async function POST(request: Request) {
  return handleCreatePreference(request, mercadoPagoDeps());
}
