"use client";
import { useState } from "react";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/uploads/limits";
import { useRouter } from "next/navigation";
export function CheckoutPaymentReportForm({orderId,operationKey}:{orderId:string;operationKey?:string}) {
 const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 return <form className="mt-6 grid gap-3" onSubmit={async event=>{
  event.preventDefault();if(busy)return;
  const form=new FormData(event.currentTarget);const file=form.get("proof");
  if(!(file instanceof File)||!file.size||file.size>MAX_UPLOAD_FILE_BYTES){setMessage("Adjuntá un PDF, PNG o JPEG de hasta 3 MiB.");return;}
  setBusy(true);
  try {
   const storageKey=`sfstore-payment-report:${orderId}`;
   const key=operationKey??sessionStorage.getItem(storageKey)??crypto.randomUUID();sessionStorage.setItem(storageKey,key);
   const response=await fetch(`/api/checkout/payment-report/${orderId}`,{method:"POST",headers:{"content-type":file.type,"x-checkout-operation-key":key},body:file});
   if(response.status===413)throw new Error("El comprobante supera el límite de carga. Adjuntá un archivo de hasta 3 MiB.");
   const result=await response.json();
   if(!response.ok)throw new Error(result.error);
   setMessage("Pago informado, pendiente de verificación. El comprobante no acredita el pago.");router.refresh();
  }catch(error){setMessage(error instanceof Error?error.message:"No se pudo informar el pago.");}finally{setBusy(false);}
 }}>
 <p className="text-sm">PDF, PNG o JPEG de hasta 3 MiB.</p>
 <label>Comprobante de transferencia<input type="file" name="proof" accept="application/pdf,image/png,image/jpeg" required disabled={busy}/></label>
 <label><input type="checkbox" required disabled={busy}/> Realicé la transferencia del 100% del total y adjunto su comprobante.</label>
 <button className="rounded bg-[#003B73] p-3 text-white" disabled={busy}>{busy?"Informando...":"Informar pago y adjuntar comprobante"}</button>
 {message?<p role="status">{message}</p>:null}
 </form>;
}
