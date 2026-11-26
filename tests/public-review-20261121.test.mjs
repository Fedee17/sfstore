// Owner-approved fixes from the full public review of 21/11 (group A). Source-level guards; behavior is covered by the render tests.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('a contact edit keeps a computed rate; only destination changes (or a manual quotation) invalidate it',()=>{
 const checkout=read('app/checkout/page.tsx');
 const list=checkout.match(/const destinationChanged = \[([^\]]*)\]/)[1];
 for(const field of ['province','city','postalCode','deliveryMethod','address','carrier'])assert.match(list,new RegExp(`"${field}"`));
 for(const field of ['fullName','phone','email'])assert.doesNotMatch(list,new RegExp(`"${field}"`));
 assert.match(checkout,/destinationChanged \|\| quotationId !== null \|\| approvedTotal !== null/);
 // Shipping errors next to «Calcular envío»; a single rate is preselected.
 assert.match(checkout,/Calcular envío<\/button>\s*\{shippingError \? <p role="alert"/);
 assert.match(checkout,/if \(rates\.length === 1\) setSelectedQuoteKey\(rates\[0\]\.quoteKey\)/);
 // Spent idempotency keys are cleared with the cart after the order exists.
 assert.match(checkout,/clearCart\(\);\s*clearShippingDraft\(\);\s*clearCheckoutOperations\(\);/);
 assert.match(read('services/orders.ts'),/export function clearCheckoutOperations\(\) \{\s*try \{ sessionStorage\.removeItem\(checkoutOperationStorageKey\); sessionStorage\.removeItem\(quotationOperationStorageKey\);/);
});

test('every public step has its own tab title and the home carries the brand',()=>{
 assert.match(read('app/carrito/page.tsx'),/title: "Tu carrito"/);assert.doesNotMatch(read('app/carrito/page.tsx'),/"use client"/);
 assert.ok(read('app/checkout/layout.tsx').includes('title: { default: "Finalizar compra", template: "%s | SFSTORE Importados" }'));
 assert.match(read('app/checkout/entrega/layout.tsx'),/title: "Entrega"/);
 assert.match(read('app/checkout/exito/page.tsx'),/title: "Tu pedido"/);
 assert.match(read('app/not-found.tsx'),/title: "Página no encontrada"/);
 assert.match(read('app/page.tsx'),/absolute: "SFSTORE Importados · /);
});

test('404 uses the boutique frame and the legacy brand palette is gone',()=>{
 const page=read('app/not-found.tsx');
 assert.match(page,/<CatalogFrame>/);assert.doesNotMatch(page,/brand\.colors|#[0-9A-Fa-f]{6}/);
 assert.doesNotMatch(read('lib/brand.ts'),/colors:/);
});

test('security headers: no framing, no framework banner, strict referrer, nosniff',()=>{
 const config=read('next.config.ts');
 assert.match(config,/poweredByHeader: false/);
 for(const header of [`"Content-Security-Policy", value: "frame-ancestors 'none'"`,'"X-Frame-Options", value: "DENY"','"Referrer-Policy", value: "strict-origin-when-cross-origin"','"X-Content-Type-Options", value: "nosniff"'])assert.ok(config.includes(header),header);
});

test('phone fixes: no iOS zoom on search, landscape drawer/filters/floating buttons, readable WhatsApp button',()=>{
 assert.match(read('components/site-header.module.css'),/@media \(width < 1024px\) \{ \.searchInput \{ font-size: 16px; \} \}/);
 assert.match(read('components/cart.module.css'),/@media \(height < 500px\) \{\s*\.cart\[data-compact\] \.layout \{ overflow-y: auto;/);
 assert.match(read('components/catalog/catalog.module.css'),/@media \(height < 500px\) \{ \.dialog \{ height: 100dvh;/);
 assert.match(read('components/whatsapp-floating-button.module.css'),/@media \(height < 500px\) \{\s*\.cart \{[^}]*44px/);
 const button=read('components/whatsapp-floating-button.tsx');assert.doesNotMatch(button,/text-white|#0072CE|#F7F9FC/);assert.match(button,/text-\[#0b2a17\]/);
});

test('accessible names start with the visible text and carts never flash empty before loading',()=>{
 const add=read('components/add-to-cart-button.tsx');assert.doesNotMatch(add,/aria-label=\{confirmed \? undefined : `Agregar/);
 assert.match(add,/Agregar al carrito<span className="sr-only"> \{product\.name\}<\/span>/);
 assert.match(read('components/site-header.tsx'),/const cartLabel = `Mi carrito: /);
 assert.match(read('components/site-header.tsx'),/href="#contenido"[^>]*>Saltar al contenido<\/a>/);
 for(const file of ['components/cart-content.tsx','app/checkout/page.tsx','app/checkout/entrega/page.tsx'])assert.match(read(file),/useCartHydrated\(\)/,file);
 assert.match(read('store/cart-store.ts'),/useSyncExternalStore\(subscribeToCartHydration, \(\) => useCartStore\.persist\.hasHydrated\(\), \(\) => false\)/);
});
