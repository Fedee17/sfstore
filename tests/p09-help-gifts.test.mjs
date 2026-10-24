import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const modules = {
  'react/jsx-runtime': jsx,
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  'next/server': { connection: async () => {} },
  '@/components/site-header': { SiteHeader: () => null },
  '@/components/home-hero-slider': { HomeHeroSlider: () => null },
  '@/lib/whatsapp': { buildWhatsAppUrl: message => `https://wa.me/5490000000000?text=${encodeURIComponent(message)}` },
  '@/lib/web-transfer-pricing': { getWebTransferPrice: () => { throw Error('No prices needed for this content test'); } },
  '@/services/products': { getCatalogPublications: async () => [] },
};
function load(file) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)(name => Object.hasOwn(modules, name) ? modules[name] : require(name), exports);
  return exports.default;
}
const help = () => renderToStaticMarkup(React.createElement(load('app/ayuda/page.tsx')));
function faq(html, title) {
  const sections = html.match(/<details\b[\s\S]*?<\/details>/g) ?? [];
  return sections.find(section => section.includes(title)) ?? '';
}

test('help separates payment reporting, bank verification and pickup authorization', () => {
  const html = help();
  assert.match(faq(html, '¿Cómo pago mi compra?'), /25%.*precio de lista.*total definitivo/);
  assert.match(faq(html, '¿Dónde adjunto el comprobante?'), /pantalla del pedido.*Informar pago y adjuntar comprobante/);
  assert.match(faq(html, '¿Dónde adjunto el comprobante?'), /PDF, PNG o JPEG de hasta 3 MiB/);
  assert.match(faq(html, '¿Dónde adjunto el comprobante?'), /WhatsApp no reemplaza este paso/);
  assert.match(faq(html, '¿El comprobante confirma el pago?'), /pendiente de verificación.*local revisa la acreditación/);
  const pickup = faq(html, '¿Cuándo puedo retirar mi compra?');
  assert.match(pickup, /lunes a sábados, de 17:30 a 20:30 hs/);
  assert.match(pickup, /pago confirmado no es una autorización para retirarlo/);
  assert.match(pickup, /Esperá que el local.*lista.*No se garantiza disponibilidad inmediata/);
  assert.doesNotMatch(html, /confirmación automática|pago se confirma automáticamente|enviá el comprobante por WhatsApp/i);
});

test('shipping help respects carrier choice, approved rates and unknown-total stop', () => {
  const shipping = faq(help(), '¿Hacen envíos a todo el país?');
  assert.match(shipping, /Sí.*checkout.*datos de entrega.*empresa de transporte preferida/);
  assert.match(shipping, /tarifa aprobada.*no contrata el transporte/);
  assert.match(shipping, /cotización.*total definitivo antes de preparar el pedido o transferir/);
  assert.doesNotMatch(shipping, /\$|gratis|24 horas|48 horas|envío inmediato/i);
});

test('gift help keeps browsing internal and explicitly identifies the external WhatsApp action', () => {
  const html = help();
  assert.match(html, /href="\/perfumes"[^>]*>Explorar Perfumes/);
  assert.match(html, /href="\/mates"[^>]*>Explorar Mates/);
  assert.match(html, /href="https:\/\/wa\.me\/[^\"]+" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /Consultar regalos.*WhatsApp, abre una pestaña nueva/);
  assert.match(html, /«Consultar regalos» abre WhatsApp en una pestaña nueva/);
  assert.equal((html.match(/<summary /g) ?? []).length, 8);
});

test('home gifts offers three separate actions without a nested link or changing other category destinations', async () => {
  const page = await load('app/page.tsx')();
  const html = renderToStaticMarkup(page);
  const gift = (html.match(/<article\b[\s\S]*?<\/article>/g) ?? []).find(article => article.includes('Elegí con ayuda o a tu manera'));
  assert.ok(gift);
  assert.equal((gift.match(/<a /g) ?? []).length, 3);
  assert.match(gift, /href="\/perfumes"/);
  assert.match(gift, /href="\/mates"/);
  assert.match(gift, /href="https:\/\/wa\.me\//);
  assert.match(gift, /Abre WhatsApp en una pestaña nueva/);
  assert.doesNotMatch(gift, /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/);
  for (const path of ['/perfumes', '/mates', '/accesorios']) assert.ok(html.includes(`href="${path}"`));
  assert.match(html, /Ver perfumes para regalar/);
  assert.match(html, /Ver mates para regalar/);
});
