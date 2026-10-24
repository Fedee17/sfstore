import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const name=`sfstore-p02-images-${process.pid}`;
const dockerPath=process.env.SFSTORE_TEST_DOCKER;
function docker(args,input){const r=spawnSync(dockerPath,args,{input,encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout;}
function sql(text){return docker(['exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'],text).trim();}
const rid='11111111-1111-4111-8111-111111111111',pid='22222222-2222-4222-8222-222222222222';
const cc='33333333-3333-4333-8333-333333333333',light='44444444-4444-4444-8444-444444444444';
test('isolated PostgreSQL: connector associations, invoker permissions and unchanged commercial data',{skip:!dockerPath},async t=>{
 docker(['run','-d','--rm','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.6']);
 try{
  let ready=false;for(let i=0;i<40;i++){const r=spawnSync(dockerPath,['exec',name,'pg_isready','-U','postgres'],{encoding:'utf8',windowsHide:true});if(r.status===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'database ready');
  const inspected=JSON.parse(docker(['inspect',name]))[0];assert.deepEqual(inspected.HostConfig.PortBindings,{});assert.equal(inspected.HostConfig.NetworkMode,'none');
  sql(`create role anon;create role authenticated;create role service_role bypassrls;
   create table public.products(id uuid primary key,stock int,price numeric,cost numeric);
   insert into products values('${pid}',0,30666.67,10000);
   create table component_recipes(id uuid primary key,presentation_product uuid references products);
   insert into component_recipes values('${rid}','${pid}');
   create table product_images(id uuid primary key,product_id uuid references products,url text,alt text,sort_order int,is_primary boolean);
   insert into product_images values('${cc}','${pid}','https://images.test/cc.webp','Conjunto C/C',0,true),('${light}','${pid}','https://images.test/lightning.webp','Conjunto Lightning',1,false);
   create table component_offer_publications(recipe_id uuid,connector text,name text,head_product uuid,cable_product uuid,presentation_product uuid,combo_list_price numeric,combo_transfer_price numeric,price_version text);
   insert into component_offer_publications select '${rid}',c,'TEST',h,b,'${pid}',30666.67,23000,'v1' from(values('cc','55555555-5555-4555-8555-555555555555'::uuid,'66666666-6666-4666-8666-666666666666'::uuid),('lightning','55555555-5555-4555-8555-555555555555'::uuid,'77777777-7777-4777-8777-777777777777'::uuid))v(c,h,b);
   create table public_catalog_skus(id uuid,slug text,stock int,price numeric);
   insert into public_catalog_skus values('55555555-5555-4555-8555-555555555555','head',21,22000),('66666666-6666-4666-8666-666666666666','cc',10,15800),('77777777-7777-4777-8777-777777777777','lightning',10,15800);
   alter table product_images enable row level security;alter table component_recipes enable row level security;alter table component_offer_publications enable row level security;
   create policy public_offer on component_offer_publications for select to anon,authenticated using(true);
   grant usage on schema public to anon,authenticated,service_role;
   grant select on public_catalog_skus,component_offer_publications to anon,authenticated;
   grant select,update on component_recipes to service_role;grant select,update,insert,delete on product_images,component_offer_publications to service_role;
   create view public_component_offers with(security_invoker=true,security_barrier=true) as select o.recipe_id id,o.name,o.connector,o.head_product,h.slug head_slug,p.slug cable_slug,least(h.stock,p.stock) available,o.presentation_product,o.combo_list_price,o.combo_transfer_price,o.price_version from component_offer_publications o join public_catalog_skus h on h.id=o.head_product join public_catalog_skus p on p.id=o.cable_product where h.price>0 and p.price>0;
   grant select on public_component_offers to anon,authenticated;
  `);
  const before=sql('select row_to_json(p) from products p;');
  sql(readFileSync(new URL('../supabase/migrations/202610240001_component_offer_images.sql',import.meta.url),'utf8'));
  await t.test('no photos are fabricated; mutation RPC denied to public roles',()=>{
   assert.equal(sql("set role anon;select count(*) from public_component_offers where image_url is null;"),'SET\n2');
   assert.equal(sql("select has_function_privilege('anon','public.set_component_offer_images(uuid,uuid,uuid)','execute'),has_function_privilege('authenticated','public.set_component_offer_images(uuid,uuid,uuid)','execute');"),'f|f');
  });
  const assign=(a=cc,b=light)=>`set role service_role;select set_component_offer_images('${rid}',${a?`'${a}'`:'null'},${b?`'${b}'`:'null'});`;
  await t.test('each connector receives its exact image; repeated confirmation is idempotent',()=>{
   sql(assign());const once=sql('select connector,image_url from public_component_offers order by connector;');sql(assign());assert.equal(sql('select connector,image_url from public_component_offers order by connector;'),once);
   assert.equal(once,'cc|https://images.test/cc.webp\nlightning|https://images.test/lightning.webp');
  });
  await t.test('same image or another product is rejected without losing previous assignments',()=>{
   assert.throws(()=>sql(assign(cc,cc)),/COMBO_IMAGE_REUSED/);
   assert.throws(()=>sql(assign('88888888-8888-4888-8888-888888888888',light)),/COMBO_IMAGE_WRONG_PRODUCT/);
   assert.equal(sql('select count(*) from public_component_offers where image_url is not null;'),'2');
  });
  await t.test('different image IDs with the same URL are rejected transactionally',()=>{
   sql(`insert into product_images values('99999999-9999-4999-8999-999999999999','${pid}','https://images.test/cc.webp','duplicate',2,false,null);`);
   assert.throws(()=>sql(assign(cc,'99999999-9999-4999-8999-999999999999')),/product_image_distinct_combo_url/);
   assert.equal(sql("select image_url from public_component_offers where connector='lightning';"),'https://images.test/lightning.webp');
  });
  await t.test('refreshing publication rows preserves photo identity; alt edits propagate',()=>{
   sql("create temp table saved as select recipe_id,connector,name,head_product,cable_product,presentation_product,combo_list_price,combo_transfer_price,price_version from component_offer_publications;delete from component_offer_publications;insert into component_offer_publications select * from saved;");
   assert.equal(sql('select count(*) from public_component_offers where image_url is not null;'),'2');
   sql(`update product_images set alt='Approved C/C' where id='${cc}';`);assert.equal(sql("select image_alt from public_component_offers where connector='cc';"),'Approved C/C');
   sql(`insert into product_images(id,product_id,url,alt,sort_order,is_primary) values('${cc}','${pid}','https://images.test/cc.webp','Edited by existing gallery',1,false) on conflict(id) do update set alt=excluded.alt,sort_order=excluded.sort_order,is_primary=excluded.is_primary;`);
   assert.equal(sql(`select combo_connector from product_images where id='${cc}';`),'cc');
  });
  await t.test('deletion clears only that connector; clearing does not borrow another image',()=>{
   sql(`delete from product_images where id='${cc}';`);assert.equal(sql("select image_url is null from public_component_offers where connector='cc';"),'t');assert.equal(sql("select image_url from public_component_offers where connector='lightning';"),'https://images.test/lightning.webp');
   sql(assign(null,null));assert.equal(sql('select count(*) from public_component_offers where image_url is null;'),'2');
   sql(assign(null,light));sql('truncate product_images;');assert.equal(sql('select count(*) from public_component_offers where image_url is null;'),'2');
  });
  await t.test('public reads use RLS; private source remains inaccessible; money and stock unchanged',()=>{
   for(const role of ['anon','authenticated']){assert.equal(sql(`set role ${role};select count(*) from public_component_offers;`),'SET\n2');assert.throws(()=>sql(`set role ${role};select * from product_images;`),/permission denied/);assert.throws(()=>sql(`set role ${role};select * from component_recipes;`),/permission denied/);}
   assert.equal(sql('select row_to_json(p) from products p;'),before);
   assert.equal(sql("select reloptions @> array['security_invoker=true'] from pg_class where oid='public_component_offers'::regclass;"),'t');
  });
 }finally{docker(['rm','-f',name]);}
});
