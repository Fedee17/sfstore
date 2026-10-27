import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ordering from '../lib/catalog/availability-order.ts';
import { publicationAvailable } from '../lib/products/public-families.ts';
import * as attributes from '../lib/catalog/attribute-config.ts';
import * as search from '../lib/catalog/search.ts';

const require = createRequire(import.meta.url);
function loadFilters(file, modules) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', code)(name => modules[name] ?? require(name), exports);
  return exports;
}
const taxonomy = loadFilters('lib/product-taxonomy.ts', { '@/lib/catalog/attribute-config': attributes });
const filterModules = { '@/lib/catalog/attribute-config': attributes, '@/lib/product-taxonomy': taxonomy };
const perfumes = loadFilters('lib/catalog/perfume-filters.ts', filterModules);
const mates = loadFilters('lib/catalog/mate-filters.ts', filterModules);
const item = (id, name, stock, extra = {}) => ({ id, name, stock, featured: false,
  slug: 'synthetic-' + id, category: 'perfumes', price: 100, shortDescription: 'Synthetic', ...extra });
const ids = products => products.map(p => p.id);

test('availability precedes featured, then Spanish name and ID resolve ties in both groups', () => {
  const input = [item('z', 'Zeta', 0, { featured: true }), item('b', 'Ámbar', 2),
    item('a', 'Ámbar', 1), item('f', 'Zeta', 1, { featured: true }), item('o', 'Alfa', 0)];
  assert.deepEqual(ids(ordering.availableFirst(input)), ['f', 'a', 'b', 'z', 'o']);
});

test('family availability uses its variants, never its intentionally zero publication stock', () => {
  const family = item('family', 'Familia', 0, { kind: 'family', variants: [item('black', 'Negro', 0), item('gray', 'Gris', 1)] });
  const exhausted = item('empty-family', 'Familia agotada', 5, { kind: 'family', variants: [item('green', 'Verde', 0)] });
  const result = ordering.availableFirst([exhausted, family]);
  assert.deepEqual(ids(result), ['family', 'empty-family']);
  assert.equal(result[0], family);
  assert.equal(result.length, 2);
});

test('both combo connectors use their existing derived stock, without recomputing or changing recipes', () => {
  const cc = item('cc', 'Cargador C/C', 0, { kind: 'combo', combo: { connector: 'cc' }, featured: true });
  const lightning = item('lightning', 'Cargador Lightning', 1, { kind: 'combo', combo: { connector: 'lightning' } });
  assert.deepEqual(ids(ordering.availableFirst([cc, lightning])), ['lightning', 'cc']);
  assert.equal(cc.stock, 0);
});

test('zero/null prices do not masquerade as exhausted and all products and values are retained', () => {
  const products = [item('out', 'Agotado', 0, { price: 100 }), item('zero', 'Cero', 1, { price: 0 }),
    item('null', 'Nulo', 1, { price: null }), item('valid', 'Válido', 1, { price: 30666.67 })];
  const before = structuredClone(products);
  for (const p of products) Object.freeze(p);
  Object.freeze(products);
  const sorted = ordering.availableFirst(products);
  assert.deepEqual(ids(sorted), ['zero', 'null', 'valid', 'out']);
  assert.deepEqual(products, before);
  assert.notEqual(sorted, products);
  assert.equal(sorted[0], products[1]);
});

test('empty/all exhausted/all available input is stable and never removes cards', () => {
  assert.deepEqual(ordering.availableFirst([]), []);
  for (const stock of [0, 4]) {
    const input = [item('b', 'Beta', stock), item('a', 'Alfa', stock)];
    assert.deepEqual(ids(ordering.availableFirst(input)), ['a', 'b']);
  }
});

function loadPage(file, products) {
  let result;
  const modules = {
    'react/jsx-runtime': jsx,
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/server': { connection: async () => {} },
    '@/components/site-header': { SiteHeader: () => null },
    '@/components/catalog/mobile-catalog-filters': { MobileCatalogFilters: () => null },
    '@/components/catalog/catalog-sidebar': { CatalogSidebar: () => null },
    '@/components/analytics-view': { AnalyticsView: () => null },
    '@/lib/catalog/availability-order': ordering,
    '@/lib/catalog/attribute-config': attributes,
    '@/lib/catalog/perfume-filters': perfumes, '@/lib/catalog/mate-filters': mates,
    '@/lib/catalog/search': search,
    '@/services/products': { getProductsByCategorySlug: async () => products, getCatalogPublications: async () => products },
    '@/components/product-grid': { ProductGrid: ({ products }) => {
      result = products;
      return React.createElement('div', null, ...products.map(p => React.createElement('a', { key: p.id, href: '/producto/' + p.slug }, p.name)));
    } },
  };
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => modules[name] ?? require(name), exports);
  return { async run(params = {}) {
    result = undefined;
    const html = renderToStaticMarkup(await exports.default({ searchParams: Promise.resolve(params) }));
    return { html, products: result };
  } };
}

for (const route of ['perfumes', 'mates', 'accesorios', 'buscar']) {
  test(`${route}: page orders complete results, retains exhausted links and adds no sorting controls`, async () => {
    const products = [item('out', 'Alfa agotado', 0, { category: route, featured: true }), item('in', 'Zeta disponible', 1, { category: route })];
    const before = structuredClone(products);
    const { html, products: result } = await loadPage(`app/${route}/page.tsx`, products).run();
    assert.deepEqual(ids(result), ['in', 'out']);
    assert.match(html, /href="\/producto\/synthetic-out"/);
    assert.doesNotMatch(html, /Disponibles primero/);
    assert.deepEqual(products, before);
  });
}

test('perfume attribute filters retain their exact result set, including matching exhausted products', async () => {
  const attrs = value => [{ name: 'commercial_category', value: 'arabe' }, { name: 'olfactory_family', value }];
  const products = [item('out', 'Ámbar agotado', 0, { attributes: attrs('dulce') }),
    item('in', 'Dulce disponible', 1, { attributes: attrs('dulce') }), item('fresh', 'Fresco', 2, { attributes: attrs('fresco') })];
  const page = loadPage('app/perfumes/page.tsx', products);
  assert.deepEqual(ids((await page.run({ categoria: 'arabe', familia: 'dulce' })).products), ['in', 'out']);
  const empty = await page.run({ categoria: 'arabe', familia: 'cuero' });
  assert.equal(empty.products, undefined);
  assert.match(empty.html, /No encontramos productos con esa combinación/);
  assert.match(empty.html, /href="\/perfumes"/);
});

test('mate material filters and the existing no-match state are unchanged', async () => {
  const products = [item('out', 'Agotado', 0, { category: 'mates', attributes: [{ name: 'material', value: 'calabaza' }] }),
    item('in', 'Disponible', 1, { category: 'mates', attributes: [{ name: 'material', value: 'calabaza' }] }),
    item('wood', 'Madera', 1, { category: 'mates', attributes: [{ name: 'material', value: 'algarrobo' }] })];
  const page = loadPage('app/mates/page.tsx', products);
  assert.deepEqual(ids((await page.run({ categoria: 'mates', material: 'calabaza' })).products), ['in', 'out']);
  assert.match((await page.run({ categoria: 'mates', material: 'inoxidable-inexistente' })).html, /No encontramos productos/);
});

test('search matching, escaped query and no-result state are preserved', async () => {
  const page = loadPage('app/buscar/page.tsx', [item('a', 'Perfume Ámbar', 0), item('b', 'Mate', 1)]);
  assert.deepEqual(ids((await page.run({ buscar: 'perfume ambar' })).products), ['a']);
  assert.match((await page.run({ buscar: '<script>missing</script>' })).html, /&lt;script&gt;/);
});

test('sorting the same publications leaves the shared catalog order available to home and related products', () => {
  const shared = [item('featured-out', 'Primero editorial', 0, { featured: true }), item('available', 'Segundo', 1)];
  const original = [...shared];
  const ordered = ordering.availableFirst(shared);
  assert.equal(publicationAvailable(ordered[0]), true);
  assert.deepEqual(shared, original);
});
