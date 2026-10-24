import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const name=`sfstore-p02-gallery-${process.pid}`;
const dockerPath=process.env.SFSTORE_TEST_DOCKER;
function docker(args,input){const r=spawnSync(dockerPath,args,{input,encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout;}
function sql(text){return docker(['exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'],text).trim();}
const rid='11111111-1111-4111-8111-111111111111',pid='22222222-2222-4222-8222-222222222222';
const cc='33333333-3333-4333-8333-333333333333',light='44444444-4444-4444-8444-444444444444';
test('isolated PostgreSQL: shared editor connector galleries',{skip:!dockerPath},async t=>{
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

  sql(`alter table products add column slug text default 'synthetic',add column status text default 'draft',add column category_id uuid,add column updated_at timestamptz default now();
   alter table product_images add column created_at timestamptz default now(),add column updated_at timestamptz default now();
   create table product_attributes(id uuid,product_id uuid);
   create function set_updated_at() returns trigger language plpgsql as $$begin NEW.updated_at=now();return NEW;end$$;
   grant select,update on products to service_role;grant select on product_attributes to service_role;`);
  sql(readFileSync(new URL('../supabase/migrations/202610060001_atomic_product_save.sql',import.meta.url),'utf8'));
  sql(readFileSync(new URL('../supabase/migrations/202610240001_component_offer_images.sql',import.meta.url),'utf8'));
  sql(`set role service_role;select set_component_offer_images('${rid}','${cc}','${light}');`);
  sql(readFileSync(new URL('../supabase/migrations/202610240002_component_gallery_editor.sql',import.meta.url),'utf8'));
  const before=sql('select row_to_json(p) from products p;');
  const version=()=>sql(`select get_product_save_version('${pid}');`);
  const edit=(id,action,c='cc')=>sql(`set role service_role;select edit_component_gallery_image('${pid}','${c}','${id}','${action}');`);
  const second='99999999-9999-4999-8999-999999999999';
  const payload={product:{},attributes:[],connector:'cc',images:[{id:cc,url:'https://images.test/cc.webp',alt:'C/C',is_primary:true},{id:second,url:`https://local.test/storage/v1/object/public/product-images/products/${pid}/cc/hash.webp`,alt:'Second C/C',is_primary:false,path:`products/${pid}/cc/hash.webp`,content_hash:'hash',size:20,mime:'image/webp'}]};
  const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',initial=version();
  const save=(v=initial,pl=payload,k=key)=>sql(`set role service_role;select save_component_gallery_atomic('${k}','${pid}','${JSON.stringify(pl)}'::jsonb,'${v}');`);
  await t.test('upload uses existing reconciliation and idempotency ledger, automatically scopes connector',()=>{
   sql(`set role service_role;select prepare_product_save_operation('${key}','update_product','${pid}','${JSON.stringify(payload)}','${initial}');select enqueue_product_storage_task('${key}','${pid}','reconcile','${payload.images[1].path}','${JSON.stringify({path:payload.images[1].path,content_hash:'hash',size:20,mime:'image/webp'})}');`);
   save();const once=version();save();assert.equal(version(),once);
   assert.equal(sql(`select count(*) from product_images where product_id='${pid}' and combo_connector='cc';`),'2');
   assert.equal(sql("set role anon;select jsonb_array_length(image_gallery) from public_component_offers where connector='cc';"),'SET\n2');
   assert.equal(sql(`select count(*) from product_save_operations where status='committed';`),'1');
  });
  await t.test('primary and ordering are independent; public projection follows exact connector',()=>{
   edit(second,'primary');assert.equal(sql("select image_id from public_component_offers where connector='cc';"),second);
   edit(second,'previous');assert.equal(sql(`select sort_order from product_images where id='${second}';`),'0');
   assert.equal(sql(`select is_primary from product_images where id='${light}';`),'f');
   assert.equal(sql("select image_url from public_component_offers where connector='lightning';"),'https://images.test/lightning.webp');
  });
  await t.test('forged connector, commercial payload, stale version and public callers fail',()=>{
   assert.throws(()=>edit(light,'delete'),/no rows/);
   const bad={...payload,product:{price:1}};assert.throws(()=>save(version(),bad,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),/PRODUCT_GALLERY_INVALID_PAYLOAD/);
   assert.throws(()=>save(initial,payload,'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),/PRODUCT_STALE_VERSION/);
   assert.throws(()=>sql(`set role anon;select edit_component_gallery_image('${pid}','cc','${cc}','delete');`),/permission denied/);
   for(const role of ['anon','authenticated'])assert.equal(sql(`select has_function_privilege('${role}','save_component_gallery_atomic(uuid,uuid,jsonb,text)','execute');`),'f');
   for(const role of ['anon','authenticated']) {
    assert.equal(sql(`set role ${role};select count(*) from public_component_offers;`),'SET\n2');
    assert.throws(()=>sql(`set role ${role};select * from product_images;`),/permission denied/);
    assert.throws(()=>sql(`set role ${role};select * from component_recipes;`),/permission denied/);
   }
   assert.equal(sql("select has_function_privilege('service_role','set_component_offer_images(uuid,uuid,uuid)','execute');"),'f');
  });
  await t.test('delete queues retained object, selects remaining primary and leaves other gallery intact',()=>{
   edit(second,'delete');assert.equal(sql("select image_id from public_component_offers where connector='cc';"),cc);
   assert.equal(sql(`select count(*) from product_storage_tasks where image_id='${second}' and action='reconcile';`),'1');
   assert.equal(sql(`select count(*) from product_images where id='${light}';`),'1');
   assert.equal(sql("select reloptions @> array['security_invoker=true'] from pg_class where oid='public_component_offers'::regclass;"),'t');
   assert.equal(sql('select row_to_json(p) from products p;'),before);
  });
 }finally{docker(['rm','-f',name]);}
});
