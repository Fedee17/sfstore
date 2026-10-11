import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import { Client } from "pg";

const root = resolve(import.meta.dirname, "..");
const name = "202610110001_sec01_effective_permissions.sql";
const sql = readFileSync(join(root, "supabase/migrations", name), "utf8");
const publicTables = ["categories", "products", "product_images", "product_attributes"];
const privateTables = ["customers", "orders", "order_items", "settings", "inventory_movements", "analytics_events",
  "suppliers", "purchases", "purchase_items", "order_payments", "historical_import_batches",
  "historical_import_records", "product_save_operations", "product_storage_tasks"];

test("SEC-01 migration only changes permissions/policies, with atomic rollback and no credential/role changes", () => {
  assert.match(sql, /begin;[\s\S]+commit;/);
  assert.doesNotMatch(sql, /^\s*(?:insert into|update public\.|delete from|truncate\s|drop table|drop column|alter role|create role|security definer)\b/im);
  assert.match(sql, /revoke all privileges \(%s\)/);
});

describe("SEC-01 effective role permissions in isolated PostgreSQL", { skip: !process.env.SFSTORE_TEST_PG_BIN, concurrency: false }, () => {
  let cluster, db, started = false;
  const category = randomUUID(), inactiveCategory = randomUUID();
  const visible = randomUUID(), draft = randomUUID();
  function run(executable, args) {
    const r = spawnSync(join(process.env.SFSTORE_TEST_PG_BIN, executable), args, { encoding: "utf8", timeout: 60000 });
    assert.equal(r.status, 0, r.stderr || r.error?.message);
  }
  async function role(name, fn) {
    assert.ok(["anon", "authenticated", "service_role"].includes(name));
    await db.query(`set role ${name}`);
    try { return await fn(); } finally { await db.query("reset role"); }
  }
  const denied = (query, args) => assert.rejects(db.query(query, args), e => e.code === "42501");
  async function snapshot() {
    const result = {};
    for (const table of [...publicTables, ...privateTables]) {
      result[table] = (await db.query(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows;
    }
    result.objects = (await db.query("select * from storage.objects order by id")).rows;
    return result;
  }
  async function apply() {
    try { await db.query(sql); } catch (e) { await db.query("rollback"); throw e; }
  }
  before(async () => {
    cluster = mkdtempSync(join(tmpdir(), "sfstore-sec01-db-"));
    run("initdb", ["-D", join(cluster, "data"), "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--no-locale"]);
    const listener = createServer();
    await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    run("pg_ctl", ["-D", join(cluster, "data"), "-l", join(cluster, "log"), "-o",
      `-h 127.0.0.1 -p ${port} -c fsync=off -c statement_timeout=10000`, "-w", "start"]);
    started = true;
    db = new Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres" });
    await db.connect();
    await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to service_role;`);
    await db.query(readFileSync(join(root, "supabase/schema.sql"), "utf8"));
    await db.query(readFileSync(join(root, "tests/fixtures/storage-permissions.sql"), "utf8"));
    for (const file of readdirSync(join(root, "supabase/migrations")).filter(f => f.endsWith(".sql") && f < name).sort()) {
      await db.query(readFileSync(join(root, "supabase/migrations", file), "utf8"));
    }
    // Model possible legacy drift, without asserting these grants exist in Production.
    await db.query(`grant usage, create on schema public to public, anon, authenticated;
      grant all on all tables in schema public to anon, authenticated;
      grant select(cost), update(cost) on products to public;
      grant all on all functions in schema public to public, anon, authenticated;
      create policy legacy_storage_all on storage.objects for all to public using (true) with check (true);
      insert into storage.buckets values ('product-images',true),('other-fixture',false);
      insert into storage.objects(bucket_id,name) values ('product-images','fixture.webp'),('other-fixture','keep.webp');`);
    for (const table of [...publicTables, ...privateTables]) {
      await db.query(`create policy legacy_all on public.${table} for all to public using (true) with check (true)`);
    }
    await db.query("insert into categories(id,name,slug,is_active) values ($1,'Visible','perfumes',true),($2,'Hidden','hidden',false)", [category, inactiveCategory]);
    for (const [id, slug, status, cat] of [
      [visible, "visible-fixture", "active", category], [draft, "draft-fixture", "draft", category],
      [randomUUID(), "archived-fixture", "archived", category], [randomUUID(), "inactive-category-fixture", "active", inactiveCategory],
      [randomUUID(), "perfume-yara-rosa", "active", category]
    ]) {
      await db.query("insert into products(id,category_id,name,slug,short_description,price,cost,status) values ($1,$2,'Synthetic',$3,'Fixture',100,20,$4)", [id, cat, slug, status]);
      await db.query("insert into product_images(product_id,url) values ($1,'https://fixture.invalid/image.webp')", [id]);
      await db.query("insert into product_attributes(product_id,name,value) values ($1,'Marca','Fixture')", [id]);
    }
    await db.query(`insert into products(category_id,name,slug,status,historical_identity,historical_group_key,price,short_description)
      values ($1,'Synthetic historical','historical-fixture','archived',true,'fixture:history',null,null)`, [category]);
    await db.query("insert into customers(full_name,phone,email) values ('Synthetic customer','000','fixture@example.invalid')");
    // Reproduce the source gap locally: no RLS on base tables, broad ACL permits cost/PII.
    await role("anon", async () => {
      assert.equal((await db.query("select cost from products where id=$1", [visible])).rows[0].cost, "20.00");
      assert.equal((await db.query("select email from customers")).rowCount, 1);
    });
    const before = await snapshot();
    await apply();
    assert.deepEqual(await snapshot(), before, "migration must not change historical/business/object rows");
  });
  after(async () => {
    await db?.end();
    if (started) run("pg_ctl", ["-D", join(cluster, "data"), "-m", "immediate", "-w", "stop"]);
    if (cluster) {
      assert.ok(basename(cluster).startsWith("sfstore-sec01-db-"));
      rmSync(cluster, { recursive: true, force: true });
    }
  });

  for (const user of ["anon", "authenticated"]) {
    test(`${user}: only active operational products in active categories, and visible child rows`, async () => {
      await role(user, async () => {
        assert.deepEqual((await db.query("select id from products order by id")).rows, [{ id: visible }]);
        assert.deepEqual((await db.query("select id from categories order by id")).rows, [{ id: category }]);
        for (const table of ["product_images", "product_attributes"]) {
          assert.deepEqual((await db.query(`select product_id from ${table}`)).rows, [{ product_id: visible }]);
        }
        // Same explicit projection and FK joins used by the PostgREST catalogue.
        assert.equal((await db.query(`select p.id,p.name,p.slug,p.short_description,p.description,p.price,p.transfer_price,
          p.stock,p.featured,p.status,p.historical_identity,p.category_id,c.id,c.name,c.slug,c.is_active,
          i.url,i.alt,i.sort_order,i.is_primary,a.name,a.value,a.sort_order
          from products p join categories c on c.id=p.category_id
          left join product_images i on i.product_id=p.id left join product_attributes a on a.product_id=p.id`)).rowCount, 1);
        await denied("select * from products");
        await denied("select cost from products");
        await denied("select historical_group_key from products");
      });
    });
    test(`${user}: private tables deny reads and every mutation, including empty predicates`, async () => {
      await role(user, async () => {
        for (const table of privateTables) {
          const key = table === "product_save_operations" ? "operation_key" : "id";
          await denied(`select * from ${table}`);
          await denied(`insert into ${table} default values`);
          await denied(`update ${table} set ${key}=${key} where false`);
          await denied(`delete from ${table} where false`);
          await denied(`truncate ${table}`);
        }
        for (const table of publicTables) {
          await denied(`insert into ${table} default values`);
          await denied(`update ${table} set id=id where false`);
          await denied(`delete from ${table} where false`);
        }
        await denied("create table public.untrusted_fixture(id int)");
      });
    });
    test(`${user}: critical RPCs cannot be executed, even with an allowlisted-looking JWT claim`, async () => {
      await role(user, async () => {
        await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: user, email: "owner@example.invalid" })]);
        const functions = await db.query(`select p.oid::regprocedure::text as signature from pg_proc p
          join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
          and p.proname in ('confirm_purchase','adjust_inventory_stock','apply_sale_inventory','record_order_payment',
            'create_store_sale_atomic','record_store_sale_payment_atomic','save_customer_order','deliver_order',
            'create_product_atomic','update_product_atomic','enqueue_product_storage_task','delete_product_image_metadata_and_queue')`);
        assert.equal(functions.rowCount, 12);
        for (const { signature } of functions.rows) {
          assert.equal((await db.query("select has_function_privilege(current_user,$1,'EXECUTE') as allowed", [signature])).rows[0].allowed, false);
        }
        await denied("select create_product_atomic($1,$2,'{}')", [randomUUID(), randomUUID()]);
        await denied("select adjust_inventory_stock($1,1,'fixture',null)", [visible]);
        await denied("select delete_product_image_metadata_and_queue($1,$2,'fixture','fixture')", [visible, randomUUID()]);
      });
    });
    test(`${user}: product bucket listing/upload/overwrite/delete blocked; other bucket policies preserved`, async () => {
      await role(user, async () => {
        assert.deepEqual((await db.query("select name from storage.objects order by name")).rows, [{ name: "keep.webp" }]);
        await denied("insert into storage.objects(bucket_id,name) values ('product-images','new-fixture.webp')");
        assert.equal((await db.query("update storage.objects set name='changed' where bucket_id='product-images'")).rowCount, 0);
        assert.equal((await db.query("delete from storage.objects where bucket_id='product-images'")).rowCount, 0);
        await denied("update storage.objects set bucket_id='product-images' where bucket_id='other-fixture'");
      });
    });
  }
  test("service_role retains admin reads, transactional product save and synthetic object access", async () => {
    await role("service_role", async () => {
      assert.equal((await db.query("select cost from products where id=$1", [visible])).rows[0].cost, "20.00");
      assert.equal((await db.query("select * from customers")).rowCount, 1);
      assert.equal((await db.query("select * from product_storage_tasks")).rowCount, 0);
      const id = randomUUID();
      const payload = { product: { category_id: category, name: "Server fixture", slug: `fixture-${id}`,
        short_description: "Fixture", description: null, price: 100, transfer_price: null,
        compare_at_price: null, cost: 10, sku: null, status: "draft", featured: false }, attributes: [], images: [] };
      await db.query("select create_product_atomic($1,$2,$3)", [randomUUID(), id, payload]);
      assert.equal((await db.query("select id from products where id=$1", [id])).rowCount, 1);
      await db.query("insert into storage.objects(bucket_id,name) values ('product-images','server-fixture.webp')");
      assert.equal((await db.query("delete from storage.objects where name='server-fixture.webp'")).rowCount, 1);
    });
  });
  test("restrictive policies still protect private data and visible products against reintroduced grants", async () => {
    await db.query("grant select on customers to anon; grant delete on products to anon");
    try {
      await role("anon", async () => {
        assert.equal((await db.query("select * from customers")).rowCount, 0);
        assert.equal((await db.query("delete from products where id=$1", [visible])).rowCount, 0);
      });
    } finally { await db.query("revoke select on customers from anon; revoke delete on products from anon"); }
  });
  test("every versioned application function, including helpers/triggers, is service-only", async () => {
    const functions = await db.query(`select p.oid::regprocedure::text as signature,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,
      has_function_privilege('service_role',p.oid,'EXECUTE') as service
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid
        and d.refclassid='pg_extension'::regclass and d.deptype='e')`);
    assert.ok(functions.rowCount >= 30);
    for (const fn of functions.rows) {
      assert.equal(fn.anon, false, fn.signature); assert.equal(fn.authenticated, false, fn.signature);
      assert.equal(fn.service, true, fn.signature);
    }
  });
  test("repeat migration preserves rows, policies and narrow task queue ACLs", async () => {
    const before = await snapshot();
    await apply(); await apply();
    assert.deepEqual(await snapshot(), before);
    assert.equal((await db.query("select has_table_privilege('service_role','product_storage_tasks','DELETE') as allowed")).rows[0].allowed, false);
  });
  test("read-only metadata verification reports no ACL violations and cannot change fixtures", async () => {
    const before = await snapshot();
    const results = await db.query(readFileSync(join(root, "reports/sec01-permissions-read-only.sql"), "utf8"));
    assert.deepEqual(results.at(-2).rows, [{ violations: 0, details: [] }]);
    assert.deepEqual(await snapshot(), before);
  });
  test("unexpected inherited column permission fails atomically rather than silently expanding the catalogue", async () => {
    await db.query("create role fixture_inherited; grant fixture_inherited to anon; grant select(sku) on products to fixture_inherited");
    try { await assert.rejects(apply(), /SEC01_INHERITED_CATALOG_COLUMN_ACCESS:anon:products.sku/); }
    finally { await db.query("revoke fixture_inherited from anon; drop owned by fixture_inherited; drop role fixture_inherited"); }
    await apply();
  });
  test("missing required table or Storage RLS aborts without partial permission changes", async () => {
    await db.query("alter table public.settings rename to fixture_settings");
    try { await assert.rejects(apply(), /SEC01_MISSING_REQUIRED_TABLE:settings/); }
    finally { await db.query("alter table public.fixture_settings rename to settings"); }
    await db.query("alter table storage.objects disable row level security");
    try { await assert.rejects(apply(), /SEC01_STORAGE_OBJECTS_RLS_REQUIRED/); }
    finally { await db.query("alter table storage.objects enable row level security"); }
    await apply();
  });
  test("membership in a privileged role is rejected even without inherited ACLs", async () => {
    await db.query("create role fixture_privileged bypassrls; grant fixture_privileged to anon with inherit false");
    try { await assert.rejects(apply(), /SEC01_PRIVILEGED_ROLE_MEMBERSHIP:anon/); }
    finally { await db.query("revoke fixture_privileged from anon; drop role fixture_privileged"); }
    await apply();
  });
});
