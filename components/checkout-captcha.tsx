"use client";
import { useEffect, useRef } from "react";
import Script from "next/script";
declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey:string; callback:(token:string)=>void; "expired-callback":()=>void; "error-callback":()=>void }) => string;
      remove: (id:string) => void;
    };
  }
}
export function CheckoutCaptcha({ onToken }: { onToken:(token:string|undefined)=>void }) {
  const element = useRef<HTMLDivElement>(null);
  const widget = useRef<string|null>(null);
  const sitekey = process.env.NEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY;
  useEffect(()=>()=>{ if (widget.current && window.turnstile) window.turnstile.remove(widget.current); },[]);
  if (!sitekey) return null;
  return <div className="mt-5"><div ref={element} aria-label="Verificación de compra" />
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={()=>{
      if (element.current && window.turnstile && !widget.current) widget.current = window.turnstile.render(element.current,{ sitekey,callback:onToken,"expired-callback":()=>onToken(undefined),"error-callback":()=>onToken(undefined) });
    }} />
  </div>;
}
