import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const headerCalls = [];
const cssModule = new Proxy({}, { get: (_, key) => `css-${String(key)}` });
const modules = {
  'react/jsx-runtime': jsx,
  'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/components/site-header': { SiteHeader: (props) => { headerCalls.push(props); return React.createElement('header', null); } },
  '@/components/storefront-surface.module.css': { __esModule: true, default: cssModule },
  './catalog.module.css': { __esModule: true, default: cssModule },
};
const code = ts.transpileModule(readFileSync(new URL('../components/catalog/catalog-frame.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const frame = {};
new Function('require', 'exports', code)(name => modules[name] ?? require(name), frame);

test('catalog frame keeps the shared header outside and themes only the catalog canvas', () => {
  headerCalls.length = 0;
  const html = renderToStaticMarkup(React.createElement(frame.CatalogFrame, { searchQuery: 'mate' }, React.createElement('p', null, 'contenido')));
  assert.deepEqual(headerCalls, [{ searchQuery: 'mate' }]);
  assert.match(html, /^<main class="css-page font-sans"><header><\/header><div data-storefront-theme="boutique" class="css-canvas css-botanicalCorner css-canvas font-sans"><p>contenido<\/p><\/div><\/main>$/);
});

test('back link and empty state keep their destinations, copy and heading level', () => {
  const back = renderToStaticMarkup(React.createElement(frame.CatalogBackLink, { href: '/mates' }));
  assert.match(back, /href="\/mates"/);
  assert.match(back, /Volver a categorías/);
  const empty = renderToStaticMarkup(React.createElement(frame.CatalogEmptyState, { title: 'Sin resultados', text: 'Probá otro filtro.', href: '/perfumes', action: 'Limpiar filtros', titleAs: 'h2' }));
  assert.match(empty, /<h2 class="[^"]*">Sin resultados<\/h2>/);
  assert.match(empty, /<a href="\/perfumes"[^>]*>Limpiar filtros<\/a>/);
  assert.match(renderToStaticMarkup(React.createElement(frame.CatalogEmptyState, { title: 'T', text: 'x', href: '/', action: 'a' })), /<h3 /);
});
