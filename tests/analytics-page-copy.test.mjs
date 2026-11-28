// The monthly summary speaks the owner's language: one vocabulary, no technical jargon, periods kept apart.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync(new URL('../app/admin/analytics/page.tsx', import.meta.url), 'utf8');
const visible = page.replace(/^\s*\/\/.*$/gm, '').replace(/className="[^"]*"/g, '');

test('a sale is a sale only once paid: no «ventas confirmadas», «por cobrar» or money-in-the-month mixing', () => {
  for (const label of ['"Ventas"', 'Margen bruto', 'Compras', 'Cómo se pagaron las ventas', 'Últimos seis meses', 'Notas sobre los datos', 'pedidos sin pagar', 'No cuentan como venta hasta que se paguen']) {
    assert.ok(visible.includes(label), label);
  }
  for (const gone of ['Ventas confirmadas', 'Por cobrar', 'Cobrado en el mes', 'de ventas de otros meses', 'cashIn']) assert.ok(!visible.includes(gone), gone);
});

test('six months and what sold are interactive charts, each with its values as text', () => {
  assert.match(page, /<TrendChart /);
  assert.match(page, /Ver como tabla/);
  assert.ok(page.includes('<SalesBreakdownChart views={views} />'));
  const trend = readFileSync(new URL('../components/admin/analytics/trend-chart.tsx', import.meta.url), 'utf8');
  for (const hook of ['onPointerEnter', 'onFocus', 'tabIndex={0}', 'router.push']) assert.ok(trend.includes(hook), hook);
  const breakdown = readFileSync(new URL('../components/admin/analytics/sales-breakdown-chart.tsx', import.meta.url), 'utf8');
  for (const label of ['Productos', 'Categorías', 'Canales', 'Facturación']) assert.ok(page.includes(label) || breakdown.includes(label), label);
});

test('rotation is three plain groups, never ABC letters mixed in one table', () => {
  for (const label of ['Los que más venden', 'Venden poco', 'Con stock y sin ventas', 'Parte del total', 'Mercadería parada']) assert.ok(visible.includes(label), label);
  assert.doesNotMatch(visible, /concentran la facturación|% acumulado|baja rotación|"Clase"/);
});

test('no technical jargon or English reaches the screen', () => {
  for (const jargon of [/snapshot/i, /Analytics</, /America\/Argentina/, /registros/, /[^e]conciliad|conciliar/i, /imputad/i, /ensayos/i, /instantánea/i, /procedencia/i, /Facturación comercial/]) {
    assert.doesNotMatch(visible, jargon, String(jargon));
  }
});

test('the last-days blocks are grouped apart from the chosen month', () => {
  const recent = page.indexOf('Últimos días');
  assert.ok(recent > page.indexOf('<Dashboard'), 'after the monthly dashboard');
  for (const block of ['<Rotation', '<Heatmap', '<SearchDemand />']) assert.ok(page.indexOf(block) > recent, block);
  assert.match(page, /No cambian con el mes elegido arriba/);
});

test('an open month says so and is compared with the same days', () => {
  assert.match(page, /Mes en curso · hasta el/);
  assert.match(page, /Del 1 al \$\{c\.throughDay\} de cada mes/);
});
