import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';

// CAT-03 (26/11): admin writes refresh the public pages, the sitemap and the tagged suggestion/cart caches; a cache
// failure after a committed write is only a warning.
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const calls=[];let failing=false;
const SECRET='SECRET-INTERNAL-DETAIL';
const nextCache={
 revalidatePath:path=>{if(failing)throw new Error(`${SECRET} ${path}`);calls.push(['path',path]);},
 revalidateTag:(tag,profile)=>{if(failing)throw new Error(SECRET);calls.push(['tag',tag,profile]);},
 unstable_cache:(fn,keys,options)=>{calls.push(['cache',keys,options]);return fn;},
};
function load(file,stubs={},cache=new Map()){
 if(cache.has(file))return cache.get(file);const out={};cache.set(file,out);
 new Function('require','exports',ts.transpileModule(readFileSync(resolve(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{
  if(name==='next/cache')return nextCache;
  if(Object.hasOwn(stubs,name))return stubs[name];
  const candidate=name.startsWith('@/')?name.slice(2):name.startsWith('.')?resolve(root,dirname(file),name):null;
  if(candidate)for(const ext of ['','.ts','.tsx'])if(existsSync(resolve(root,candidate+ext))&&statSync(resolve(root,candidate+ext)).isFile())return load(resolve(root,candidate+ext).slice(root.length+1).replaceAll('\\','/'),stubs,cache);
  return require(name);
 },out);return out;
}
const revalidation=load('lib/catalog/public-catalog-revalidation.ts');
const TAG=revalidation.PUBLIC_CATALOG_CACHE_TAG;
const paths=()=>calls.filter(call=>call[0]==='path').map(call=>call[1]);
const tagCalls=()=>calls.filter(call=>call[0]==='tag');
const warnings=[];const realWarn=console.warn;
const reset=()=>{calls.length=0;warnings.length=0;failing=false;console.warn=(...args)=>warnings.push(args.map(String).join(' '));};
const restore=()=>{console.warn=realWarn;failing=false;};

test('a product save refreshes its pages, sections, sitemap and expires the tagged caches at once',()=>{
 reset();
 revalidation.revalidateProducts('producto',[{productId:'p1',slug:'mate-nuevo',previousSlug:'mate-viejo',categorySlugs:['mates']}]);
 for(const path of ['/','/sitemap.xml','/producto/mate-nuevo','/producto/mate-viejo','/mates','/accesorios','/admin/productos','/admin/productos/p1/editar'])assert.ok(paths().includes(path),path);
 assert.ok(!paths().includes('/perfumes'));
 assert.deepEqual(tagCalls(),[['tag',TAG,{expire:0}]]);
 restore();
});

test('without a known category every public section is refreshed',()=>{
 reset();
 revalidation.revalidateProducts('sincronización',[{slug:'desde-planilla'}]);
 for(const path of ['/perfumes','/mates','/accesorios','/sitemap.xml','/producto/desde-planilla'])assert.ok(paths().includes(path),path);
 assert.ok(!paths().some(path=>path.endsWith('/editar')));
 assert.deepEqual(tagCalls(),[['tag',TAG,{expire:0}]]);
 restore();
});

test('invalidation failures never throw; one warning names the operation and never the internal error',()=>{
 reset();failing=true;
 assert.doesNotThrow(()=>revalidation.revalidateProducts('producto',[{productId:'p1',slug:'mate-nuevo'}]));
 assert.doesNotThrow(()=>revalidation.revalidateAfterWrite('venta',['/admin/ventas'],{publicCatalog:true}));
 assert.equal(warnings.length,2);
 assert.match(warnings[0],/producto/);assert.match(warnings[1],/venta/);
 assert.ok(warnings.every(line=>!line.includes(SECRET)),'no internal error detail in logs');
 restore();
});

test('a store sale already registered is reported as successful even if cache invalidation fails',async()=>{
 reset();failing=true;
 const recorded=[];
 const actions=load('app/admin/ventas/actions.ts',{
  '@/lib/admin-session':{requireAdminActionSession:async()=>({id:'actor'})},
  '@/services/store-sales':{createStoreSale:async request=>{recorded.push(request);return{order_id:'synthetic-order',payment_status:'paid',remaining_amount:0};}},
 });
 const form=new FormData();
 for(const [name,value] of Object.entries({idempotencyKey:'synthetic-key',productId:'product',quantity:'1',unitPrice:'75',paymentMethod:'cash',paymentAmount:'75'}))form.set(name,value);
 const state=await actions.createStoreSaleAction({},form);
 assert.equal(recorded.length,1);
 assert.equal(state.status,'success');assert.equal(state.orderId,'synthetic-order');
 assert.equal(warnings.length,1);assert.ok(!warnings[0].includes(SECRET));
 restore();
});

test('a stock adjustment already saved stays successful when the post-save category lookup or invalidation fails',async()=>{
 reset();failing=true;
 const result=table=>table==='products'
  ?{data:{id:'p1',slug:'mate-stock',status:'active',category_id:'c1',cost:1,cost_source_purchase_item_id:null,historical_identity:false,family_id:null},error:null}
  :{data:null,error:{message:SECRET}};
 const query=table=>{const builder={select:()=>builder,eq:()=>builder,maybeSingle:async()=>result(table)};return builder;};
 const actions=load('app/admin/productos/actions.ts',{
  'server-only':{},
  '@/lib/admin-session':{requireAdminActionSession:async()=>({id:'actor'})},
  '@/lib/supabase/server':{getSupabaseAdminClient:()=>({from:query})},
  '@/services/inventory':{adjustInventoryStock:async()=>({status:'adjusted',previous_stock:1,new_stock:4,movement_id:'m1'})},
 });
 const form=new FormData();for(const [name,value] of Object.entries({productId:'p1',reason:'Conteo',newStock:'4'}))form.set(name,value);
 const state=await actions.updateProductStock({},form);
 assert.equal(state.status,'success');assert.equal(state.newStock,4);
 assert.ok(warnings.every(line=>!line.includes(SECRET)));
 restore();
});

test('suggestion and cart caches carry the public catalog tag and keep their 60 s fallback',()=>{
 reset();
 load('app/api/catalog/suggestions/route.ts',{'@/services/products':{getCatalogPublications:async()=>[]}});
 load('app/api/catalog/cart/route.ts',{'@/services/products':{getCatalogPublications:async()=>[]}});
 const caches=calls.filter(call=>call[0]==='cache');
 assert.equal(caches.length,2);
 for(const [,,options] of caches)assert.deepEqual(options,{tags:[TAG],revalidate:60});
 restore();
});

const importActions=apply=>load('app/admin/productos/importar/actions.ts',{
 '@/lib/admin-session':{requireAdminActionSession:async()=>({id:'admin'})},
 '@/services/product-import':{applyConfirmedProductImportRows:apply},
 '@/lib/supabase/server':{getSupabaseAdminClient:()=>{throw new Error('no database in this test');}},
});
const preview=rows=>{const form=new FormData();form.set('previewPayload',JSON.stringify(rows));return form;};
const importRow=(slug,categorySlug,extra={})=>({rowNumber:2,slug,name:slug,categorySlug,categoryName:categorySlug,canImport:true,excludedFromImport:false,action:'create',rowState:'valid',...extra});
const counts=list=>list.reduce((all,item)=>({...all,[item]:(all[item]??0)+1}),{});

test('confirming an import revalidates the whole batch once: each path and the tag a single time',async()=>{
 reset();
 const {confirmProductImport}=importActions(async()=>({created:2,updated:1,unchanged:0,review:0,omittedErrors:0,omittedDuplicates:0}));
 const state=await confirmProductImport({status:'idle'},preview([importRow('perfume-importado','perfumes'),importRow('mate-importado','mates',{action:'update'}),importRow('termo-importado','mates'),importRow('en-revision','mates',{action:'review'})]));
 assert.equal(state.status,'success');
 for(const path of ['/producto/perfume-importado','/producto/mate-importado','/producto/termo-importado','/perfumes','/mates','/sitemap.xml'])assert.ok(paths().includes(path),path);
 assert.ok(!paths().includes('/producto/en-revision'));
 assert.deepEqual(Object.entries(counts(paths())).filter(([,n])=>n>1),[],'no path revalidated twice');
 assert.equal(tagCalls().length,1);
 restore();
});

test('a failed import still refreshes what may already be written (fail-closed)',async()=>{
 reset();
 const {confirmProductImport}=importActions(async()=>{throw new Error('fila 3 rechazada');});
 const state=await confirmProductImport({status:'idle'},preview([importRow('mate-parcial','mates')]));
 assert.equal(state.status,'error');
 assert.ok(paths().includes('/producto/mate-parcial'));
 assert.equal(tagCalls().length,1);
 restore();
});

test('Google Sheets sync revalidates the products it wrote in one batch',async()=>{
 reset();
 process.env.GOOGLE_SHEETS_SYNC_SECRET='synthetic-secret';
 const route=load('app/api/integrations/google-sheets/product-sync/route.ts',{
  '@/lib/product-import/core':{isSupportedProductSheet:()=>true},
  '@/services/product-import':{syncImportedProductRows:async()=>({created:1,updated:1,unchanged:0,review:0,blocked:0,invalid:1,errors:0,results:[
   {rowNumber:2,slug:'termo-planilla',status:'created',message:''},{rowNumber:3,slug:'perfume-planilla',status:'updated',message:''},{rowNumber:4,slug:'fila-invalida',status:'invalid',message:''}]})},
 });
 const body=JSON.stringify({sheet:'Mates',rows:[{rowNumber:2,row:{Producto:'Termo planilla'}}]});
 const request=()=>new Request('http://localhost/api/integrations/google-sheets/product-sync',{method:'POST',body,headers:{authorization:'Bearer synthetic-secret','content-type':'application/json'}});
 const response=await route.POST(request());
 assert.equal(response.status,200);
 for(const path of ['/producto/termo-planilla','/producto/perfume-planilla','/perfumes','/mates','/accesorios','/sitemap.xml'])assert.ok(paths().includes(path),path);
 assert.ok(!paths().includes('/producto/fila-invalida'));
 assert.deepEqual(Object.entries(counts(paths())).filter(([,n])=>n>1),[]);
 assert.equal(tagCalls().length,1);
 failing=true;
 assert.equal((await route.POST(request())).status,200,'a cache failure does not fail a processed sync');
 delete process.env.GOOGLE_SHEETS_SYNC_SECRET;
 restore();
});

test('the sitemap lists new public products and never caches an empty list after a failed read',async()=>{
 const product=slug=>({slug});
 // Rendered per request: no build-time catalog read (previews have no catalog) and no stale prerendered copy.
 assert.equal(load('app/sitemap.ts',{'@/services/products':{}}).dynamic,'force-dynamic');
 const sitemap=catalog=>load('app/sitemap.ts',{'@/services/products':{getCatalogPublicationsOrThrow:catalog}}).default;
 const urls=(await sitemap(async()=>[product('mate-recien-creado')])()).map(entry=>entry.url);
 assert.ok(urls.some(url=>url.endsWith('/producto/mate-recien-creado')));
 await assert.rejects(sitemap(async()=>{throw new Error('PUBLIC_CATALOG_READ_FAILED');})(),/PUBLIC_CATALOG_READ_FAILED/);
});

test('admin writes invalidate only through the shared, failure-safe helper',()=>{
 for(const file of ['app/admin/productos/actions.ts','app/admin/productos/familias/actions.ts','app/admin/compras/actions.ts','app/admin/pedidos/actions.ts','app/admin/ventas/actions.ts','app/admin/productos/importar/actions.ts','app/api/integrations/google-sheets/product-sync/route.ts']){
  const source=readFileSync(resolve(root,file),'utf8');
  assert.match(source,/public-catalog-revalidation/,file);
  assert.doesNotMatch(source,/from "next\/cache"/,`${file} must not call revalidatePath/revalidateTag directly`);
 }
 for(const file of ['app/admin/productos/familias/actions.ts','app/admin/compras/actions.ts','app/admin/pedidos/actions.ts','app/admin/ventas/actions.ts'])
  assert.match(readFileSync(resolve(root,file),'utf8'),/publicCatalog: true/,`${file} must expire the public catalog caches`);
});
