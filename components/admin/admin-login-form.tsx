"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { loginAdmin } from "@/app/admin/login/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";

type AdminTurnstile = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    action: string;
    "response-field": boolean;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
    "timeout-callback": () => void;
  }) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
function getTurnstile() {
  return (window as unknown as { turnstile?: AdminTurnstile }).turnstile;
}

export function AdminLoginForm({ siteKey }: { siteKey: string }) {
  const element = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const clearToken = (reason: string) => { setToken(""); setMessage(reason); };
  const renew = () => {
    clearToken("");
    if (widget.current !== null) getTurnstile()?.reset(widget.current);
  };
  useEffect(() => () => {
    if (widget.current !== null) getTurnstile()?.remove(widget.current);
    widget.current = null;
  }, []);
  async function submit(formData: FormData) {
    try { await loginAdmin(formData); }
    finally { renew(); }
  }
  return (
    <form action={submit} className="mt-7 grid gap-5">
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[#1F1F1F]/75">Email</span>
        <input name="email" type="email" required autoComplete="email" className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]" />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[#1F1F1F]/75">Contraseña</span>
        <input name="password" type="password" required autoComplete="current-password" className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]" />
      </label>
      <input type="hidden" name="captchaToken" value={token} />
      {siteKey ? (
        <>
          <div ref={element} aria-label="Verificación de acceso administrativo" />
          <Script id="admin-turnstile" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive"
            onError={() => clearToken("No se pudo cargar la verificación. Revisá la conexión y recargá la página.")}
            onReady={() => {
              const turnstile = getTurnstile();
              if (!element.current || !turnstile || widget.current !== null) return;
              widget.current = turnstile.render(element.current, {
                sitekey: siteKey, action: "admin-login", "response-field": false,
                callback: (value) => { setToken(value); setMessage(""); },
                "expired-callback": () => clearToken("La verificación venció. Renovala para ingresar."),
                "error-callback": () => clearToken("La verificación falló. Reintentá antes de ingresar."),
                "timeout-callback": () => clearToken("La verificación agotó el tiempo. Renovala para ingresar."),
              });
            }} />
          <button type="button" onClick={renew} className="text-left text-sm font-semibold text-[#8B5E3C]">Renovar verificación</button>
        </>
      ) : <p role="alert" className="text-sm text-[#8B5E3C]">La verificación de acceso no está configurada. Contactá al administrador.</p>}
      {message ? <p role="alert" aria-live="polite" className="text-sm text-[#8B5E3C]">{message}</p> : null}
      <PendingSubmitButton disabled={!siteKey || !token} pendingLabel="Ingresando..." className="rounded-full bg-[#556B2F] px-6 py-3.5 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] disabled:cursor-not-allowed disabled:opacity-60">Entrar</PendingSubmitButton>
    </form>
  );
}
