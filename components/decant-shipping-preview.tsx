"use client";

import { useId, useState, type FormEvent } from "react";
import { getAndreaniPreviewQuote } from "@/lib/checkout/andreani-preview";

const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export function DecantShippingPreview() {
  const id = useId();
  const [postalCode, setPostalCode] = useState("");
  const [submittedCode, setSubmittedCode] = useState("");
  const quote = getAndreaniPreviewQuote(submittedCode);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedCode(postalCode);
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#DCE3EA] p-3">
      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor={id} className="block font-semibold text-[#102033]">Código postal</label>
        <div className="flex flex-wrap gap-2">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            pattern="[0-9]{4}"
            title="Ingresá cuatro números"
            required
            maxLength={4}
            aria-describedby={`${id}-details`}
            value={postalCode}
            onChange={(event) => {
              setPostalCode(event.target.value);
              setSubmittedCode("");
            }}
            className="min-h-11 min-w-24 flex-1 rounded-xl border border-[#003B73]/25 px-3 text-base text-[#102033] focus-visible:outline-2 focus-visible:outline-[#0072CE]"
          />
          <button type="submit" className="min-h-11 rounded-xl border border-[#003B73]/25 px-3 font-semibold text-[#003B73] focus-visible:outline-2 focus-visible:outline-[#0072CE]">
            Cotizar envío
          </button>
        </div>
        <p id={`${id}-details`}>Prueba local de Andreani para 1 decant de 5 ml. Probá 5000, 2000, 1425, 5500 u 8300.</p>
      </form>
      <div role="status" aria-atomic="true">
        {quote ? (
          <div className="space-y-1">
            <p className="font-semibold text-[#102033]">{quote.destination} · Andreani</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
              <dt>A sucursal</dt><dd className="font-semibold">{currency.format(quote.branch)}</dd>
              <dt>A domicilio</dt><dd className="font-semibold">{currency.format(quote.home)}</dd>
            </dl>
            <p>Precios de referencia del 14/11/2026. Andreani suma el 1% del valor declarado.</p>
          </div>
        ) : submittedCode ? <p>Todavía no hay una cotización de prueba para este código postal.</p> : null}
      </div>
    </div>
  );
}
