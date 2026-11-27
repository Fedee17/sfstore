// The monthly summary speaks the owner's language: one vocabulary, no technical jargon, periods kept apart.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync(new URL('../app/admin/analytics/page.tsx', import.meta.url), 'utf8');
const visible = page.replace(/^\s*\/\/.*$/gm, '').replace(/className="[^"]*"/g, '');

test('one vocabulary for sales, money received, pending money, purchases and margin', () => {
  for (const label of ['Ventas confirmadas', 'Por cobrar', 'Cobrado en el mes', 'Margen bruto', 'Compras', 'Cómo se cobró', 'Últimos seis meses', 'Notas sobre los datos']) {
    assert.ok(visible.includes(label), label);
  }
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
