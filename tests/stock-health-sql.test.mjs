import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {test} from 'node:test';

const runtimePath=process.env.SFSTORE_TEST_PGLITE_MODULE;
test('stock health SQL snapshot preserves reservations, variants, permissions and rows',{skip:!runtimePath},async()=>{
  const {PGlite}=createRequire(join(runtimePath,'package.json'))('@electric-sql/pglite');
  const db=new PGlite();
  const q=async(sql)=>(await db.query(sql)).rows;
  const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table products(id uuid primary key,category_id uuid,name text,sku text,family_id uuid,status text,created_at timestamptz default now(),stock integer,cost numeric,variant_choices jsonb default '{}',historical_identity boolean default false);
      create table inventory_movements(id integer,product_id uuid,order_id uuid,movement_type text,quantity integer);
      create table checkout_operations(order_id uuid primary key,state text,expires_at timestamptz);
      create table component_recipes(presentation_product uuid);
      create table product_family_options(id uuid,name text,family_id uuid);
      create table product_family_option_values(id uuid,label text,option_id uuid);
      grant select on all tables in schema public to service_role;
      insert into products(id,name,status,stock,cost) values('${id(1)}','Físico','active',2,100.25),('${id(2)}','Otra variante','active',3,null),('${id(3)}','Archivado','archived',9,100),('${id(4)}','Histórico','active',9,100),('${id(5)}','Combo virtual','active',9,100);
      update products set historical_identity=true where id='${id(4)}';
      insert into component_recipes values('${id(5)}');
      insert into checkout_operations values('${id(10)}','pending',now()-interval '2 days'),('${id(11)}','confirmed',now()-interval '1 day'),('${id(12)}','expired',now()-interval '1 day');
      insert into inventory_movements values(1,'${id(1)}','${id(10)}','reservation',5),(2,'${id(1)}','${id(11)}','reservation',20),(3,'${id(1)}','${id(12)}','reservation',20),(4,'${id(1)}','${id(10)}','sale',8);
      insert into product_family_options values('${id(20)}','Color','${id(21)}');
      insert into product_family_option_values values('${id(22)}','Azul','${id(20)}');
      update products set family_id='${id(21)}',variant_choices='{"${id(20)}":"${id(22)}"}',sku='AZUL' where id='${id(2)}';
    `);
    const before=await q('select * from products order by id');
    await db.exec(readFileSync(new URL('../supabase/migrations/202611080003_stock_health_snapshot.sql',import.meta.url),'utf8'));
    const fn=(await q("select prosecdef,provolatile,proconfig from pg_proc where oid='get_stock_health_snapshot()'::regprocedure"))[0];
    assert.equal(fn.prosecdef,false);assert.equal(fn.provolatile,'s');assert.ok(fn.proconfig[0].endsWith('pg_temp'));
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(q('select get_stock_health_snapshot()'),/permission denied/);
      await db.exec('reset role');
    }
    await db.exec('begin read only; set local role service_role');
    const result=(await q('select get_stock_health_snapshot() value'))[0].value;
    await db.exec('commit');
    assert.equal(result.products.length,2);
    assert.equal(result.products[0].available,2);assert.equal(result.products[0].reserved,5);
    assert.equal(result.products[0].cost,'100.25');assert.equal(result.products[1].cost,null);
    assert.equal(result.products[1].variant_label,'Color: Azul');
    assert.deepEqual(await q('select * from products order by id'),before);
    assert.equal((await q('select count(*) n from inventory_movements'))[0].n,4);
    assert.equal((await q("select exists(select 1 from pg_roles where rolname='sfstore_reservation_executor') value"))[0].value,false);
  } finally {await db.close();}
});
