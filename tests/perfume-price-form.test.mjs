import assert from 'node:assert/strict';
import {test}from 'node:test';
import {pricingFormHarness}from './fixtures/component-gallery-render.mjs';

test('existing perfume editor never recalculates on open and recalculates the 40% policy whenever the cost changes',()=>{
 // The cash field opens with the price the store charges: 75% of list while the stored value is not approved.
 const h=pricingFormHarness();assert.equal(h.input('price').props.value,'21999');assert.equal(h.input('transferPrice').props.value,'16499.25');
 assert.equal(pricingFormHarness({approved:true}).input('transferPrice').props.value,'16500');
 // Owner decision 27/11/2026: a new perfume cost moves its prices to cost + 40% (cash rounded up to $1.000, list = cash x 4/3).
 h.change('cost','20000');assert.equal(h.input('price').props.value,'37333.33');assert.equal(h.input('transferPrice').props.value,'28000.00');assert.equal(h.input('perfumePricePolicy').props.value,'applied');
 h.change('cost','30000');assert.equal(h.input('price').props.value,'56000.00');assert.equal(h.input('transferPrice').props.value,'42000.00');assert.equal(h.input('perfumePricePolicy').props.value,'applied');
 // An incomplete or invalid cost keeps the last prices and never saves them as the policy.
 for(const value of ['','0','1.001']){h.change('cost',value);assert.equal(h.input('price').props.value,'56000.00');assert.equal(h.input('perfumePricePolicy').props.value,'manual');}
 assert.equal(h.button('Calcular precio sugerido (+40%)').props.disabled,true,'no policy without a valid cost');
});

test('outside full perfumes a cost change never touches the prices',()=>{
 for(const options of [{type:'Decant'},{category:'mates'}]){const h=pricingFormHarness(options);const price=h.input('price').props.value,cash=h.input('transferPrice').props.value;h.change('cost','20000');assert.equal(h.input('price').props.value,price);assert.equal(h.input('transferPrice').props.value,cash);}
});

test('manual list/special edits preserve exceptions and clear the applied-policy flag',()=>{
 const h=pricingFormHarness();h.click('Calcular precio sugerido (+40%)');h.change('price','19999');assert.equal(h.input('perfumePricePolicy').props.value,'manual');assert.equal(h.input('price').props.value,'19999');
 h.change('transferPrice','17000');assert.equal(h.input('price').props.value,'19999');
});

test('the existing editor excludes decants, other categories and family SKUs and disables invalid costs',()=>{
 for(const options of [{type:'Decant'},{category:'mates'},{category:'accesorios'},{family:true}])assert.equal(pricingFormHarness(options).button('Calcular precio sugerido (+40%)'),undefined);
 const h=pricingFormHarness();for(const value of ['','0','-1','1.001']){h.change('cost',value);assert.equal(h.button('Calcular precio sugerido (+40%)').props.disabled,true);}
});
