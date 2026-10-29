import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

test('discovery precedes featured and gifts/advice remain after featured without the paused decant promotion', async () => {
  const html = await renderHome();
  assert.ok(html.indexOf('id="explorar"') < html.indexOf('id="productos"'));
  assert.match(html, /Perfumes para hacer sentir presencia/);
  assert.doesNotMatch(html, /id="decants-title"|Decants de perfumes árabes|Probá, conocé, elegí con confianza|Ver decants|href="\/buscar\?buscar=decant"/);
  for (const href of ['/perfumes', '/mates', '/accesorios']) assert.ok(html.includes(`href="${href}"`));
  for (const id of ['gifts-title', 'advice-title']) assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) ?? []).length, 1);
  const sections = [...html.matchAll(/<section\b[^>]*>/g)].map(match => match[0]);
  const featured = sections.findIndex(section => section.includes('id="productos"'));
  assert.ok(featured >= 0);
  assert.match(sections[featured + 1], /id="regalos"/);
  assert.match(sections[featured + 2], /aria-labelledby="advice-title"/);
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

test('Arabic category reuses its link with the supplied image, HTML copy and decorative arrow only', async () => {
  const html = await renderHome();
  const category = html.match(/<a href="\/perfumes" class="photoCard[\s\S]*?<\/a>/)?.[0];
  assert.ok(category);
  assert.match(category, /src="\/home\/a_wide_cinematic_high_resolution_tropical_sunset.png"/);
  assert.match(category, /<h3>Perfumes árabes<\/h3>/);
  assert.match(category, /<p>Encontrá tu próxima fragancia\.<\/p>/);
  assert.match(category, /<svg aria-hidden="true"/);
  assert.match(category, /alt=""/);
  assert.doesNotMatch(category, /tallMobileCard/);
  assert.equal((html.match(/class="photoCard/g) ?? []).length, 4);
  const categories = html.match(/<section id="explorar"[\s\S]*?<\/section>/)?.[0];
  assert.ok(categories);
  assert.doesNotMatch(categories, /Decants|Mates y termos|href="\/buscar/);
  assert.equal((categories.match(/href="\/mates"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /id="decants-title"/);
  assert.doesNotMatch(html, /href="\/buscar\?buscar=decant"/);
});

test('Termos uses the existing filtered catalog and preserves the approved original', async () => {
  const html = await renderHome();
  const card = html.match(/<a href="\/mates\?categoria=termos" class="photoCard[\s\S]*?<\/a>/)?.[0];
  assert.ok(card);
  assert.match(card, /<h3>Termos<\/h3>/);
  assert.match(card, /<p>Compañeros en cada aventura<\/p>/);
  assert.match(card, /class="photo thermosPhoto"/);
  assert.match(card, /<svg aria-hidden="true"/);
  const original = readFileSync(new URL('../public/home/outdoor_sunset_landscape_product_photo_a_warm_gol.png', import.meta.url));
  assert.equal(original.readUInt32BE(16), 1672);
  assert.equal(original.readUInt32BE(20), 941);
  assert.equal(createHash('sha256').update(original).digest('hex'), '847e437b2e52395dc41d7d9b085263b02f15d47edcaf93a467a48a633d689f2b');
});

test('Mates reuses the same photo card with its approved copy, original image and existing destination', async () => {
  const html = await renderHome();
  const card = html.match(/<a href="\/mates" class="photoCard[\s\S]*?<\/a>/)?.[0];
  assert.ok(card);
  assert.match(card, /<h3>Mates<\/h3>/);
  assert.match(card, /<p>Tradición en cada cebada<\/p>/);
  assert.match(card, /class="photoCard tallMobileCard group/);
  assert.match(card, /class="photo threeMatesPhoto"/);
  assert.match(card, /<svg aria-hidden="true"/);
  const original = readFileSync(new URL('../public/home/a_wide_cinematic_photorealistic_still_life_scene.png', import.meta.url));
  assert.equal(original.readUInt32BE(16), 1669);
  assert.equal(original.readUInt32BE(20), 942);
  assert.equal(createHash('sha256').update(original).digest('hex'), 'effac8f425684ab20be4e0c6868756e80acd60d545d7c959d8a00bb8ebd6b328');
  const previousImage = readFileSync(new URL('../public/home/a_wide_cinematic_photorealistic_outdoor_rustic_s.png', import.meta.url));
  assert.equal(createHash('sha256').update(previousImage).digest('hex'), 'f432f6ca99e3e356490b58de8ea3858e8163d4d2d418965faace40b8835cb026');
});

test('Arabic category preserves the supplied original bytes and dimensions', () => {
  const original = readFileSync(new URL('../public/home/a_wide_cinematic_high_resolution_tropical_sunset.png', import.meta.url));
  assert.equal(original.readUInt32BE(16), 1670);
  assert.equal(original.readUInt32BE(20), 942);
  assert.equal(createHash('sha256').update(original).digest('hex'), '93a7c348156b625416bbd9b431559a1cb8556d56adb007163f5639b2c9d2c56b');
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


test('Accesorios materos reuses the existing matero catalog without inventing a filter or changing the approved image', async () => {
  const html = await renderHome();
  const categories = html.match(/<section id="explorar"[\s\S]*?<\/section>/)?.[0];
  const card = categories.match(/<a href="\/mates" class="photoCard[\s\S]*?<\/a>/g).find(card => card.includes('<h3>Accesorios materos</h3>'));
  assert.ok(card);
  assert.match(card, /<p>Todo para acompañar tu ritual<\/p>/);
  assert.match(card, /class="photo mateAccessoriesPhoto"/);
  assert.match(card, /<svg aria-hidden="true"/);
  const original = readFileSync(new URL('../public/home/wide_cozy_warm_toned_photorealistic_product_sti.png', import.meta.url));
  assert.equal(createHash('sha256').update(original).digest('hex'), '9e39f3d942cad4fdd6784262518bb3397659869c5942a7da9cfd71b297cc622a');
});
