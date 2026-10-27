import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as search from '../lib/catalog/search.ts';
import * as publications from '../lib/products/component-publications.ts';
import * as combos from '../lib/products/component-combos.ts';
import * as families from '../lib/products/public-families.ts';
import * as pricing from '../lib/web-transfer-pricing.ts';
import * as visibility from '../lib/catalog/public-product-visibility.ts';
import * as yara from '../lib/products/yara-rosa-consolidation.ts';
import * as availability from '../lib/catalog/availability-order.ts';
import { analyticsRenderStubs } from './fixtures/analytics-render-stubs.mjs';
import { publicRows, publicOffers, invalidRows, filterFixtureRows } from './fixtures/search-public-catalog.mjs';

const require = createRequire(import.meta.url);
function load(file, modules) {
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => Object.hasOwn(modules, name) ? modules[name] : require(name), exports);
  return exports;
}

function harness({ rows = publicRows, offers = publicOffers, fail = false } = {}) {
  const calls = [];
  const db = { from(table) {
    assert.ok(['public_catalog_skus', 'public_component_offers'].includes(table), 'Only public projections may be read');
    const params = new URLSearchParams();
    const q = {
      select(columns) { assert.doesNotMatch(columns, /cost|audit/); return q; }, order() { return q; }, limit() { return q; },
      gt(k, v) { params.set(k, 'gt.' + v); return q; }, eq(k, v) { params.set(k, 'eq.' + v); return q; },
      or(v) { params.set('or', v); return q; },
      then(ok, bad) {
        calls.push(table);
        return Promise.resolve({ data: fail ? null : filterFixtureRows(table === 'public_catalog_skus' ? rows : offers, params), error: fail ? { code: 'SYNTHETIC_FAILURE' } : null }).then(ok, bad);
      },
    };
    return q;
  }};
  const service = load('services/products.ts', {
    '@/lib/products/component-publications': publications, '@/lib/products/component-combos': combos,
    '@/lib/products/public-families': families, '@/lib/web-transfer-pricing': pricing,
    '@/lib/catalog/public-product-visibility': visibility, '@/lib/products/yara-rosa-consolidation': yara,
    '@/data/products': { products: [] }, '@/lib/supabase/client': { getSupabaseClient: () => db },
  });
  let result;
  const Page = load('app/buscar/page.tsx', {
    ...analyticsRenderStubs,
    'react/jsx-runtime': jsx, 'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    '@/components/site-header': { SiteHeader: () => null }, '@/lib/catalog/search': search, '@/services/products': service,
    '@/lib/catalog/availability-order': availability,
    '@/components/product-grid': { ProductGrid: ({ products }) => { result = products; return React.createElement('div', null, ...products.map(p => React.createElement('a', { key: p.id, href: '/producto/' + p.slug }, p.name))); } },
  }).default;
  return { calls, service, async query(buscar) {
    result = [];
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ buscar }) }));
    return { html, products: result };
  }};
}

test('search page includes both virtual charger connectors through the actual public catalog service', async () => {
  const h = harness();
  const { products, html } = await h.query('cargador');
  assert.equal(products.length, 2);
  assert.deepEqual(products.map(p => p.combo.connector).sort(), ['cc', 'lightning']);
  assert.equal(new Set(products.map(p => p.slug)).size, 2);
  assert.ok(products.every(p => p.price === 30666.67 && p.transferPrice === 23000 && p.stock === 2));
  assert.match(html, /2 productos encontrados/);
  assert.ok(products.every(p => html.includes('/producto/' + p.slug)));
  assert.equal(h.calls.filter(c => c === 'public_catalog_skus').length, publicRows.length + 1);
  assert.equal(h.calls.filter(c => c === 'public_component_offers').length, 3);
});

test('perfumes, mates, termos and both cable connectors remain searchable', async () => {
  const h = harness();
  for (const [term, names] of [
    ['perfume ambar', ['Perfume Ámbar PRUEBA']], ['mate imperial', ['Mate imperial PRUEBA']],
    ['termo acero', ['Termo de acero PRUEBA']], ['cable', ['Cable USB-C a Lightning PRUEBA', 'Cable USB-C a USB-C PRUEBA', 'Cargador completo USB-C a Lightning', 'Cargador completo USB-C a USB-C']],
    ['cargador lightning', ['Cargador completo USB-C a Lightning']],
  ]) assert.deepEqual((await h.query(term)).products.map(p => p.name).sort(), names.sort(), term);
});

test('a new active category is included without adding its slug to the search page', async () => {
  const { products } = await harness().query('lampara');
  assert.equal(products.length, 1);
  assert.equal(products[0].categorySlug, 'categoria-nueva-sin-registro');
});

test('empty search returns every public publication once, grouping family SKUs', async () => {
  const { products } = await harness().query(' ');
  assert.equal(products.length, 10);
  assert.equal(new Set(products.map(p => p.id)).size, products.length);
  assert.equal(products.filter(p => p.kind === 'family').length, 1);
  assert.equal(products.filter(p => p.kind === 'combo').length, 2);
  assert.equal((await harness().query('termo gris')).products[0].kind, 'family');
});

test('category pages keep their existing section filter while global search includes all sections', async () => {
  const h = harness();
  for (const section of ['perfumes', 'mates', 'accesorios']) {
    const products = await h.service.getProductsByCategorySlug(section);
    assert.ok(products.length > 0);
    assert.ok(products.every(p => p.category === section));
  }
});

test('non-public status, inactive categories and historical identities never become results', async () => {
  const { products, html } = await harness({ rows: [...publicRows, ...invalidRows] }).query(' ');
  assert.equal(products.length, 10);
  assert.doesNotMatch(html, /NO PUBLICAR/);
});

test('failure and unavailable component offers never invent products, and no result has a recovery link', async () => {
  const { html, products } = await harness({ fail: true }).query('cargador');
  assert.deepEqual(products, []);
  assert.match(html, /No encontramos/);
  assert.match(html, /href="\/buscar"/);
  assert.deepEqual((await harness({ offers: [] }).query('cargador')).products, []);
  assert.equal((await harness({ offers: [] }).query('cable')).products.length, 2);
});

test('array query parameters and special characters preserve existing query handling', async () => {
  assert.equal((await harness().query(['PERFUME ÁMBAR', 'cargador'])).products.length, 1);
  const { html } = await harness().query('<script>alert(1)</script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('catalog searches do not mutate prices, inventory, offers or fixture data', async () => {
  const before = JSON.stringify({ publicRows, publicOffers });
  const h = harness();
  await h.query('cargador'); await h.query(' '); await h.query('cable');
  assert.equal(JSON.stringify({ publicRows, publicOffers }), before);
});

test('search orders the complete paginated result including combos, without hiding exhausted products', async () => {
  const rows = publicRows.map(row => ({ ...row,
    stock: row.slug === 'cable-cc-prueba' ? 0 : row.stock,
    featured: row.slug === 'cable-cc-prueba',
  }));
  const { products } = await harness({ rows }).query('cable');
  assert.deepEqual(products.map(p => p.name), [
    'Cable USB-C a Lightning PRUEBA', 'Cargador completo USB-C a Lightning',
    'Cable USB-C a USB-C PRUEBA', 'Cargador completo USB-C a USB-C',
  ]);
  assert.equal(products.length, 4);
});
