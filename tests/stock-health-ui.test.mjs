import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderStockPreview} from './fixtures/stock-health-render.mjs';
import {stockFixture} from './fixtures/stock-health-data.mjs';

test('compact cards show five initial rows each with native keyboard-operable expansion',()=>{
  const html=renderStockPreview();
  assert.equal((html.match(/<details class="stockMore">/g)||[]).length,2);
  for(const list of html.split('<ol class="stockList">').slice(1)) assert.equal((list.split('</ol>')[0].match(/<li /g)||[]).length,5);
  assert.equal((html.match(/Ver más productos/g)||[]).length,2);
  assert.ok(html.includes('Mostrar menos'));assert.ok(html.includes('últimos 30 días'));
  assert.ok(html.includes('10/09/2026'));assert.ok(html.includes('10/10/2026'));
  assert.ok(html.includes('Costo sin cargar'));
  assert.ok(html.includes('Necesitás reponer'));assert.ok(html.includes('Revisá estos productos'));
  assert.ok(html.includes('Alcanza para'));assert.ok(html.includes('en mercadería'));
  for(const row of html.matchAll(/<li class="stockRow">([\s\S]*?)<\/li>/g)) assert.equal((row[1].match(/<a /g)||[]).length,1);
  assert.ok(html.includes('<details class="stockDetails"><summary>Cómo se calcula'));
});
test('stock error is explicit and never replaces unavailable metrics with zero',()=>{
  const html=renderStockPreview(null);assert.ok(html.includes('role="alert"'));assert.ok(html.includes('No pudimos consultar'));
  assert.ok(!html.includes('0 productos'));assert.ok(!html.includes('Cargar una compra'));
});
test('an entirely unvalued idle inventory does not claim zero retained capital',()=>{
  const f=stockFixture();f.product('missing',{cost:null});
  const html=renderStockPreview(f.run());assert.ok(html.includes('Sin costos confirmados'));assert.ok(html.includes('1 sin costo, fuera del total'));
});
test('empty blocks explain the result without offering product actions',()=>{
  const html=renderStockPreview(stockFixture().run());
  assert.ok(html.includes('No hay productos que necesiten reposición'));
  assert.ok(html.includes('No hay productos con stock que lleven 60 días'));
  assert.ok(!html.includes('class="stockAction"'));assert.ok(!html.includes('class="stockLink"'));
});
