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
import * as materoTaxonomy from '../lib/catalog/matero-taxonomy.ts';
import { catalogFrameStubs } from './fixtures/catalog-frame-stubs.mjs';
import { searchDemandStubs } from './fixtures/search-demand-stubs.mjs';

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
const filterModules = { '@/lib/catalog/attribute-config': attributes, '@/lib/product-taxonomy': taxonomy, '@/lib/catalog/matero-taxonomy': materoTaxonomy };
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
    ...searchDemandStubs,
    '@/components/site-header': { SiteHeader: () => null },
    ...catalogFrameStubs,
    '@/components/catalog/mobile-catalog-filters': { MobileCatalogFilters: () => null },
    '@/components/catalog/catalog-sidebar': { CatalogSidebar: () => null },
    '@/components/catalog/catalog-sort-control': { CatalogSortControl: ({ basePath, order, params }) => React.createElement('form', { 'data-sort': order ?? '', 'data-base': basePath, 'data-params': JSON.stringify(params) }) },
    '@/components/analytics-view': { AnalyticsView: () => null },
    '@/lib/catalog/availability-order': ordering,
    '@/lib/seo/share-image': { shareImage: { url: '/logo-sfstore.png', alt: 'SFSTORE Importados' }, brandLogoPath: '/logo-sfstore.png' },
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
  test(`${route}: page orders complete results by default and retains exhausted links`, async () => {
    const products = [item('out', 'Alfa agotado', 0, { category: route, featured: true }), item('in', 'Zeta disponible', 1, { category: route })];
    const before = structuredClone(products);
    const { html, products: result } = await loadPage(`app/${route}/page.tsx`, products).run();
    assert.deepEqual(ids(result), ['in', 'out']);
    assert.match(html, /href="\/producto\/synthetic-out"/);
    assert.doesNotMatch(html, /Disponibles primero/);
    // I3: only Perfumes and Mates offer the price order; Accesorios and search keep the recommended order alone.
    if (route === 'perfumes' || route === 'mates') assert.match(html, new RegExp('data-sort="" data-base="/' + route + '"'));
    else assert.doesNotMatch(html, /data-sort/);
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

test('I3: price order only accepts the two public values; anything else keeps the recommended order', () => {
  assert.equal(ordering.parseCatalogOrder('menor-precio'), 'menor-precio');
  assert.equal(ordering.parseCatalogOrder('mayor-precio'), 'mayor-precio');
  for (const value of [undefined, '', 'precio', 'MENOR-PRECIO', '__proto__', ['menor-precio']]) assert.equal(ordering.parseCatalogOrder(value), null);
  const input = [item('z', 'Zeta', 0, { featured: true }), item('b', 'Ámbar', 2), item('f', 'Zeta', 1, { featured: true })];
  assert.deepEqual(ids(ordering.orderCatalog(input, null)), ids(ordering.availableFirst(input)));
});

test('I3: the compared amount is the one the card highlights: cash price when valid, otherwise list, none without a valid list', () => {
  assert.equal(ordering.catalogCardPrice({ price: 100000, transferPrice: 75000 }), 75000);
  assert.equal(ordering.catalogCardPrice({ price: 100000, transferPrice: null }), 100000);
  assert.equal(ordering.catalogCardPrice({ price: 100000, transferPrice: 120000 }), 100000);
  assert.equal(ordering.catalogCardPrice({ price: 0, transferPrice: 50 }), null);
});

test('I3: price order keeps available products first and prices on request after priced ones, without mutating the input', () => {
  const input = [
    item('soldout-cheap', 'Agotado barato', 0, { price: 10000, transferPrice: 7500 }),
    item('expensive', 'Caro', 1, { price: 200000, transferPrice: 150000 }),
    item('on-request', 'Consultar', 1, { price: 0, transferPrice: null }),
    item('cheap', 'Barato', 3, { price: 40000, transferPrice: 30000 }),
    item('list-only', 'Solo lista', 1, { price: 60000, transferPrice: null }),
    item('family', 'Familia', 0, { kind: 'family', price: 90000, transferPrice: 50000, variants: [item('v1', 'Negro', 1), item('v2', 'Gris', 0)] }),
    item('soldout-expensive', 'Agotado caro', 0, { price: 300000, transferPrice: 225000 }),
  ];
  const before = ids(input);
  assert.deepEqual(ids(ordering.orderCatalog(input, 'menor-precio')), ['cheap', 'family', 'list-only', 'expensive', 'on-request', 'soldout-cheap', 'soldout-expensive']);
  assert.deepEqual(ids(ordering.orderCatalog(input, 'mayor-precio')), ['expensive', 'list-only', 'family', 'cheap', 'on-request', 'soldout-expensive', 'soldout-cheap']);
  assert.deepEqual(ids(input), before);
});

test('I3: equal prices fall back to the recommended order (featured, Spanish name, ID)', () => {
  const input = [item('b', 'Beta', 1, { price: 100, transferPrice: 75 }), item('a', 'Alfa', 1, { price: 100, transferPrice: 75 }), item('f', 'Zeta', 1, { price: 100, transferPrice: 75, featured: true })];
  assert.deepEqual(ids(ordering.orderCatalog(input, 'menor-precio')), ['f', 'a', 'b']);
  assert.deepEqual(ids(ordering.orderCatalog(input, 'mayor-precio')), ['f', 'a', 'b']);
});

test('I3: perfumes and mates read ?orden and order the filtered grid with it', () => {
  for (const page of ['app/perfumes/page.tsx', 'app/mates/page.tsx']) {
    const source = readFileSync(new URL('../' + page, import.meta.url), 'utf8');
    assert.match(source, /parseCatalogOrder\(params\.orden\)/, page);
    assert.match(source, /orderCatalog\(filteredProducts, order\)/, page);
    assert.doesNotMatch(source, /availableFirst\(filteredProducts\)/, page);
    assert.match(source, /<CatalogSortControl /, page);
  }
});

test('I3: ?orden reaches the grid and the control on both catalogs, and an unknown value falls back to recommended', async () => {
  for (const route of ['perfumes', 'mates']) {
    const products = [item('expensive', 'Alfa caro', 1, { category: route, price: 200, transferPrice: 150, featured: true }), item('cheap', 'Zeta barato', 1, { category: route, price: 100, transferPrice: 75 })];
    const page = loadPage('app/' + route + '/page.tsx', products);
    const cheapFirst = await page.run({ orden: 'menor-precio' });
    assert.deepEqual(ids(cheapFirst.products), ['cheap', 'expensive']);
    assert.match(cheapFirst.html, /data-sort="menor-precio"/);
    assert.deepEqual(ids((await page.run({ orden: 'mayor-precio' })).products), ['expensive', 'cheap']);
    const unknown = await page.run({ orden: 'barato' });
    assert.deepEqual(ids(unknown.products), ['expensive', 'cheap']);
    assert.match(unknown.html, /data-sort=""/);
  }
});

test('I3: a single result shows no order control', async () => {
  const html = (await loadPage('app/perfumes/page.tsx', [item('only', 'Único', 1, { price: 100, transferPrice: 75 })]).run()).html;
  assert.doesNotMatch(html, /data-sort/);
});
