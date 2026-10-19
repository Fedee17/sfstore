import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readVariantMoney,variantAvailability,variantErrorMessage} from '../lib/products/variants.ts';
test('variant money supports cents, explicit zero, comma and unknown optional price',()=>{
 assert.equal(readVariantMoney('100.01'),100.01);assert.equal(readVariantMoney('100,01'),100.01);assert.equal(readVariantMoney('0'),0);assert.equal(readVariantMoney('',true),null);
 for(const v of ['', '-1','1.001','NaN','Infinity','1e5','100000000000'])assert.throws(()=>readVariantMoney(v));
});
test('hidden web is separate from all-channel commercial blocking',()=>{
 assert.match(variantAvailability(false,false),/Sólo mostrador/);assert.match(variantAvailability(true,false),/Web y mostrador/);assert.match(variantAvailability(true,true),/Bloqueado/);
});
test('database failures have useful feedback without internal SQL or credentials',()=>{
 assert.match(variantErrorMessage(new Error('23505 duplicate')),/Ya existe/);assert.match(variantErrorMessage(new Error('VARIANT_STALE_VERSION')),/Recargá/);assert.match(variantErrorMessage(new Error('password=private secret')),/No se guardaron/);
});
