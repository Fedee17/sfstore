import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

// Approved admin price calculator (Codex, 26/11/2026). Synthetic amounts only; nothing is saved.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeRequire = createRequire(import.meta.url), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const local = id => { const base = id.startsWith('@/') ? resolve(root, id.slice(2)) : resolve(dirname(file), id); return [base, base + '.ts', base + '.tsx'].find(p => /\.tsx?$/.test(p) && existsSync(p)); };
  new Function('require', 'exports', code)(id => id === 'react' ? React : id === 'react/jsx-runtime' ? jsx : id.startsWith('.') || id.startsWith('@/') ? load(local(id)) : nodeRequire(id), exports);
  return exports;
}
const pricing = load(resolve(root, 'lib/products/commercial-pricing.ts'));
const model = load(resolve(root, 'components/admin/products/price-preview-model.ts'));
const { PriceCalculatorPreview } = load(resolve(root, 'components/admin/products/price-calculator-preview.tsx'));
const B = BigInt;
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/ /g, ' ').replace(/\s+/g, ' ');

test('without an explicit profit the calculator keeps the 50% rule for existing callers', () => {
  const r = pricing.calculateCommercialPrices({ cost: '10000', fixedCost: '0', sellingCostPpm: B(0) });
  assert.equal(r.cashCents, B(1530000));
  assert.equal(r.financedCents, B(1770000));
});

test('approved example: cost $40.000 and profit $15.000 → lista $64.500 (3 × $21.500), contado $56.100', () => {
  const costs = model.readCosts({ purchase: '40000', acquisition: '', selling: '' });
  const target = model.profitTarget(costs.total, { unit: 'money', value: '15000' });
  assert.equal(target.counterpart, '37,5');
  const preview = model.makePricePreview({ transferRate: '', overrides: {} }, costs, target.cents);
  assert.equal(preview.list.price, B(6450000));
  assert.equal(preview.cash.price, B(5610000));
  for (const method of [...preview.list.results, ...preview.cash.results]) assert.ok(method.profitCents >= B(1500000), method.id);
  assert.equal(model.profitTarget(costs.total, { unit: 'percent', value: '37,5' }).cents, B(1500000));
});

test('manual adjustments replace the suggestion; invalid or zero amounts leave no price to apply', () => {
  const costs = model.readCosts({ purchase: '40000', acquisition: '1000', selling: '500' });
  assert.equal(costs.total, B(4150000));
  const target = model.profitTarget(costs.total, { unit: 'money', value: '15000' }).cents;
  const preview = model.makePricePreview({ transferRate: '', overrides: { list: '65000' } }, costs, target);
  assert.equal(preview.list.price, B(6500000));
  assert.equal(preview.list.suggestion, B(6630000));
  assert.equal(preview.cash.price, B(5760000));
  for (const list of ['0', 'abc']) assert.equal(model.makePricePreview({ transferRate: '', overrides: { list } }, costs, target).list.price, null);
  assert.throws(() => model.readCosts({ purchase: '-1', acquisition: '', selling: '' }));
});

test('the approved screen renders the suggested prices with both disclosures closed', () => {
  const html = renderToStaticMarkup(React.createElement(PriceCalculatorPreview, { purchase: '40000', onPurchaseChange() {}, onApply() {}, onKeep() {} }));
  const t = text(html);
  for (const expected of ['Calculadora de precios', '¿Cuánto te costó?', '¿Cuánto querés ganar?', 'Precios sugeridos', 'Precio de lista', '$ 64.500', '3 de $ 21.500', 'Precio de contado', '$ 56.100', 'Ahorrás $ 8.400 (13,02%)', 'Aplicar precios', 'Opciones avanzadas', 'Ver detalles del cálculo']) {
    assert.ok(t.includes(expected), expected);
  }
  assert.doesNotMatch(html, /<details[^>]*open/);
});
