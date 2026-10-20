import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { planChargerComponents } from "../lib/purchases/charger-components.ts";

// Fully synthetic identities; representative amounts, no Production access.
const acquisition = () => ({
  id: "synthetic-purchase", status: "confirmed", total_units: 29,
  shipping_cost: "17000.00", supplier_subtotal: "240131.50", total_cost: "257131.50",
  purchase_items: [
    { id: "sets", product_id: "synthetic-sets", product_name_snapshot: "Cargadores sintéticos", quantity: 20, unit_purchase_cost: "5957.00", supplier_line_total: "119140.00", allocated_shipping_total: "11724.14", effective_line_total: "130864.14", effective_unit_cost: "6543.21" },
    { id: "other", product_id: "synthetic-other", product_name_snapshot: "Vapers sintéticos", quantity: 9, unit_purchase_cost: "13443.50", supplier_line_total: "120991.50", allocated_shipping_total: "5275.86", effective_line_total: "126267.36", effective_unit_cost: "14029.71" },
  ],
});
const plan = () => planChargerComponents(acquisition(), "sets");
test("supplier allocation is 50/50, both cable connectors have equal unit supplier cost", () => {
  const p = plan();
  assert.deepEqual(p.lines.map(l => [l.key, l.quantity, l.supplier]), [
    ["head", 20, 5957000], ["cable-c-c", 10, 2978500], ["cable-c-lightning", 10, 2978500], ["other", 9, 12099150],
  ]);
  assert.equal(p.lines[0].supplier, p.lines[1].supplier + p.lines[2].supplier);
});
test("49 physical pieces receive shipping once, with deterministic remainder cents", () => {
  const p = plan();
  assert.equal(p.physicalPieces, 49);
  assert.deepEqual(p.lines.map(l => l.shipping), [693877, 346939, 346939, 312245]);
  assert.equal(p.lines.reduce((s,l) => s+l.shipping, 0), 1700000);
});
test("shipping reclassification balances both sides without changing acquisition total", () => {
  const p = plan();
  assert.equal(p.componentReclassification, 215341); assert.equal(p.otherReclassification, -215341);
  assert.equal(p.componentTotal, 13301755); assert.equal(p.otherTotal, 12411395);
  assert.equal(p.componentTotal+p.otherTotal, 25713150);
});
test("rounding is explicit by lot, never invented shipping, price or missing cost", () => {
  const p = plan();
  assert.deepEqual(p.lines.map(l => l.unit), [332544,332544,332544,1379044]);
  assert.deepEqual(p.lines.map(l => l.residual), [-3,-1,-1,-1]);
  assert.equal(p.unitResidual, -6); assert.equal(p.originalUnitResidual, -9);
  assert.equal(p.lines.filter(l=>l.key!=="other").reduce((s,l)=>s+l.residual,0),-5);
  assert.equal(p.salePricesApproved, false);
});
test("proposal preserves frozen original purchase and has no stock application", () => {
  const p = acquisition(); p.purchase_items.forEach(Object.freeze);Object.freeze(p.purchase_items);Object.freeze(p);
  const before=JSON.stringify(p); const r=planChargerComponents(p,"sets");
  assert.equal(JSON.stringify(p),before);
  assert.deepEqual(r.stockProposal,{sourceSetsToConsume:20,headsToAdd:20,cableCCToAdd:10,cableLightningToAdd:10,otherUnitsToChange:0});
});
test("repeated preview and input reordering keep the same auditable fingerprint", () => {
  const p=acquisition(); const first=planChargerComponents(p,"sets");p.purchase_items.reverse();
  assert.equal(planChargerComponents(p,"sets").fingerprint,first.fingerprint);
  p.purchase_items[0].product_id="another-synthetic-other";
  assert.notEqual(planChargerComponents(p,"sets").fingerprint,first.fingerprint);
});
for (const status of ["draft","cancelled"]) test(`reject ${status} purchase`, () => {
  assert.throws(()=>planChargerComponents({...acquisition(),status},"sets"),/compra confirmada/);
});
test("reject missing/incorrect source, duplicate SKU, incomplete lines and unapproved quantities", () => {
  assert.throws(()=>planChargerComponents(acquisition(),"missing"));
  assert.throws(()=>planChargerComponents(acquisition(),"other"));
  const a=acquisition();a.purchase_items[1].product_id=a.purchase_items[0].product_id;assert.throws(()=>planChargerComponents(a,"sets"));
  assert.throws(()=>planChargerComponents({...acquisition(),purchase_items:acquisition().purchase_items.slice(0,1)},"sets"));
  assert.throws(()=>planChargerComponents({...acquisition(),total_units:49},"sets"));
  const unrelated=acquisition();unrelated.purchase_items[1].product_name_snapshot="Otro artículo";
  assert.throws(()=>planChargerComponents(unrelated,"sets"));
});
for (const field of ["shipping_cost","supplier_subtotal","total_cost"]) test(`stop on mismatch in ${field}`,()=>{
  const a=acquisition();a[field]="0.00";assert.throws(()=>planChargerComponents(a,"sets"),/reconcilian/);
});
for (const field of ["supplier_line_total","effective_line_total","effective_unit_cost","allocated_shipping_total"]) test(`stop on mismatch in original ${field}`,()=>{
  const a=acquisition();a.purchase_items[0][field]="0.00";assert.throws(()=>planChargerComponents(a,"sets"),/reconcilian/);
});
test("same supplier split can contain half cents; conservation uses line totals",()=>{
  const a=acquisition();a.purchase_items[0].unit_purchase_cost="5957.01";a.purchase_items[0].supplier_line_total="119140.20";a.purchase_items[0].effective_line_total="130864.34";a.purchase_items[0].effective_unit_cost="6543.22";a.supplier_subtotal="240131.70";a.total_cost="257131.70";
  const p=planChargerComponents(a,"sets");assert.equal(p.lines[0].supplier,5957010);assert.equal(p.lines[1].supplier,2978505);
  assert.equal(p.lines.reduce((s,l)=>s+l.total,0),25713170);
});
const require=createRequire(import.meta.url);
const source=readFileSync(new URL("../components/admin/purchases/charger-components-preview.tsx",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText.replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href));
const {ChargerComponentsPreview}=await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
test("preview shows pending prices, reclassification and residuals, with no apply control",()=>{
  const html=renderToStaticMarkup(React.createElement(ChargerComponentsPreview,{plan:plan()}));
  for(const text of ["Precios de venta pendientes", "49", "257.131,50", "Reclasificación propuesta", "Residual a conservar", "21 unidades"])assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/<form|<button|<input/);
});
test("page enforces admin session before purchase reads and does not expose mutations",()=>{
  const page=readFileSync(new URL("../app/admin/compras/[id]/componentes/page.tsx",import.meta.url),"utf8");
  assert.ok(page.indexOf("await requireAdminSession()")<page.indexOf('await assertCurrentCommercialOperation("purchases", id)'));
  assert.doesNotMatch(page,/\.rpc\(|\.insert\(|\.update\(|\.delete\(|use server|formAction/);
});
const moduleUrl=s=>`data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const pageSource=readFileSync(new URL("../app/admin/compras/[id]/componentes/page.tsx",import.meta.url),"utf8");
const pageJs=ts.transpileModule(pageSource,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText
  .replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href))
  .replace('"next/link"',JSON.stringify(moduleUrl(`import React from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};export default function Link({children,...p}){return React.createElement('a',p,children)}`)))
  .replace('"@/components/admin/admin-nav"',JSON.stringify(moduleUrl("export function AdminNav(){return null}")))
  .replace('"@/components/admin/purchases/charger-components-preview"',JSON.stringify(moduleUrl(js)))
  .replace('"@/lib/admin-session"',JSON.stringify(moduleUrl("export async function requireAdminSession(){if(!globalThis.__componentAdmin)throw new Error('denied')}")))
  .replace('"@/lib/purchases/charger-components"',JSON.stringify(new URL("../lib/purchases/charger-components.ts",import.meta.url).href))
  .replace('"@/services/commercial-history-guards"',JSON.stringify(moduleUrl("export async function assertCurrentCommercialOperation(){globalThis.__componentReads++;if(globalThis.__componentHistorical)throw new Error('historical')}")))
  .replace('"@/services/purchases"',JSON.stringify(moduleUrl("export async function getPurchaseById(){globalThis.__componentReads++;return globalThis.__componentPurchase}")));
const {default:Page}=await import(moduleUrl(pageJs));
const args=()=>({params:Promise.resolve({id:"10000000-0000-4000-8000-000000000001"}),searchParams:Promise.resolve({line:"20000000-0000-4000-8000-000000000001"})});
test("actual page refuses an unauthorized session before invoking readers",async()=>{
  globalThis.__componentAdmin=false;globalThis.__componentReads=0;
  await assert.rejects(Page(args()),/denied/);assert.equal(globalThis.__componentReads,0);
});
test("actual page renders a read-only proposal and reports historical/inconsistent reads as errors",async()=>{
  globalThis.__componentAdmin=true;globalThis.__componentHistorical=false;globalThis.__componentReads=0;
  const a=acquisition();a.id="10000000-0000-4000-8000-000000000001";a.purchase_items[0].id="20000000-0000-4000-8000-000000000001";globalThis.__componentPurchase=a;
  const before=JSON.stringify(a);const html=renderToStaticMarkup(await Page(args()));
  assert.match(html,/257\.131,50/);assert.match(html,/Simulación de solo lectura/);assert.equal(JSON.stringify(a),before);
  globalThis.__componentHistorical=true;const error=renderToStaticMarkup(await Page(args()));
  assert.match(error,/role="alert"/);assert.doesNotMatch(error,/Huella de la propuesta/);
  globalThis.__componentHistorical=false;globalThis.__componentPurchase={...a,total_cost:"1.00"};
  assert.match(renderToStaticMarkup(await Page(args())),/No se pudo conciliar/);
});
