import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadPerfumeAccords, loadProductDetailUi } from './fixtures/product-detail-render.mjs';

const require = createRequire(import.meta.url);
function load(file, modules = {}) {
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText)(name => Object.hasOwn(modules, name) ? modules[name] : require(name), exports);
  return exports;
}
const api = loadPerfumeAccords(load);
const research = JSON.parse(readFileSync(new URL('../lib/products/perfume-accords-research.json', import.meta.url), 'utf8'));
const eclaire = research['lattafa-eclaire'];
const { ProductInformation } = loadProductDetailUi(load, { '@/lib/whatsapp': { buildWhatsAppUrl: () => '/synthetic' } })['@/components/product-information'];

test('research contains four to six documented accords with provenance and no concentration inference', () => {
  for (const document of Object.values(research)) {
    assert.deepEqual(api.validatePerfumeAccords(document), document);
    assert.ok(document.accords.length >= 4 && document.accords.length <= 6);
    assert.ok(document.sourceUrl.startsWith('https://'));
    if (document.method === 'source-bar-width') assert.equal(Math.max(...document.accords.map(item => item.relativeStrength)), 100);
  }
  assert.deepEqual(eclaire.accords.map(item => item.relativeStrength), [100, 70.35, 63.9, 60.38]);
  assert.deepEqual(research['club-de-nuit-iconic'].accords.map(item => item.originalLabel), ['Citrus', 'Woody', 'Fresh spicy', 'Amber']);
  assert.equal(research['bharara-rome-pour-femme'].method, 'documented-list');
  assert.match(research['stallion-53-uomo-intense'].sourceUrl, /Uomo-Intense-137428/);
});

test('stored edits, ordering and explicit deletion override the researched record; corrupt data stays hidden', () => {
  const edits = { ...eclaire, accords: [...eclaire.accords].reverse().slice(0, 2) };
  const attr = value => [{ name: api.PERFUME_ACCORD_ATTRIBUTE, value: JSON.stringify(value) }];
  assert.deepEqual(api.getPerfumeAccords('lattafa-eclaire', attr(edits)), edits);
  assert.equal(api.getPerfumeAccords('lattafa-eclaire', attr({ ...eclaire, accords: [] })).accords.length, 0);
  assert.equal(api.getPerfumeAccords('lattafa-eclaire', attr({ version: 99 })), undefined);
  assert.equal(api.getPerfumeAccords('unknown', []), undefined);
});

test('server-side attribute serializer rejects unproven bars, malformed dates, URLs, duplicates and oversized payloads', () => {
  const form = new FormData();
  assert.equal(api.perfumeAccordAttribute(form, 'perfumes'), null);
  form.set(api.PERFUME_ACCORD_INPUT, JSON.stringify(eclaire));
  const row = api.perfumeAccordAttribute(form, 'perfumes');
  assert.deepEqual(JSON.parse(row.value), eclaire);
  assert.throws(() => api.perfumeAccordAttribute(form, 'mates'));
  for (const invalid of [
    { ...eclaire, method: 'documented-list' },
    { ...eclaire, method: 'longevity' },
    { ...eclaire, consultedAt: '2026-02-30' },
    { ...eclaire, consultedAt: '2999-01-01' },
    { ...eclaire, sourceUrl: 'javascript:alert(1)' },
    { ...eclaire, sourceUrl: 'https://user:password@example.com/' },
    { ...eclaire, accords: [...eclaire.accords, eclaire.accords[0]] },
    { ...eclaire, accords: [{ ...eclaire.accords[0], relativeStrength: 101 }] },
    { ...eclaire, accords: [{ ...eclaire.accords[0], relativeStrength: '90' }] },
  ]) assert.throws(() => api.validatePerfumeAccords(invalid));
  assert.throws(() => api.parsePerfumeAccords(' '.repeat(12001)));
});

test('shared product UI uses actual documented lengths, label-only fallback, escaping and no requests or new artwork', () => {
  const render = (slug, attributes = [], category = 'perfumes') => renderToStaticMarkup(React.createElement(ProductInformation, {
    product: { category, slug, name: 'Producto de prueba', attributes }, standalone: true,
  }));
  const measured = render('lattafa-eclaire');
  assert.match(measured, /Acordes<br\/>principales/);
  assert.match(measured, /width:70.35%/);
  assert.match(measured, /No indica duración ni proyección/);
  const list = render('bharara-rome-pour-femme');
  assert.match(list, /Floral/);
  assert.match(list, /sin predominancia cuantificada/);
  assert.doesNotMatch(list, /width:|sobre 100/);
  assert.doesNotMatch(render('unknown'), /Acordes/);
  assert.doesNotMatch(render('lattafa-eclaire', [], 'mates'), /Acordes/);
  const escaped = { ...eclaire, accords: [{ label: '<script>alert(1)</script>', originalLabel: 'Sweet', relativeStrength: 100 }] };
  assert.match(render('x', [{ name: api.PERFUME_ACCORD_ATTRIBUTE, value: JSON.stringify(escaped) }]), /&lt;script&gt;/);
});
