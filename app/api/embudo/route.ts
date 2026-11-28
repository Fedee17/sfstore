import { after } from "next/server";
import { isLikelyBot } from "@/lib/catalog/search-demand";
import { isSameOriginBeacon, parseFunnelStep } from "@/lib/catalog/purchase-funnel";
import { recordFunnelStep } from "@/services/purchase-funnel";

const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

// Funnel beacon from the store itself: the body is only the step name. Anything else is dropped without detail.
export async function POST(request: Request) {
  if (!isSameOriginBeacon(request) || isLikelyBot(request.headers.get("user-agent"))) return noContent();
  if (Number(request.headers.get("content-length") ?? 0) > 16) return noContent();
  const body = await request.text().catch(() => "");
  const step = parseFunnelStep(body.length <= 16 ? body : "");
  if (step) after(() => recordFunnelStep(step));
  return noContent();
}
