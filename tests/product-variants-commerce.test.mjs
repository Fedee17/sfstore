import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as componentCombos from '../lib/products/component-combos.ts';
import {groupPublicProducts,publicationAvailable} from '../lib/products/public-families.ts';
import {buildCommercialAnalytics} from '../lib/commercial-reporting/analytics.ts';
const simple={id:'simple',name:'Simple',slug:'simple',category:'mates',price:100,stock:2,featured:false,shortDescription:'Synthetic',imagePlaceholder:'SY'};
const black={...simple,id:'black',name:'Family — Color: Negro',sku:'BLACK',kind:'variant',familyId:'family',familyName:'Family',familySlug:'family',variantLabel:'Color: Negro',variantOptions:{Color:'Negro'}};
const green={...black,id:'green',name:'Family — Color: Verde',sku:'GREEN',price:120,variantLabel:'Color: Verde',variantOptions:{Color:'Verde'}};
test('one publication per family, never a second inventory counter; simple product unchanged',()=>{
 const before=JSON.stringify([simple,black,green]);const rows=groupPublicProducts([simple,black,green]);assert.equal(rows.length,2);assert.deepEqual(rows.find(p=>p.id==='simple'),simple);
 const f=rows.find(p=>p.id==='family');assert.equal(f.kind,'family');assert.equal(f.stock,0);assert.equal(f.price,100);assert.equal(f.variants.length,2);assert.equal(publicationAvailable(f),true);assert.equal(JSON.stringify([simple,black,green]),before);
});
test('price from available SKU, sold-out family remains nonbuyable and no variant is silently selected',()=>{
 let [f]=groupPublicProducts([{...black,stock:0},green]);assert.equal(f.price,120);assert.equal(f.id,'family');assert.equal(f.variantOptions,undefined);
 [f]=groupPublicProducts([{...black,stock:0},{...green,stock:0}]);assert.equal(publicationAvailable(f),false);
});
function cartWithLegacy(){
 const storage=new Map([['sfstore-cart',JSON.stringify({version:0,state:{items:[{productId:'old-simple',name:'Old',slug:'old',category:'mates',price:100,stock:2,quantity:1}],subtotal:1,totalItems:999}})]]);
 const exports={},require=createRequire(import.meta.url),code=ts.transpileModule(readFileSync(new URL('../store/cart-store.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports','localStorage',code)(id=>id==='@/lib/products/component-combos'?componentCombos:require(id),exports,{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)});
 return exports.useCartStore;
}
test('legacy cart rehydrates without inventing variants; SKU remain distinct and parent cannot be added',async()=>{
 const store=cartWithLegacy();await store.persist.rehydrate();assert.equal(store.getState().items[0].productId,'old-simple');assert.equal(store.getState().subtotal,100);assert.equal(store.getState().totalItems,1);
 store.getState().addItem(groupPublicProducts([black,green])[0]);assert.equal(store.getState().items.length,1);
 store.getState().addItem(black);store.getState().addItem(green);assert.equal(store.getState().items.length,3);assert.equal(store.getState().items.find(p=>p.productId==='green').sku,'GREEN');
 store.getState().addItem({...black,price:110,stock:1,name:'Refreshed'});const line=store.getState().items.find(p=>p.productId==='black');assert.equal(line.price,110);assert.equal(line.quantity,1);assert.equal(line.name,'Refreshed');
});
test('monthly family/variant rankings aggregate snapshots once, leaving undocumented old lines unclassified',()=>{
 const input={orders:[{id:'order',channel:'store',status:'completed',payment_status:'paid',historical_import:false,historical_occurred_on:null,affects_inventory:true,created_at:'2026-10-18T15:00:00Z',subtotal:300,discount:75,shipping_cost:0,total:225,cost_snapshot_policy:null}],
  saleLines:[['black','Negro',true],['green','Verde',true],['black','Old',false]].map(([p,label,known],i)=>({id:'line'+i,order_id:'order',product_id:p,product_name:label,category_name:'Mates',quantity:1,unit_price:75,subtotal:75,list_unit_price_snapshot:100,unit_cost_snapshot:null,...(known?{family_id_snapshot:'family',family_name_snapshot:'Family',variant_options_snapshot:{Color:label}}:{})})),
  payments:[{id:'pay',order_id:'order',method:'cash',store_payment_method:'cash',status:'approved',amount:225,paid_at:'2026-10-18T15:01:00Z'}],purchases:[],purchaseLines:[],provenance:[],products:[],batches:[]};
 const policy={version:'synthetic',excludedOrderIds:[],excludedPurchaseIds:[],excludedProductIds:[],excludedCategoryIds:[],exclusionCoverage:'reviewed_complete',sourceBatches:[],imputedPurchases:[]};
 const before=JSON.stringify(input),a=buildCommercialAnalytics(input,'2026-10',policy,new Date('2026-11-01T15:00:00Z'));
 assert.equal(a.counts.confirmed,1);assert.equal(a.report.totals.confirmedSalesCents,22500);assert.equal(a.report.totals.datedReceiptsCents,22500);
 assert.equal(a.products.find(r=>r.key==='variant:black').quantity,1);assert.equal(a.products.find(r=>r.key==='black').quantity,1);assert.equal(a.families.find(r=>r.key==='family:family').quantity,2);assert.equal(a.families.find(r=>r.key==='unclassified:black').quantity,1);assert.equal(a.margin.grossMarginCents,null);assert.equal(JSON.stringify(input),before);
});
