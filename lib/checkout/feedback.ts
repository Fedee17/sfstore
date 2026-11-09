const messages:Record<string,string>={
  CHECKOUT_SESSION_LOST:'Se perdió la sesión de compra. Conservá esta ventana y consultanos antes de volver a enviar el pedido.',
  CHECKOUT_SESSION_UNAVAILABLE:'No pudimos verificar tu sesión. Conservá esta ventana y reintentá; tu carrito se conserva.',
  CHECKOUT_GUEST_NOT_CONFIGURED:'No podemos preparar pedidos en este momento. Tu carrito se conserva; consultanos por WhatsApp.',
  CHECKOUT_CAPTCHA_REQUIRED:'Completá la verificación de seguridad antes de preparar el pedido.',
  CHECKOUT_STOCK_INSUFFICIENT:'Cambió el stock disponible. Volvé al carrito y revisá las cantidades antes de reintentar.',
  CHECKOUT_PRODUCT_UNAVAILABLE:'Un producto ya no está disponible. Revisá tu carrito antes de continuar.',
  VARIANT_NOT_WEB_VISIBLE:'La variante elegida ya no está disponible. Volvé a la ficha y elegí otra opción.',
  VARIANT_COMMERCIALLY_BLOCKED:'La variante elegida no está disponible para comprar. Consultanos por WhatsApp.',
  COMBO_NOT_AVAILABLE:'El conjunto elegido ya no está disponible. Revisá tu carrito.',
  CHECKOUT_UNAUTHORIZED:'No pudimos verificar tu sesión. Recargá esta página y reintentá; tu carrito se conserva.',
  CHECKOUT_SHIPPING_QUOTE_CHANGED:'La cotización cambió o venció. Volvé a calcular el envío antes de preparar el pedido. No transfieras todavía.',
  CHECKOUT_SHIPPING_QUOTE_REQUIRED:'Calculá el envío y elegí una tarifa, o solicitá una cotización antes de continuar.',
  CHECKOUT_IDEMPOTENCY_CONFLICT:'El intento anterior tiene otros datos. Revisá tu pedido o consultanos antes de volver a enviarlo.',
  CHECKOUT_PENDING_LIMIT:'Ya tenés pedidos pendientes. Revisalos o consultanos antes de crear otro.',
  CHECKOUT_FREQUENCY_LIMIT:'Recibimos varios intentos seguidos. Esperá un momento y reintentá; tu carrito se conserva.',
};
export const checkoutConnectionError='No pudimos conectar con la tienda. Revisá tu conexión y reintentá sin cambiar los datos. Tu carrito se conserva.';
export function checkoutErrorMessage(code:unknown):string {
  return typeof code==='string'&&Object.hasOwn(messages,code)?messages[code]:'No pudimos preparar el pedido. Tu carrito se conserva; reintentá o consultanos por WhatsApp si el problema continúa.';
}
