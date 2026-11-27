import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as ordering from "../lib/catalog/availability-order.ts";

const require = createRequire(import.meta.url);

function loadControl() {
  const code = ts.transpileModule(readFileSync(new URL("../components/catalog/catalog-sort-control.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const modules = {
    "react/jsx-runtime": jsx,
    react: React,
    // next/form renders a GET form with the action; its client navigation is Next's concern, not this test's.
    "next/form": { default: ({ children, ...props }) => React.createElement("form", { method: "get", ...Object.fromEntries(Object.entries(props).filter(([name]) => name !== "scroll")) }, children) },
    "@/lib/catalog/availability-order": ordering,
    "./catalog.module.css": { default: new Proxy({}, { get: (_target, name) => String(name) }) },
  };
  const exports = {};
  new Function("require", "exports", code)((name) => modules[name] ?? require(name), exports);
  return exports.CatalogSortControl;
}

test("I3: the order control keeps active filters, drops the previous order and works without JavaScript", () => {
  const CatalogSortControl = loadControl();
  const html = renderToStaticMarkup(React.createElement(CatalogSortControl, {
    basePath: "/perfumes",
    params: { categoria: "arabe", familia: "dulce", orden: "mayor-precio", vacio: "", ausente: undefined },
    order: "mayor-precio",
  }));
  assert.match(html, /<form [^>]*action="\/perfumes" method="get">/);
  assert.match(html, /<input type="hidden" name="categoria" value="arabe"\/>/);
  assert.match(html, /<input type="hidden" name="familia" value="dulce"\/>/);
  assert.doesNotMatch(html, /type="hidden" name="orden"/);
  assert.doesNotMatch(html, /name="vacio"|name="ausente"/);
  assert.match(html, /<label for="([^"]+)"[^>]*>Ordenar por<\/label><select id="\1" name="orden"/);
  assert.match(html, /<option value="">Recomendados<\/option>/);
  assert.match(html, /<select id="[^"]+" name="orden" class="field /);
  assert.match(html, /<option value="menor-precio">Menor precio<\/option>/);
  assert.match(html, /<option value="mayor-precio" selected="">Mayor precio<\/option>/);
  assert.match(html, /<noscript>/);
});

test("I3: without an order the control shows Recomendados selected", () => {
  const CatalogSortControl = loadControl();
  const html = renderToStaticMarkup(React.createElement(CatalogSortControl, { basePath: "/mates", params: {}, order: null }));
  assert.match(html, /<option value="" selected="">Recomendados<\/option>/);
  assert.match(html, /action="\/mates"/);
});
