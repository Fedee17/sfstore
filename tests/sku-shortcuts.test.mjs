import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('quick consultation card links every SKU to its stock adjustment and movements',()=>{
  const card=source('components/admin/consulta/consultation-product-card.tsx');
  assert.match(card,/import \{ stockAdjustmentHref \} from "@\/lib\/admin\/catalog-review";/);
  assert.match(card,/href=\{stockAdjustmentHref\(product\)\}[\s\S]*?Ajustar stock/);
  assert.match(card,/href=\{`\/admin\/inventario\?view=movements&product=\$\{encodeURIComponent\(product\.id\)\}`\}[\s\S]*?Ver movimientos/);
});

test('heatmap footer uses singular and plural correctly',()=>{
  const page=source('components/admin/analytics/sales-heatmap-view.tsx');
  assert.match(page,/\{salesCount\(data\.totalSales\)\} con hora registrada/);
  assert.match(page,/const salesCount = \(count: number\) => `\$\{count\} \$\{count === 1 \? "venta" : "ventas"\}`;/);
  assert.match(page,/data\.skippedLateEntry === 1 \? "1 venta cargada otro día queda fuera/);
  assert.match(page,/data\.skippedHistorical === 1 \? "1 venta histórica importada no tiene"/);
});
