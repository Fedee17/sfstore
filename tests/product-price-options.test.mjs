import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyticsRenderStubs } from './fixtures/analytics-render-stubs.mjs';
import { loadProductDetailUi } from './fixtures/product-detail-render.mjs';
import * as commercialPricing from '../lib/products/commercial-pricing.ts';
import * as web from '../lib/web-transfer-pricing.ts';

// Approved product-page price presentation (Codex, 25/11/2026) wired to the existing list / transfer prices.
const require = createRequire(import.meta.url);
function load(file, overrides = {}, globals = {}) {
  const modules = { ...analyticsRenderStubs, react: React, 'react/jsx-runtime': jsx, ...overrides };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(id => modules[id] ?? require(id), exports, ...Object.values(globals));
  return exports;
}
const ui = loadProductDetailUi(load, { '@/lib/whatsapp': { getProductWhatsAppLink: () => '/synthetic' } });
const { ProductPriceOptions, initialPaymentOption } = ui['@/components/product-price-options'];
const { getPublishedPaymentPrices, paymentPricesFromCalculator } = ui['@/lib/products/payment-prices'];
// Products as the catalog delivers them under today's database policy: cash = 75% of list.
const published = price => { try { return getPublishedPaymentPrices({ price, transferPrice: web.getWebTransferPrice(price) }); } catch { return null; } };
const options = ({ price, ...props }) => renderToStaticMarkup(React.createElement(ProductPriceOptions, { prices: published(price), installments: null, payment: null, onPaymentChange: () => {}, ...props }));
const text = html => html.replace(/<[^>]+>/g, '').replace(/ /g, ' ');

test('list price first, then the published cash (transfer) price and the saving, all from the product price', () => {
  const html = options({ price: 17700 });
  assert.match(text(html), /\$ 17\.700.*Otra opción de compra.*Precio de lista: \$ 17\.700.*Precio de contado.*\$ 13\.275.*Ahorrás\$ 4\.425/);
  assert.ok(html.indexOf('variant-list-price') < html.indexOf('variant-transfer-price'));
  assert.doesNotMatch(text(html), /sin interés/i);
});

test('installments stay hidden and the list-price option cannot be chosen while that payment method is disabled', () => {
  const html = options({ price: 17700 });
  assert.doesNotMatch(html, /cuotas de|price-installments/);
  assert.match(html, /<input type="radio" disabled=""[^>]*aria-labelledby/);
  assert.match(html, /Precio de lista \(pago en cuotas no disponible\)/);
  assert.equal((html.match(/<input type="radio"/g) ?? []).length, 2);
});

test('enabled installments divide the list price; a non-exact division is labelled approximate', () => {
  assert.match(text(options({ price: 17700, installments: 3 })), /Mismas 3 cuotas de \$ 5\.900CFTEA: [\d.]+,\d{2}%Otra opción de compra/);
  assert.doesNotMatch(text(options({ price: 17700, installments: 3 })), /aprox\./);
  assert.match(text(options({ price: 10000, installments: 3 })), /Mismas 3 cuotas de \$ 3\.333,33 aprox\./);
  assert.doesNotMatch(options({ price: 10000, installments: 3 }), /radio" disabled/);
});

test('the chosen option shows the approved check; a family before choosing a variant reads «Desde»', () => {
  assert.match(options({ price: 100, payment: 'cash' }), /scale-105 bg-\[var\(--boutique-olive\)\] text-white/);
  assert.doesNotMatch(options({ price: 100 }), /scale-105/);
  assert.match(text(options({ price: 100, from: true })), /Desde \$ 100.*Desde \$ 75/);
});

test('cents keep the existing display rounding; invalid prices ask for a quote and offer no option', () => {
  const html = text(options({ price: 129333.67 }));
  assert.match(html, /\$ 129\.334/); assert.match(html, /\$ 97\.001/); assert.match(html, /Ahorrás\$ 32\.333,42/);
  for (const price of [null, 0, -1, Number.NaN, Infinity, '100']) {
    const invalid = options({ price });
    assert.match(invalid, /Precio a confirmar/); assert.doesNotMatch(invalid, /radio|NaN|\$\s*0/);
  }
});

test('the saving is the difference between list and cash prices, e.g. the admin calculator proposal', () => {
  const proposal = paymentPricesFromCalculator(commercialPricing.calculateCommercialPrices({ cost: '10000', fixedCost: '0', sellingCostPpm: 0n }));
  assert.deepEqual(proposal, { list: 17700, cash: 15300 });
  const html = text(options({ prices: proposal, installments: 3 }));
  // Res. 4/2025: with installments the page adds the CFTEA (here 142,33%) to the price, number and amount of installments.
  assert.match(html, /\$ 17\.700Mismas 3 cuotas de \$ 5\.900CFTEA: 142,33%Otra opción de compra✓Precio de lista: \$ 17\.700Precio de contado\$ 15\.300Ahorrás\$ 2\.400/);
  // The local comparison with the approved mockup shows exactly its content, without the CFTEA line.
  assert.match(text(options({ prices: proposal, installments: 3, showCftea: false })), /\$ 17\.700Mismas 3 cuotas de \$ 5\.900Otra opción de compra/);
  for (const prices of [{ list: 100, cash: 120 }, { list: 100, cash: 0 }, { list: Number.NaN, cash: 1 }, null]) {
    assert.match(options({ prices }), /Precio a confirmar/);
  }
  assert.doesNotMatch(text(options({ prices: { list: 100, cash: 100 } })), /Ahorrás|Precio de lista:/);
});

test('cash starts selected only while installments are disabled', () => {
  assert.equal(initialPaymentOption(null), 'cash');
  assert.equal(initialPaymentOption(3), null);
});

test('a product whose cash price is missing or above its list price asks for a quote', () => {
  assert.equal(getPublishedPaymentPrices({ price: 17700 }), null);
  assert.equal(getPublishedPaymentPrices({ price: 17700, transferPrice: null }), null);
  assert.equal(getPublishedPaymentPrices({ price: 17700, transferPrice: 17800 }), null);
  assert.deepEqual(getPublishedPaymentPrices({ price: 17700, transferPrice: 15300 }), { list: 17700, cash: 15300 });
});

test('Agregar al carrito: enabled at once without installments; with both options it waits for a choice', () => {
  const product = { id: 'p', name: 'Producto sintético', slug: 'p', kind: 'simple', category: 'mates', price: 17700, transferPrice: 13275, stock: 2, featured: false, imagePlaceholder: 'P', shortDescription: '' };
  const render = (payment, extra = {}, installments = 3) => {
    const store = { useCartStore: select => select({ items: [], addItem: () => {} }), cartItemKey: item => item.id };
    const { ProductActions } = load('app/producto/[slug]/product-actions.tsx', {
      ...ui, react: { ...React, useState: init => [payment === undefined ? (typeof init === 'function' ? init() : init) : payment, () => {}] }, '@/store/cart-store': store,
      '@/components/add-to-cart-button': load('components/add-to-cart-button.tsx', { ...ui, '@/store/cart-store': store }),
    });
    return renderToStaticMarkup(React.createElement(ProductActions, { product: { ...product, ...extra }, installments }));
  };
  assert.match(render(null), /<button type="button" disabled=""[^>]*>.*Agregar al carrito/);
  assert.doesNotMatch(render('cash'), /<button type="button" disabled=""/);
  const installments = render('installments');
  assert.match(installments, /<button type="button" disabled=""/);
  assert.match(installments, /El pago en cuotas todavía no está habilitado en el carrito\./);
  assert.match(render(null, { stock: 0 }), /Consultar disponibilidad/);
  const production = render(undefined, {}, null);
  assert.doesNotMatch(production, /<button type="button" disabled=""/);
  assert.equal((production.match(/checked=""/g) ?? []).length, 1);
  assert.match(render(undefined, {}, 3), /<button type="button" disabled=""/);
});

test('production never advertises installments; a development server can preview them on request', () => {
  const installments = env => load('lib/payments/installments.ts', { '@/lib/products/commercial-pricing': commercialPricing }, { process: { env } });
  assert.equal(installments({ NODE_ENV: 'production' }).getPublicInstallments(true), null);
  assert.equal(installments({ NODE_ENV: 'development' }).getPublicInstallments(false), null);
  assert.equal(installments({ NODE_ENV: 'development' }).getPublicInstallments(true), 3);
});

test('local mockup comparison: reference amounts and initial state, never added to the cart', () => {
  let added = 0;
  const store = { useCartStore: select => select({ items: [], addItem: () => { added++; } }), cartItemKey: item => item.id };
  const { ProductActions } = load('app/producto/[slug]/product-actions.tsx', {
    ...ui, react: { ...React, useState: init => [typeof init === 'function' ? init() : init, () => {}] }, '@/store/cart-store': store,
    '@/components/add-to-cart-button': load('components/add-to-cart-button.tsx', { ...ui, '@/store/cart-store': store }),
  });
  const product = { id: 'p', name: 'Producto sintético', slug: 'p', kind: 'simple', category: 'perfumes', price: 100000, transferPrice: 75000, stock: 2, featured: false, imagePlaceholder: 'P', shortDescription: '' };
  const html = renderToStaticMarkup(React.createElement(ProductActions, { product, installments: 3, reference: { list: 17700, cash: 15300 } }));
  assert.match(text(html), /\$ 17\.700Mismas 3 cuotas de \$ 5\.900Otra opción de compra✓Precio de lista: \$ 17\.700Precio de contado\$ 15\.300Ahorrás\$ 2\.400/);
  assert.doesNotMatch(html, /checked=""|CFTEA|100\.000/);
  assert.match(html, /<button type="button" disabled=""/);
  assert.equal(added, 0);
});
