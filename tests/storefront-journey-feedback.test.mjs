import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {publicProductName} from '../lib/catalog/product-presentation.ts';
import {checkoutErrorMessage,checkoutConnectionError} from '../lib/checkout/feedback.ts';
import * as prices from '../lib/web-transfer-pricing.ts';
import * as pricing from '../lib/pricing.ts';

test('display copy corrects reviewed uppercase words without changing SKU, brand acronyms or unrelated names',()=>{
 for(const [raw,display] of [['CDN MALEKA','CDN Maleka'],['9AM POUR FEMME','9AM Pour Femme'],['Grabado BOCA JUNIORS','Grabado Boca Juniors'],['RIVER PLATE','River Plate'],['USB-C · EDP · ST-MSYS-1L-NEG','USB-C · EDP · ST-MSYS-1L-NEG']]) assert.equal(publicProductName(raw),display);
});
test('catalog copy preserves model codes and capacities while removing excessive uppercase',()=>{
 for(const [raw,display] of [
  ['HOMME BLACK 100ML','Homme Black 100 ml'],
  ['RASSASI HAWAS FOR HIM','Rassasi Hawas For Him'],
  ['CABLE USB-C CARGA RAPIDA','Cable USB-C Carga Rápida'],
  ['SKU-DE-GOLD-100ML · 9AM · GOAT · EDP','SKU-DE-GOLD-100ML · 9AM · GOAT · EDP'],
 ]) assert.equal(publicProductName(raw),display);
});

test('checkout messages explain recovery and never echo an unknown server diagnostic',()=>{
 assert.match(checkoutErrorMessage('CHECKOUT_STOCK_INSUFFICIENT'),/carrito.*cantidades/);
 assert.match(checkoutErrorMessage('CHECKOUT_SHIPPING_QUOTE_CHANGED'),/cotización.*No transfieras/);
 assert.match(checkoutErrorMessage('CHECKOUT_UNAUTHORIZED'),/sesión.*carrito se conserva/);
 assert.match(checkoutConnectionError,/conexión.*carrito se conserva/);
 assert.doesNotMatch(checkoutErrorMessage('secret-diagnostic'),/secret-diagnostic/);
 assert.equal(checkoutErrorMessage('__proto__'),checkoutErrorMessage(null));
});
test('contextual WhatsApp includes actual variant and SKU without mutating the product',()=>{
 const source=readFileSync(new URL('../lib/whatsapp.ts',import.meta.url),'utf8'),exports={};
 const modules={'@/lib/brand':{brand:{whatsapp:'000'}},'@/lib/web-transfer-pricing':prices,'@/lib/pricing':pricing};
 new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>modules[n],exports);
 const p={name:'Termo de prueba',price:100,stock:0,category:'mates',variantOptions:{Color:'Negro'},sku:'SYNTHETIC-NEG'};
 const before=structuredClone(p),message=exports.buildProductWhatsAppMessage(p);
 assert.match(message,/Termo de prueba/);assert.match(message,/Color: Negro/);assert.match(message,/SKU: SYNTHETIC-NEG/);
 assert.equal(decodeURIComponent(exports.getProductWhatsAppLink(p).split('?text=')[1]),message);assert.deepEqual(p,before);
});
