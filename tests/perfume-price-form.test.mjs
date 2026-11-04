import assert from 'node:assert/strict';
import {test}from 'node:test';
import {pricingFormHarness}from './fixtures/component-gallery-render.mjs';

test('existing editor never recalculates on open or cost-only edits and applies the policy only on click',()=>{
 const h=pricingFormHarness();assert.equal(h.input('price').props.value,'21999');assert.equal(h.input('transferPrice').props.value,'16500');
 h.change('cost','20000');assert.equal(h.input('price').props.value,'21999');assert.equal(h.input('transferPrice').props.value,'16500');
 h.click('Calcular precio sugerido (+40%)');assert.equal(h.input('price').props.value,'37333.33');assert.equal(h.input('transferPrice').props.value,'28000.00');assert.equal(h.input('perfumePricePolicy').props.value,'applied');
 h.change('cost','30000');assert.equal(h.input('price').props.value,'37333.33');assert.equal(h.input('transferPrice').props.value,'28000.00');assert.equal(h.input('perfumePricePolicy').props.value,'manual');
});

test('manual list/special edits preserve exceptions and clear the applied-policy flag',()=>{
 const h=pricingFormHarness();h.click('Calcular precio sugerido (+40%)');h.change('price','19999');assert.equal(h.input('perfumePricePolicy').props.value,'manual');assert.equal(h.input('price').props.value,'19999');
 h.change('transferPrice','17000');assert.equal(h.input('price').props.value,'19999');
});

test('the existing editor excludes decants, other categories and family SKUs and disables invalid costs',()=>{
 for(const options of [{type:'Decant'},{category:'mates'},{category:'accesorios'},{family:true}])assert.equal(pricingFormHarness(options).button('Calcular precio sugerido (+40%)'),undefined);
 const h=pricingFormHarness();for(const value of ['','0','-1','1.001']){h.change('cost',value);assert.equal(h.button('Calcular precio sugerido (+40%)').props.disabled,true);}
});
