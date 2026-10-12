"use client";
import { useState } from "react";
import { transferPayment } from "@/lib/payment";
export function TransferAlias() {
 const [message,setMessage]=useState("");
 const copy=async()=>{try{await navigator.clipboard.writeText(transferPayment.alias);setMessage("Alias copiado.");}catch{setMessage("No se pudo copiar. Seleccioná y copiá el alias manualmente.");}};
 return <div><p>Billetera: {transferPayment.provider}</p><p>Alias: <strong>{transferPayment.alias}</strong></p><button type="button" onClick={copy} className="mt-2 rounded border px-3 py-2">Copiar alias</button>{message?<p role="status">{message}</p>:null}</div>;
}
