// Mercado Pago (26/11/2026) stays unavailable in render regressions: the checkout keeps its transfer-only UI and the
// receipt never renders the payment component. Rendering the choice while disabled is a test failure.
export const mercadoPagoUiStubs = {
  '@/components/checkout-payment-choice': {
    useMercadoPagoAvailable: () => ({ enabled: false, installments: false }),
    CheckoutPaymentChoice: () => { throw Error('Mercado Pago choice rendered while disabled'); },
    checkoutRequestPayment: p => p === 'transfer' ? { paymentMethod: 'transfer' } : { paymentMethod: 'mercadopago', priceMode: p === 'mp-cuotas' ? 'financiado' : 'contado' },
  },
  '@/components/mercadopago-payment': { MercadoPagoPayment: () => null },
};
