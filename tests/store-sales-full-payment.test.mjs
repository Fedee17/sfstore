import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateStoreSalePricing, STORE_SALE_PAYMENT_METHODS } from '../lib/store-sales.ts';

for (const methods of [['cash'],['transfer'],['cash','transfer']]) {
  test(`100 -> 75 for ${methods.join('+')}`, () => {
    const p=calculateStoreSalePricing([{price:100,quantity:2}],methods);
    assert.equal(p.subtotal,200);assert.equal(p.discount,50);assert.equal(p.total,150);
  });
}
for (const method of ['debit','credit','qr','other']) {
  test(`any ${method} makes the entire multi-product sale list price`, () => {
    const p=calculateStoreSalePricing([{price:100,quantity:2},{price:50,quantity:1}],['cash','transfer',method]);
    assert.equal(p.subtotal,250);assert.equal(p.discount,0);assert.equal(p.total,250);
  });
}
test('cent rounding is per unit and matches PostgreSQL positive numeric rounding',()=>{
  const p=calculateStoreSalePricing([{price:100.01,quantity:3},{price:0.02,quantity:1}],['cash']);
  assert.deepEqual(p.items,[{unitPrice:75.01,subtotal:225.03},{unitPrice:0.02,subtotal:0.02}]);
  assert.equal(p.subtotal,300.05);assert.equal(p.total,225.05);assert.equal(p.discount,75);
});
test('stored inconsistent transfer prices do not participate',()=>{
  const p=calculateStoreSalePricing([{price:100,transfer_price:1,quantity:1}],['transfer']);
  assert.equal(p.total,75);
});
test('unsupported or absent means of payment never authorize discount',()=>{
  assert.equal(calculateStoreSalePricing([{price:100,quantity:1}],[]).total,100);
  assert.equal(calculateStoreSalePricing([{price:100,quantity:1}],['invented']).total,100);
  assert.deepEqual([...STORE_SALE_PAYMENT_METHODS],['cash','transfer','debit','credit','qr','other']);
});
test('invalid prices, fractional quantities and overflow fail',()=>{
  for (const line of [{price:0,quantity:1},{price:NaN,quantity:1},{price:100,quantity:1.5},{price:100,quantity:0},{price:9999999999.99,quantity:2}]) {
    assert.throws(()=>calculateStoreSalePricing([line],['cash']));
  }
});
