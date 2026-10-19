import "server-only";
import { createHash } from "node:crypto";
import { CheckoutError, isUuid } from "@/lib/checkout/contract";
import { assertCheckoutOrigin } from "@/lib/checkout/http";
import { authorizeCheckoutBuyer } from "@/services/checkout-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/admin-session";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/uploads/limits";
const bucket = "checkout-payment-proofs";
export function proofMime(bytes: Uint8Array): string | null {
  const hex = Buffer.from(bytes.subarray(0,8)).toString("hex");
  if (hex === "89504e470d0a1a0a") return "image/png";
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (Buffer.from(bytes.subarray(0,5)).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}
async function readProof(request: Request) {
  const length=request.headers.get("content-length");
  if(length && (!/^\d+$/.test(length) || Number(length)>MAX_UPLOAD_FILE_BYTES)) throw new CheckoutError("CHECKOUT_PROOF_TOO_LARGE",413);
  const reader=request.body?.getReader();
  if (!reader) throw new CheckoutError("CHECKOUT_INVALID_PROOF",400);
  const parts: Uint8Array[]=[]; let total=0;
  try { while(true) { const {done,value}=await reader.read(); if(done) break; total+=value.length;
    if(total>MAX_UPLOAD_FILE_BYTES) { await reader.cancel(); throw new CheckoutError("CHECKOUT_PROOF_TOO_LARGE",413); } parts.push(value);
  } } finally { reader.releaseLock(); }
  if (!total) throw new CheckoutError("CHECKOUT_INVALID_PROOF",400);
  return Buffer.concat(parts,total);
}
function rpcError(message: string): never {
  const codes: Record<string,number>={CHECKOUT_NOT_FOUND:404,CHECKOUT_EXPIRED:409,CHECKOUT_IDEMPOTENCY_CONFLICT:409,CHECKOUT_REPORT_LIMIT:429,CHECKOUT_REVIEW_REQUIRED:429,CHECKOUT_INVALID_PROOF:400,CHECKOUT_PROOF_REQUIRED:409};
  throw new CheckoutError(codes[message] ? message : "CHECKOUT_REPORT_UNAVAILABLE",codes[message]??503);
}
export async function reportCheckoutPayment(request: Request,orderId: string) {
  const headers={"Cache-Control":"no-store"};
  try {
    assertCheckoutOrigin(request);
    const buyer=await authorizeCheckoutBuyer();
    if (!buyer) throw new CheckoutError("CHECKOUT_UNAUTHORIZED",401);
    const key=request.headers.get("x-checkout-operation-key");
    if (!isUuid(orderId)||!isUuid(key)) throw new CheckoutError("CHECKOUT_INVALID_REQUEST",400);
    const bytes=await readProof(request); const mime=proofMime(bytes);
    if (!mime || request.headers.get("content-type")!==mime) throw new CheckoutError("CHECKOUT_INVALID_PROOF",415);
    const digest=createHash("sha256").update(bytes).digest("hex"); const client=getSupabaseAdminClient();
    const prepared=await client.rpc("prepare_checkout_payment_report",{p_buyer_id:buyer,p_order_id:orderId,p_operation_key:key,p_sha256:digest,p_mime:mime,p_bytes:bytes.length});
    if(prepared.error) rpcError(prepared.error.message);
    if (!prepared.data) throw new CheckoutError("CHECKOUT_REPORT_UNAVAILABLE",503);
    if(prepared.data.status!=="uploading") return Response.json({status:prepared.data.status},{headers});
    const uploaded=await client.storage.from(bucket).upload(prepared.data.path,bytes,{contentType:mime,upsert:false});
    if(uploaded.error) {
      // Retry after upload/connection loss: never overwrite another proof.
      const stored=await client.storage.from(bucket).download(prepared.data.path);
      if(stored.error || !stored.data || createHash("sha256").update(Buffer.from(await stored.data.arrayBuffer())).digest("hex")!==digest) throw new CheckoutError("CHECKOUT_REPORT_UNAVAILABLE",503);
    }
    const submitted=await client.rpc("submit_checkout_payment_report",{p_buyer_id:buyer,p_order_id:orderId,p_operation_key:key});
    if(submitted.error) rpcError(submitted.error.message);
    return Response.json(submitted.data,{headers});
  } catch(error) {
    return Response.json({code:error instanceof CheckoutError?error.code:"CHECKOUT_REPORT_UNAVAILABLE",error:error instanceof CheckoutError && error.code==="CHECKOUT_PROOF_TOO_LARGE"?"El comprobante supera el límite de 3 MiB. Reducí su tamaño y reintentá.":"No se pudo informar el pago. Revisá el plazo, el comprobante y tu sesión; conservá esta ventana para reintentar o contactá al local."},{status:error instanceof CheckoutError?error.status:503,headers});
  }
}
export async function downloadCheckoutProof(orderId: string) {
  const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"};
  if(!isUuid(orderId)) return new Response(null,{status:404,headers});
  const buyer=await authorizeCheckoutBuyer(); const admin=await getAdminUser();
  if(!buyer&&!admin) return new Response(null,{status:401,headers});
  const client=getSupabaseAdminClient();
  if(!admin) {
    const owned=await client.from("checkout_operations").select("order_id").eq("order_id",orderId).eq("buyer_id",buyer!).maybeSingle();
    if(owned.error||!owned.data) return new Response(null,{status:404,headers});
  }
  const report=await client.from("checkout_payment_reports").select("object_path,mime_type,status").eq("order_id",orderId).maybeSingle();
  if(report.error||!report.data||report.data.status==="uploading") return new Response(null,{status:404,headers});
  const stored=await client.storage.from(bucket).download(report.data.object_path);
  if(stored.error||!stored.data) return new Response(null,{status:503,headers});
  const audit=await client.from("checkout_audit").insert({order_id:orderId,actor_id:admin?.id??buyer,event:admin?"proof_viewed_admin":"proof_viewed_buyer"});
  if(audit.error) return new Response(null,{status:503,headers});
  return new Response(await stored.data.arrayBuffer(),{headers:{...headers,"Content-Type":report.data.mime_type,"Content-Disposition":`attachment; filename="comprobante${report.data.mime_type==="application/pdf"?".pdf":report.data.mime_type==="image/png"?".png":".jpg"}"`}});
}
