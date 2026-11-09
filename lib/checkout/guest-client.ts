import {checkoutConnectionError,checkoutErrorMessage} from './feedback';

let pending: Promise<void> | null = null;
export async function ensureGuestCheckoutSession(captchaToken?: string) {
  if (pending) return pending;
  const perform = async () => {
    const response = await fetch("/api/checkout/session",{ method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({ captchaToken,hasPendingOperation:!!sessionStorage.getItem("sfstore-checkout-operation") || !!sessionStorage.getItem("sfstore-shipping-quotation-operation") }) }).catch(()=>{throw new Error(checkoutConnectionError);});
    const result = await response.json().catch(()=>{throw new Error(checkoutErrorMessage('CHECKOUT_UNAUTHORIZED'));});
    if (!response.ok) throw new Error(checkoutErrorMessage(result.code??'CHECKOUT_UNAUTHORIZED'));
  };
  // Serialize first-session creation across tabs as well as within this tab.
  if (!navigator.locks) throw new Error("Este navegador no permite iniciar una sesión de compra segura. Usá un navegador actualizado o contactá al local.");
  pending = navigator.locks.request("sfstore-checkout-session",perform).then(()=>undefined);
  try { await pending; } finally { pending = null; }
}
