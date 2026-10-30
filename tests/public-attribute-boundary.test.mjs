import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createRequire} from 'node:module';
import {before,after,describe,test} from 'node:test';
import {Client} from 'pg';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const root=resolve(import.meta.dirname,'..'),migration='supabase/migrations/202610300001_public_attribute_boundary.sql';
const read=f=>readFileSync(join(root,f),'utf8');
const require=createRequire(import.meta.url);
function load(file,stubs={},cache=new Map()){
 if(cache.has(file))return cache.get(file);const out={};cache.set(file,out);
 const compiled=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',compiled)(name=>{
  if(Object.hasOwn(stubs,name))return stubs[name];
  if(name==='react/jsx-runtime')return jsx;
  if(name==='react')return React;
  const candidate=name.startsWith('@/')?name.slice(2):name.startsWith('.')?resolve(root,dirname(file),name):null;
  if(candidate)for(const ext of ['', '.ts','.tsx'])if(existsSync(resolve(root,candidate+ext)))return load(resolve(root,candidate+ext).slice(root.length+1).replaceAll('\\','/'),stubs,cache);
  return require(name);
 },out);return out;
}
const config=load('lib/catalog/attribute-config.ts');
const sql=read(migration);
const lists=[...sql.matchAll(/any\(array\[([\s\S]*?)\]::text\[\]\)/g)].map(m=>[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]));
const publicNames=lists[0];
test('view and restrictive RLS use the same explicit commercial list, including every managed/legacy alias',()=>{
 assert.equal(lists.length,2);assert.deepEqual(lists[0],lists[1]);assert.equal(new Set(publicNames).size,publicNames.length);
 for(const key of Object.values(config.CATALOG_ATTRIBUTE_KEYS))for(const name of config.getCatalogAttributeNameAliases(key))assert.ok(publicNames.includes(name.trim().toLowerCase()),name);
 for(const name of ['Marca','Tipo','Color','Boca','Diseño','Material','Acrílico','Uso','Contenido','Volumen','Capacidad'])assert.ok(publicNames.includes(name.toLowerCase()));
 for(const name of ['Proveedor','Costo','supplier_id','internal_notes','future_admin_field'])assert.ok(!publicNames.includes(name.toLowerCase()));
 assert.match(sql,/as restrictive for select to anon,authenticated/);assert.match(sql,/security_barrier=true,security_invoker=true/);
 assert.doesNotMatch(sql,/\b(?:insert into|update public|delete from|grant |create function|drop policy|disable row level)\b/i);
});

const enabled=Boolean(process.env.SFSTORE_TEST_PG_BIN);
describe('public attribute boundary on isolated loopback PostgreSQL / synthetic data only',{skip:!enabled,concurrency:false,timeout:180000},()=>{
 let cluster,db,started=false,connection,product,draft,family,variants,baseline,definitions;
 const q=async(s,a=[]) =>(await db.query(s,a)).rows;
 function run(bin,args){const r=spawnSync(join(process.env.SFSTORE_TEST_PG_BIN,bin+(process.platform==='win32'?'.exe':'')),args,{encoding:'utf8',timeout:60000,windowsHide:true,...(bin==='pg_ctl'?{stdio:'ignore'}:{})});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout;}
 async function asRole(role,text,args=[]){await q('begin');try{await q(`set local role ${role}`);if(role==='authenticated')await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:'10000000-0000-4000-8000-000000000009',is_anonymous:false})]);return await q(text,args);}finally{await q('rollback');}}
 const snapshot=()=>q("select jsonb_build_object('products',(select jsonb_agg(to_jsonb(p) order by id) from products p),'attributes',(select jsonb_agg(to_jsonb(a) order by id) from product_attributes a),'images',(select jsonb_agg(to_jsonb(i) order by id) from product_images i)) data").then(r=>r[0].data);
 before(async()=>{
  cluster=mkdtempSync(join(tmpdir(),'sfstore-public-attrs-'));
  run('initdb',['-D',join(cluster,'data'),'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);
  const listener=createServer();await new Promise((ok,bad)=>{listener.once('error',bad);listener.listen(0,'127.0.0.1',ok);});const port=listener.address().port;await new Promise(ok=>listener.close(ok));
  run('pg_ctl',['-D',join(cluster,'data'),'-l',join(cluster,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -c fsync=off -c statement_timeout=20000`,'-w','start']);started=true;
  connection={host:'127.0.0.1',port,user:'postgres',database:'postgres'};db=new Client(connection);await db.connect();assert.equal((await q('show listen_addresses'))[0].listen_addresses,'127.0.0.1');
  await q('create role anon;create role authenticated;create role service_role bypassrls;alter default privileges revoke execute on functions from public;');
  await q(read('tests/fixtures/storage-permissions.sql'));
  for(const e of JSON.parse(read('staging/migration-manifest.json')).applicationOrder)if(e.source!==migration){try{await q(read(e.stagingFile));}catch(error){throw new Error('LOCAL_REBUILD_FAILED '+e.source+': '+error.message);}}
  await q(read('staging/supabase/seed.sql'));
  const category=(await q("select id from categories where slug='perfumes'"))[0].id;
  product=randomUUID();draft=randomUUID();
  for(const [id,status]of [[product,'active'],[draft,'draft']])await q("insert into products(id,category_id,name,slug,short_description,description,price,cost,stock,status) values($1::uuid,$2,'SYNTHETIC PUBLIC TEST',$1::text,'SYNTHETIC SUMMARY','SYNTHETIC DESCRIPTION',100,40,3,$3)",[id,category,status]);
  for(const [n,name]of publicNames.entries())await q('insert into product_attributes(product_id,name,value,sort_order) values($1,$2,$3,$4)',[product,name,name==='commercial_category'?'arabe':name==='olfactory_family'?'fresco':name==='gender'?'masculino':'SYNTHETIC PUBLIC',n]);
  for(const name of ['Proveedor',' PROVEEDOR ','Costo','supplier_id','future_admin_field'])await q("insert into product_attributes(product_id,name,value) values($1,$2,'SYNTHETIC_PRIVATE_CANARY')",[product,name]);
  await q("insert into product_attributes(product_id,name,value) values($1,'Marca','SYNTHETIC DRAFT')",[draft]);
  family=randomUUID();await q('select save_product_family($1,0,$2,$3,$4,100)',[family,'SYNTHETIC FAMILY','synthetic-family',category]);
  const option=(await q("select add_product_family_option($1,'Color',array['Gris','Negro']) id",[family]))[0].id;variants=[];
  const values=await q('select id,label from product_family_option_values where option_id=$1 order by label',[option]);
  for(const [i,value]of values.entries()){const id=randomUUID();await q('select configure_product_variant($1,$2,null,$3,$4,true,false,$5)',[id,family,JSON.stringify({[option]:value.id}),i?120:null,JSON.stringify({name:'SYNTHETIC VARIANT',slug:'synthetic-'+id,sku:'TEST-'+i})]);await q("update products set stock=2,status='active' where id=$1",[id]);await q("insert into product_attributes(product_id,name,value) values($1,'Marca','SYNTHETIC BRAND'),($1,'Proveedor','SYNTHETIC_PRIVATE_CANARY')",[id]);variants.push(id);}
  assert.ok((await asRole('anon',"select name from product_attributes where product_id=$1 and name='Proveedor'",[product])).length>0,'fixture reproduces original exposure');
  baseline=await snapshot();definitions=await q("select oid::regprocedure::text signature,pg_get_functiondef(oid) body from pg_proc where pronamespace='public'::regnamespace order by oid");
  await q(sql);
 });
 after(async()=>{await db?.end();if(started)run('pg_ctl',['-D',join(cluster,'data'),'-m','immediate','-w','stop']);if(cluster){assert.equal(dirname(resolve(cluster)),resolve(tmpdir()));assert.ok(basename(cluster).startsWith('sfstore-public-attrs-'));rmSync(cluster,{recursive:true,force:true});}});
 test('migration preserves every stored row and all existing RPCs, with invoker/barrier unchanged',async()=>{
  assert.deepEqual(await snapshot(),baseline);assert.deepEqual(await q("select oid::regprocedure::text signature,pg_get_functiondef(oid) body from pg_proc where pronamespace='public'::regnamespace order by oid"),definitions);
  const opts=(await q("select reloptions from pg_class where oid='public_catalog_skus'::regclass"))[0].reloptions;assert.ok(opts.includes('security_invoker=true')&&opts.includes('security_barrier=true'));
 });
 for(const role of ['anon','authenticated']){
  test(role+' direct table reads retain all commercial aliases and hide internal/unknown attributes',async()=>{
   const rows=await asRole(role,'select name,value from product_attributes where product_id=$1',[product]);assert.deepEqual(rows.map(r=>r.name).sort(),[...publicNames].sort());assert.ok(!JSON.stringify(rows).includes('SYNTHETIC_PRIVATE_CANARY'));
   assert.deepEqual(await asRole(role,'select name from product_attributes where product_id=$1',[draft]),[]);
   await assert.rejects(asRole(role,'select cost from products'),/permission denied/);
   await assert.rejects(asRole(role,"update product_attributes set value='BAD' where product_id=$1",[product]),/permission denied/);
  });
  test(role+' public view returns no internal values, including all family SKU',async()=>{
   const rows=await asRole(role,'select * from public_catalog_skus where id=any($1::uuid[])',[[product,...variants]]);assert.equal(rows.length,3);assert.ok(!JSON.stringify(rows).includes('SYNTHETIC_PRIVATE_CANARY'));const r=rows.find(r=>r.id===product);assert.equal(r.product_attributes.length,publicNames.length);assert.equal(r.price,'100.00');assert.equal(r.stock,3);
  });
 }
 test('privileged admin keeps complete attributes and exact IDs/order; public view filters even service_role',async()=>{
  const attrs=(await asRole('service_role','select to_jsonb(a) data from product_attributes a where product_id=$1 order by id',[product])).map(r=>r.data);assert.deepEqual(attrs,baseline.attributes.filter(a=>a.product_id===product));
  assert.ok(attrs.some(a=>a.name==='Proveedor'));assert.ok((await asRole('service_role','select get_product_save_version($1) version',[product]))[0].version);
  const rows=await asRole('service_role','select product_attributes from public_catalog_skus where id=$1',[product]);assert.ok(!JSON.stringify(rows).includes('SYNTHETIC_PRIVATE_CANARY'));
 });
 test('restrictive guard survives an older broad permissive policy; future private attributes default hidden',async()=>{
  await q('begin');try{await q('create policy fixture_old_permissive on product_attributes for select to anon,authenticated using(true)');await q("insert into product_attributes(product_id,name,value) values($1,'new_internal_2027','SYNTHETIC_PRIVATE_CANARY')",[product]);await q('set local role anon');const rows=await q('select name,value from product_attributes where product_id=$1',[product]);assert.equal(rows.length,publicNames.length);assert.ok(!JSON.stringify(rows).includes('SYNTHETIC_PRIVATE_CANARY'));}finally{await q('rollback');}
 });
 test('real product page SSR and serialized client-bound product contain only public data',async()=>{
  const row=(await asRole('anon','select * from public_catalog_skus where id=$1',[product]))[0];
  const stubs={'@/lib/supabase/client':{},'@/data/products':{products:[]},'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');}},'next/link':{default:({children,...props})=>{delete props.prefetch;return React.createElement('a',props,children);}},'@/components/site-header':{SiteHeader:()=>null},'@/components/analytics-view':{AnalyticsView:()=>null},'@/components/component-offers':{ComponentOffers:()=>null},'@/components/product-image-gallery':{ProductImageGallery:()=>null},'@/components/product-family-detail':{ProductFamilyDetail:()=>null}};
  // Export the existing mapper in memory only; no application source changes.
  const source=read('services/products.ts')+'\nexport {mapSupabaseProduct as mapPublicRow};';const out={};
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',code)(name=>Object.hasOwn(stubs,name)?stubs[name]:name.startsWith('@/')?load(name.slice(2)+'.ts',stubs):require(name),out);
  const productView=out.mapPublicRow(row);let clientPayload;
  stubs['@/services/products']={getProductBySlug:async()=>productView,getRelatedProducts:async()=>[]};
  stubs['./product-actions']={ProductActions:({product})=>{clientPayload=JSON.stringify(product);return React.createElement('button',null,'Comprar');}};
  const Page=load('app/producto/[slug]/page.tsx',stubs).default;const element=await Page({params:Promise.resolve({slug:row.slug})});const html=renderToStaticMarkup(element);
  assert.match(html,/SYNTHETIC PUBLIC TEST/);assert.match(html,/Comprar/);assert.ok(clientPayload);assert.doesNotMatch(html+clientPayload,/SYNTHETIC_PRIVATE_CANARY|Proveedor|future_admin_field/);
 });
 test('family selection and server checkout still use the original SKU, price and reservation contract',async()=>{
  const rows=await asRole('anon','select * from public_catalog_skus where family_id=$1 order by price',[family]);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.price),['100.00','120.00']);assert.ok(rows.every(r=>r.variant_options.Color));
  // Entire lifecycle is synthetic and rolled back, without any external calls.
  await q('begin');try{await q('set local role service_role');const result=(await q('select create_checkout_atomic($1,$2,$3) result',[randomUUID(),randomUUID(),JSON.stringify({customer:{fullName:'SYNTHETIC BUYER',phone:'TEST'},paymentMethod:'transfer',shipping:{method:'pickup'},items:[{productId:product,quantity:1}]})]))[0].result;assert.ok(result.id);assert.equal((await q('select stock from products where id=$1',[product]))[0].stock,2);assert.equal((await q('select unit_price from order_items where order_id=$1',[result.id]))[0].unit_price,'75.00');assert.equal((await q("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='reservation'",[result.id]))[0].n,1);}finally{await q('rollback');}assert.equal((await q('select stock from products where id=$1',[product]))[0].stock,3);
 });
});
