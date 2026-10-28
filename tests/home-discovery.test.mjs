import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as prices from '../lib/web-transfer-pricing.ts';
import * as availability from '../lib/products/public-families.ts';

const require = createRequire(import.meta.url);
function load(file, modules = {}) {
  const out = {};
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', js)(id => modules[id] ?? (id.endsWith('.module.css') ? { default: new Proxy({}, { get: (_, key) => key }) } : require(id)), out);
  return out;
}
const selection = load('lib/catalog/home-selection.ts', { '../products/public-families': availability });
const product = (id, extra = {}) => ({ id, name: id, slug: id, category: 'perfumes', stock: 1, price: 100, featured: true, shortDescription: 'Prueba', ...extra });

test('home ranks only the featured pool by actual publication availability and photograph, without mutation', () => {
  const input = [product('empty', { stock: 0, primaryImageUrl: '/empty.webp' }), product('missing'), product('photo', { primaryImageUrl: '/photo.webp' }), product('not-featured', { featured: false, primaryImageUrl: '/other.webp' })];
  const before = structuredClone(input);
  assert.deepEqual(selection.getHomeFeaturedProducts(input).map(p => p.id), ['photo', 'missing', 'empty']);
  assert.deepEqual(input, before);
});

test('families, virtual combos, unknown prices and deterministic ties retain their contracts', () => {
  const input = [product('combo', { kind: 'combo', stock: 0 }), product('family', { kind: 'family', stock: 0, variants: [product('sku')], primaryImageUrl: '/family.webp' }), product('zero', { price: 0 }), product('null', { price: null })];
  assert.deepEqual(selection.getHomeFeaturedProducts(input).map(p => p.id), ['family', 'null', 'zero', 'combo']);
  assert.equal(input[0].stock, 0);
  assert.equal(input[1].stock, 0);
  assert.equal(input[2].price, 0);
  const fallback = Array.from({ length: 9 }, (_, i) => product(String(i), { featured: false }));
  assert.equal(selection.getHomeFeaturedProducts(fallback).length, 6);
  assert.deepEqual(selection.getHomeFeaturedProducts([]), []);
});

async function renderHome(products = []) {
  const modules = {
    react: React, 'react/jsx-runtime': jsx,
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/server': { connection: async () => {} },
    '@/components/site-header': { SiteHeader: () => React.createElement('header', null, 'Existing header') },
    '@/components/home-hero-slider': { HomeHeroSlider: ({ slides }) => React.createElement('div', { id: 'hero' }, ...slides.map(slide => slide.title + slide.subtitle)) },
    '@/lib/web-transfer-pricing': prices, '@/lib/products/public-families': availability,
    '@/lib/catalog/home-selection': selection,
    '@/lib/whatsapp': { buildWhatsAppUrl: message => 'https://wa.me/000?text=' + encodeURIComponent(message) },
    '@/services/products': { getCatalogPublications: async () => products },
  };
  return renderToStaticMarkup(await load('app/page.tsx', modules).default());
}

test('discovery precedes featured, uses the existing decant search, and consolidates gifts/advice', async () => {
  const html = await renderHome();
  assert.ok(html.indexOf('id="explorar"') < html.indexOf('id="productos"'));
  assert.match(html, /Perfumes para hacer sentir presencia/);
  assert.match(html, /href="\/buscar\?buscar=decant"/);
  for (const href of ['/perfumes', '/mates', '/accesorios']) assert.ok(html.includes(`href="${href}"`));
  for (const id of ['gifts-title', 'advice-title']) assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) ?? []).length, 1);
  assert.match(html, /25% de descuento\. Pago del 100%/);
  assert.match(html, /Entregas a todo el país/);
  assert.doesNotMatch(html, /diseñador|perfumes importados|cuotas|envío gratis/i);
});

test('missing photographs and prices never create fictional images or free offers', async () => {
  const html = await renderHome([product('zero', { price: 0 }), product('null', { price: null }), product('valid')]);
  assert.equal((html.match(/Precio a confirmar/g) ?? []).length, 2);
  assert.doesNotMatch(html, /Agregar al carrito|\$\s*0|<img[^>]+src=""/);
  assert.match(html, /75/);
});

test('existing hero renders only explicitly supplied photographs with alternative text', () => {
  const Hero = load('components/home-hero-slider.tsx', { react: { ...React, useState: v => [v, () => {}] }, 'react/jsx-runtime': jsx }).HomeHeroSlider;
  const slide = { title: 'Perfumes', subtitle: 'Árabes', primaryCtaLabel: 'Ver perfumes', primaryCtaHref: '/perfumes' };
  const render = slides => renderToStaticMarkup(React.createElement(Hero, { slides }));
  assert.doesNotMatch(render([slide]), /<img/);
  assert.doesNotMatch(render([{ ...slide, imageSrc: '/unapproved.webp' }]), /<img/);
  const html = render([{ ...slide, imageSrc: '/approved-real-photo.webp', imageAlt: 'Fotografía real aprobada' }]);
  assert.match(html, /<img[^>]+alt="Fotografía real aprobada"/);
  assert.match(html, /object-contain/);
  assert.equal(render([]), '');
});


test('approved banners keep HTML copy, gender destinations and a single responsive picture', async () => {
  const hooks = index => ({ ...React, useState: () => [index, () => {}] });
  const pageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const slides = [];
  const Page = load('app/page.tsx', {
    'react/jsx-runtime': jsx,
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/server': { connection: async () => {} },
    '@/components/site-header': { SiteHeader: () => null },
    '@/components/home-hero-slider': { HomeHeroSlider: props => { slides.push(...props.slides); return null; } },
    '@/lib/web-transfer-pricing': prices, '@/lib/products/public-families': availability,
    '@/lib/catalog/home-selection': selection,
    '@/lib/whatsapp': { buildWhatsAppUrl: () => 'https://wa.me/000' },
    '@/services/products': { getCatalogPublications: async () => [] },
  }).default;
  renderToStaticMarkup(await Page());
  assert.equal(slides.length, 2);
  assert.equal(slides[0].composition, 'continuous');
  assert.equal(slides[1].composition, 'continuous');
  assert.equal(slides[0].desktopImagePosition, undefined);
  assert.equal(slides[1].desktopImagePosition, '85% center');
  assert.equal(slides[0].title, 'Un perfume que habla de vos.');
  assert.equal(slides[1].title, 'Perfumes para hacer sentir presencia.');
  for (const [i, gender] of ['femenino', 'masculino'].entries()) {
    assert.equal(slides[i].primaryCtaHref, '/perfumes?categoria=arabe&genero=' + gender);
    const Hero = load('components/home-hero-slider.tsx', { react: hooks(i), 'react/jsx-runtime': jsx }).HomeHeroSlider;
    const html = renderToStaticMarkup(React.createElement(Hero, { slides }));
    assert.match(html, new RegExp('<h2[^>]*>' + slides[i].title.replace('.', '\\.') + '</h2>'));
    assert.equal((html.match(/<picture/g) ?? []).length, 1);
    assert.equal((html.match(/<img /g) ?? []).length, 1);
    assert.match(html, /media="\(min-width: 640px\)"/);
    assert.ok(html.includes('/home/' + gender + '-mobile-768.webp'));
    assert.ok(html.includes('/home/' + gender + '-desktop-1600.webp'));
    assert.doesNotMatch(html, new RegExp('/home/' + (i ? 'femenino' : 'masculino') + '-'));
    assert.match(html, /aria-live="polite"/);
    if (i === 1) assert.match(html, /--hero-desktop-position:85% center/);
    else assert.doesNotMatch(html, /--hero-desktop-position/);
    assert.match(html, /<a[^>]+href="\/perfumes\?categoria=arabe&amp;genero=/);
  }
  assert.doesNotMatch(pageSource, /home-banner-perfumes\.png|home-banner-mates\.png/);
});


test('all four approved compositions have small responsive WebP derivatives with preserved proportions', async () => {
  const sharp = require('sharp');
  const assets = [
    ['femenino-mobile', [480, 768], 1024 / 1536],
    ['masculino-mobile', [480, 768], 1024 / 1536],
    ['femenino-desktop', [960, 1600], 2021 / 778],
    ['masculino-desktop', [960, 1600], 2021 / 778],
  ];
  for (const [name, widths, ratio] of assets) for (const width of widths) {
    const bytes = readFileSync(new URL(`../public/home/${name}-${width}.webp`, import.meta.url));
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, width);
    assert.ok(Math.abs(metadata.width / metadata.height - ratio) < 0.005);
    assert.ok(bytes.length < 300000);
  }
});


test('continuous composition is reusable while preserving legacy slides', () => {
  const Hero = load('components/home-hero-slider.tsx', { react: { ...React, useState: v => [v, () => {}] }, 'react/jsx-runtime': jsx }).HomeHeroSlider;
  const base = { title: 'Un perfume que habla de vos.', subtitle: 'Descubrí nuestra selección de perfumes árabes para mujer.', primaryCtaLabel: 'Ver perfumes árabes', primaryCtaHref: '/perfumes?categoria=arabe&genero=femenino', imageSrc: '/female.webp', imageAlt: 'Perfumes árabes para mujer' };
  const render = slide => renderToStaticMarkup(React.createElement(Hero, { slides: [slide] }));
  const overlay = render({ ...base, composition: 'continuous' });
  assert.match(overlay, /class="scene"/);
  assert.match(overlay, /class="photo"/);
  assert.match(overlay, /class="copy"/);
  assert.doesNotMatch(overlay, /grid-cols|object-contain/);
  assert.match(render(base), /object-contain/);
  assert.doesNotMatch(render(base), /class="scene"/);
  const css = readFileSync(new URL('../components/home-hero-slider.module.css', import.meta.url), 'utf8');
  assert.match(css, /object-fit: cover/);
  assert.doesNotMatch(css, /url\(|transform:|filter:/);
});
