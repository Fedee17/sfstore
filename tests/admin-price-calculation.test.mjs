import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as money from '../lib/products/admin-price-calculation.ts';
import { getWebTransferPrice, getWebTransferSubtotal } from '../lib/web-transfer-pricing.ts';
import * as policy from '../lib/products/admin-product-policy.ts';
import * as yaraPolicy from '../lib/products/yara-rosa-consolidation.ts';
import { ProductSaveError } from '../lib/products/atomic-save.ts';

test('exact cent conversion preserves approved special amounts and quantities', () => {
  for(const [special,list] of [['16500','22000.00'],['11850','15800.00'],['23000','30666.67'],['0.01','0.01'],['0.02','0.03']]){
    const result=money.calculateListFromSpecial(special);
    assert.equal(result.listText,list);assert.equal(getWebTransferPrice(result.list),Number(special));
    assert.equal(getWebTransferSubtotal([{price:result.list,quantity:3}]),Math.round(Number(special)*100)*3/100);
  }
  for(let cents=1;cents<=100000;cents++){
    const result=money.calculateListFromSpecial((cents/100).toFixed(2));
    assert.equal(Math.round(getWebTransferPrice(result.list)*100),cents);
  }
});
test('strict monetary validation rejects invalid precision, signs, exponents and overflow',()=>{
  for(const value of ['', '-1', 'NaN','Infinity','1e3','1.001','1,234.56','10000000000'])assert.throws(()=>money.parseAdminMoneyCents(value));
  assert.equal(money.parseAdminMoneyCents('12,30'),BigInt(1230));
  assert.equal(money.parseAdminMoneyCents('9999999999.99'),BigInt('999999999999'));
  assert.throws(()=>money.calculateListFromSpecial('0'));
  assert.throws(()=>money.calculateListFromSpecial('9999999999.99'));
});
test('cost suggestion rounds half up independently and is never used to overwrite the special',()=>{
  assert.equal(money.suggestSpecialFromCost(''),null);
  assert.equal(money.suggestSpecialFromCost('10000'),'15000.00');
  assert.equal(money.suggestSpecialFromCost('0.01'),'0.02');
  assert.equal(money.suggestSpecialFromCost('0.03'),'0.05');
  assert.throws(()=>money.suggestSpecialFromCost('-1'));
});
test('server calculation verification rejects a tampered or missing special/list pair',()=>{
  money.assertCalculatedListPrice(30666.67,23000);
  assert.throws(()=>money.assertCalculatedListPrice(30666.66,23000));
  assert.throws(()=>money.assertCalculatedListPrice(100,null));
});

function serverFixture(options={}){
  const plans=[],requests=[];
  const existing={id:'00000000-0000-4000-8000-000000000001',slug:'prueba',status:'active',category_id:'00000000-0000-4000-8000-000000000002',cost:10000,cost_source_purchase_item_id:null,historical_identity:false,family_id:options.family?'family':null};
  const client={from(table){return {select(){return this},eq(){return this},async maybeSingle(){return {data:table==='categories'?{name:'Perfumes',slug:'perfumes'}:table==='products'?existing:null,error:null}}}}};
  const mocks={
    '@/lib/products/admin-price-calculation':money,
    '@/lib/products/admin-product-policy':policy,
    '@/lib/products/yara-rosa-consolidation':yaraPolicy,
    '@/lib/products/atomic-save':{ProductSaveError},
    '@/lib/admin-session':{requireAdminActionSession:async()=>{}},
    '@/lib/supabase/server':{getSupabaseAdminClient:()=>client},
    '@/lib/uploads/limits':{assertUploadFormData:()=>{}},
    '@/lib/products/slug':{slugifyProductValue:v=>v},
    '@/lib/catalog/attribute-config':{getAttributeFieldsForCategory:()=>[]},
    '@/lib/product-taxonomy':{PRODUCT_ATTRIBUTE_NAMES:{brand:'Marca',type:'Tipo'}},
    '@/lib/products/auto-descriptions':{getAutoDescriptions:()=>({}),applyAutoDescriptionFallbacks:p=>p},
    'next/cache':{revalidatePath:()=>{}},
    '@/services/product-save':{
      fingerprintProductSubmission:async()=> 'hash',
      createProductSaveService:request=>{requests.push(request);return {
        version:async()=> options.stale?'b'.repeat(64):'a'.repeat(64),
        buildImages:async()=>({images:null,uploads:[]}),
        save:async build=>{const plan=await build();plans.push(plan);return {plan,result:{version:'c'.repeat(64),product:{id:request.productId,...plan.payload.product,updated_at:'synthetic'}}}}
      }}
    }
  };
  const code=ts.transpileModule(readFileSync(new URL('../app/admin/productos/actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const actions={};new Function('require','exports',code)(id=>mocks[id]??{},actions);
  const form=({price='21999',special='16500',cost='10000',applied=false}={})=>{
    const f=new FormData();for(const [key,value]of Object.entries({productId:existing.id,categoryId:existing.category_id,name:'Prueba',slug:'prueba',shortDescription:'Prueba',description:'Prueba',status:'active',price,transferPrice:special,cost,operationKey:'00000000-0000-4000-8000-000000000003',expectedVersion:'a'.repeat(64),listPriceCalculation:applied?'applied':'manual'}))f.set(key,value);return f;
  };
  return {actions,plans,requests,form};
}
test('actual server create/update actions validate the applied pair before the existing atomic save',async()=>{
  for(const action of ['createProduct','updateProduct']){
    const f=serverFixture();const r=await f.actions[action]({},f.form({price:'30666.67',special:'23000',applied:true}));
    assert.equal(r.status,'success',JSON.stringify(r));assert.equal(f.plans.length,1);
    assert.equal(f.plans[0].payload.product.price,30666.67);assert.equal(f.plans[0].payload.product.transfer_price,23000);
    assert.equal(f.plans[0].payload.product.cost,10000);
    assert.equal(f.requests[0].expectedVersion,action==='updateProduct'?'a'.repeat(64):null);
  }
});
test('actual server preserves manual exceptions and prices when saving unrelated or cost-only edits',async()=>{
  const f=serverFixture();const r=await f.actions.updateProduct({},f.form({cost:'20000'}));
  assert.equal(r.status,'success',JSON.stringify(r));assert.equal(f.plans[0].payload.product.price,21999);assert.equal(f.plans[0].payload.product.transfer_price,16500);assert.equal(f.plans[0].payload.product.cost,20000);
});
test('actual server rejects malformed money and calculation tampering before a save is prepared',async()=>{
  for(const input of [{price:'1.001'},{special:'NaN'},{cost:'-1'},{price:'30666.66',special:'23000',applied:true}]){
    const f=serverFixture();assert.equal((await f.actions.updateProduct({},f.form(input))).status,'error');assert.equal(f.plans.length,0);assert.equal(f.requests.length,0);
  }
});
test('stale edits and attempts to calculate a family SKU do not commit a save plan',async()=>{
  for(const options of [{stale:true},{family:true}]){
    const f=serverFixture(options);const r=await f.actions.updateProduct({},f.form({price:'22000',special:'16500',applied:true}));assert.equal(r.status,'error');assert.match(r.message,options.stale?/cambio/:/familia/);assert.equal(f.plans.length,0);
  }
});
