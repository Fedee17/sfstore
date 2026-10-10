import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { before, after, beforeEach, describe, test } from "node:test";
import { processStorageTasks } from "../lib/products/storage-task-processor.ts";

const root = resolve(import.meta.dirname, "..");
const pgBin = process.env.SFSTORE_TEST_PG_BIN;
for (const [environment, dbHost, storageHost, expected] of [
  ["production", "production.invalid", "production.invalid", /STORAGE_TASKS_APPLY_DISABLED/],
  ["local", "remote.invalid", "127.0.0.1", /STORAGE_TASKS_APPLY_DISABLED/],
  ["staging", "production.invalid", "production.invalid", /STORAGE_TASKS_APPLY_DISABLED/],
]) {
  test(`CLI rejects unsafe ${environment} target before connection`, () => {
    const result = spawnSync(process.execPath, [join(root, "scripts/process-product-storage-tasks.ts"), "--apply"], {
      encoding: "utf8", env: { ...process.env, STORAGE_TASKS_ENVIRONMENT: environment,
        STORAGE_TASKS_DATABASE_URL: `postgresql://fixture:fixture@${dbHost}/fixture?sslmode=verify-full`,
        STORAGE_TASKS_SUPABASE_URL: `https://${storageHost}`,
        STORAGE_TASKS_STAGING_DB_HOST: dbHost, STORAGE_TASKS_STAGING_STORAGE_HOST: storageHost },
    });
    assert.notEqual(result.status, 0); assert.match(result.stderr, expected);
  });
}
describe("Storage task worker with isolated PostgreSQL and synthetic Storage", { skip: !pgBin }, () => {
  let cluster, connection, db;
  const path = "products/fixture/abandoned.webp";
  let removals, objects, storage;
  function run(name, args) {
    const result = spawnSync(join(pgBin, name), args, { encoding: "utf8", timeout: 60000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  }
  before(async () => {
    cluster = mkdtempSync(join(tmpdir(), "sfstore-storage-tasks-"));
    run("initdb", ["-D", join(cluster, "data"), "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--no-locale"]);
    const listener = createServer();
    await new Promise((done) => listener.listen(0, "127.0.0.1", done));
    const port = listener.address().port;
    await new Promise((done) => listener.close(done));
    run("pg_ctl", ["-D", join(cluster, "data"), "-l", join(cluster, "log"), "-o", `-h 127.0.0.1 -p ${port} -c fsync=off`, "-w", "start"]);
    connection = { host: "127.0.0.1", port, user: "postgres", database: "postgres" };
    db = new Client(connection); await db.connect();
    await db.query("create role anon; create role authenticated; create role service_role bypassrls");
    await db.query(readFileSync(join(root, "supabase/schema.sql"), "utf8"));
    for (const file of readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
      await db.query(readFileSync(join(root, "supabase/migrations", file), "utf8"));
    }
    await db.query("grant usage on schema public to service_role; grant select,insert,update,delete on public.product_images to service_role; grant select,update on public.products to service_role");
  });
  after(async () => {
    await db?.end();
    if (cluster) {
      run("pg_ctl", ["-D", join(cluster, "data"), "-m", "immediate", "-w", "stop"]);
      rmSync(cluster, { recursive: true, force: true });
    }
  });
  beforeEach(async () => {
    await db.query("truncate product_storage_tasks,product_save_operations,product_images cascade");
    removals = [];
    objects = new Map([[path, { eTag: "hash", size: 123, mimetype: "image/webp" }]]);
    storage = { inspect: async (p) => objects.get(p) ?? null,
      remove: async (p) => { removals.push(p); objects.delete(p); } };
  });
  async function enqueue(status = "aborted", taskStatus = "pending", metadata = {}) {
    const key = randomUUID(), product = randomUUID();
    await db.query(`insert into product_save_operations(operation_key,product_id,operation_type,payload_hash,status,result)
      values ($1,$2,'create_product',$3,$4,$5)`, [key, product, "a".repeat(64), status, status === "committed" ? {} : null]);
    const { rows } = await db.query(`insert into product_storage_tasks(operation_key,product_id,action,storage_path,expected_metadata,status)
      values ($1,$2,'reconcile',$3,$4,$5) returning id`, [key, product, path, { path, size: 123, mime: "image/webp", content_hash: "hash", ...metadata }, taskStatus]);
    return rows[0].id;
  }
  const apply = (client = db, target = storage) => processStorageTasks(client, target, { dryRun: false });
  async function row(id) { return (await db.query("select * from product_storage_tasks where id=$1", [id])).rows[0]; }
  async function reference(url = `https://fixture.invalid/storage/v1/object/public/product-images/${path}`) {
    const category = randomUUID(), product = randomUUID();
    await db.query("insert into categories(id,name,slug) values ($1,'Fixture',$2)", [category, category]);
    await db.query("insert into products(id,category_id,name,slug,price,short_description) values ($1,$2,'Fixture',$3,1,'Fixture')", [product, category, product]);
    const inserted = await db.query("insert into product_images(product_id,url) values ($1,$2) returning id", [product, url]);
    return { productId: product, imageId: inserted.rows[0].id, url };
  }
  test("abandoned file is retained and recorded as retryable; repeated immediate runs do nothing", async () => {
    const id = await enqueue();
    assert.equal((await apply())[0].outcome, "retained_requires_conditional_delete");
    assert.deepEqual(removals, []);
    assert.equal((await row(id)).result.outcome, "retained_requires_conditional_delete");
    assert.equal((await row(id)).status, "failed");
    assert.ok(objects.has(path));
    assert.equal((await row(id)).attempts, 1);
    assert.deepEqual(await apply(), []);
  });
  for (const identity of [undefined, null, "", " ", '""', '" "']) {
    test(`legacy identity ${JSON.stringify(identity)} cannot authorize deletion`, async () => {
      const id = await enqueue("aborted", "pending", { content_hash: identity });
      assert.equal((await apply())[0].error, "STORAGE_IDENTITY_REQUIRED");
      assert.ok(objects.has(path)); assert.deepEqual(removals, []);
      assert.equal((await row(id)).status, "failed");
    });
  }
  test("path-only legacy intent retains existing objects but absent objects still complete", async () => {
    const id = await enqueue();
    await db.query("update product_storage_tasks set expected_metadata=$1 where id=$2", [{ path }, id]);
    assert.equal((await processStorageTasks(db, storage))[0].error, "STORAGE_IDENTITY_REQUIRED");
    objects.clear();
    assert.equal((await apply())[0].outcome, "already_absent");
  });
  test("all gallery references protect files, including encoded paths and query strings", async () => {
    const id = await enqueue("committed");
    await reference(`https://fixture.invalid/storage/v1/object/public/product-images/${path.replace("abandoned", "%61bandoned")}?download=1`);
    assert.equal((await apply())[0].outcome, "preserved_referenced");
    assert.equal((await row(id)).status, "completed"); assert.deepEqual(removals, []);
  });
  test("missing file completes idempotently", async () => {
    await enqueue(); objects.clear();
    assert.equal((await apply())[0].outcome, "already_absent"); assert.deepEqual(removals, []);
  });
  test("Storage failure persists error, delays retry, then succeeds", async () => {
    const id = await enqueue();
    const failure = { ...storage, inspect: async () => { throw Error("SYNTHETIC_STORAGE_FAILURE"); } };
    assert.equal((await apply(db, failure))[0].outcome, "failed");
    assert.equal((await row(id)).last_error, "SYNTHETIC_STORAGE_FAILURE");
    assert.deepEqual(await apply(), []);
    // Disable only the synthetic fixture clock trigger to age the retry.
    await db.query("alter table product_storage_tasks disable trigger product_storage_tasks_updated_at");
    await db.query("update product_storage_tasks set updated_at=now()-interval '2 hours' where id=$1", [id]);
    await db.query("alter table product_storage_tasks enable trigger product_storage_tasks_updated_at");
    assert.equal((await apply())[0].outcome, "retained_requires_conditional_delete");
    assert.equal((await row(id)).attempts, 2); assert.equal((await row(id)).last_error, "STORAGE_CONDITIONAL_DELETE_UNAVAILABLE");
  });
  test("legacy interrupted processing recovers", async () => {
    const id = await enqueue("aborted", "processing");
    assert.equal((await apply())[0].outcome, "retained_requires_conditional_delete");
    assert.equal((await row(id)).status, "failed");
  });
  test("external replacement after inspection is retained, including matching original identity", async () => {
    const id = await enqueue();
    const race = { ...storage, inspect: async (p) => {
      const original = { ...objects.get(p) };
      objects.set(p, { eTag: "external-replacement", size: 999, mimetype: "image/png" });
      return original;
    } };
    assert.equal((await apply(db, race))[0].outcome, "retained_requires_conditional_delete");
    assert.equal(objects.get(path).eTag, "external-replacement");
    assert.equal((await row(id)).status, "failed");
    assert.deepEqual(removals, []);
  });
  test("repeated operations on the same object never delete", async () => {
    await enqueue(); await enqueue("committed");
    assert.deepEqual((await apply()).map((r) => r.outcome).sort(), ["retained_requires_conditional_delete", "retained_requires_conditional_delete"]);
    assert.deepEqual(removals, []);
  });
  test("Storage inspection errors fail closed", async () => {
    await enqueue();
    assert.equal((await apply(db, { ...storage, inspect: async () => { throw Error("LIST_FAILURE"); } }))[0].error, "LIST_FAILURE");
    assert.deepEqual(removals, []);
  });
  test("malformed encoded references fail closed", async () => {
    await enqueue();
    await reference("https://fixture.invalid/storage/v1/object/public/product-images/%ZZ.webp");
    assert.equal((await apply())[0].outcome, "failed"); assert.deepEqual(removals, []);
  });
  test("dry-run of failure and deferred tasks never records attempts or errors", async () => {
    const id = await enqueue(); const before = await row(id);
    assert.equal((await processStorageTasks(db, { ...storage, inspect: async () => { throw Error("LIST_FAILURE"); } }))[0].outcome, "failed");
    assert.deepEqual(await row(id), before);
  });
  test("prepared saves and other prepared uploads remain retryable", async () => {
    const id = await enqueue("prepared"); const before = await row(id);
    assert.equal((await apply())[0].outcome, "deferred_prepared");
    assert.deepEqual(await row(id), before); assert.deepEqual(removals, []);
    await db.query("update product_save_operations set status='aborted'");
    const other = await enqueue("prepared");
    await db.query("update product_save_operations set recovery_metadata=$1 where operation_key=(select operation_key from product_storage_tasks where id=$2)", [{ uploads: [{ path }] }, other]);
    assert.ok((await apply()).every((r) => r.outcome === "deferred_prepared"));
  });
  test("changed object metadata fails closed", async () => {
    await enqueue(); objects.get(path).eTag = "replacement";
    assert.match((await apply())[0].error, /METADATA_MISMATCH/); assert.deepEqual(removals, []);
  });
  test("dry-run defaults to read-only and reports retention without changing rows/objects", async () => {
    const id = await enqueue(); const before = await row(id);
    assert.equal((await processStorageTasks(db, storage))[0].outcome, "retained_requires_conditional_delete");
    assert.deepEqual(await row(id), before); assert.deepEqual(removals, []); assert.ok(objects.has(path));
  });
  test("concurrent workers skip a locked task; gallery and operation writes wait during inspection", async () => {
    await enqueue(); await enqueue("committed");
    const other = new Client(connection), writer = new Client(connection);
    await other.connect(); await writer.connect();
    let release, entered;
    const gate = new Promise((done) => { release = done; });
    const started = new Promise((done) => { entered = done; });
    const slow = { ...storage, inspect: async (p) => { entered(); await gate; return storage.inspect(p); } };
    const first = apply(db, slow);
    try {
      await started;
      assert.deepEqual(await apply(other), []);
      await writer.query("set lock_timeout='100ms'");
      await assert.rejects(writer.query("update product_images set alt='blocked'"), /lock timeout/);
      await assert.rejects(writer.query("update product_save_operations set status='aborted'"), /lock timeout/);
      release(); await first; assert.deepEqual(removals, []);
    } finally { release(); await first; await other.end(); await writer.end(); }
  });
  test("crashed transaction releases ownership and another worker recovers", async () => {
    const id = await enqueue(); const crashed = new Client(connection); await crashed.connect();
    await crashed.query("begin");
    await crashed.query("select id from product_storage_tasks where id=$1 for update", [id]);
    assert.deepEqual(await apply(), []);
    await crashed.end();
    assert.equal((await apply())[0].outcome, "retained_requires_conditional_delete");
  });
  const deleteAndQueue = (item, url = item.url, storagePath = path) => db.query(
    "select public.delete_product_image_metadata_and_queue($1,$2,$3,$4) as result",
    [item.productId, item.imageId, url, storagePath]);
  test("admin metadata removal and durable intent commit atomically and cannot delete objects", async () => {
    const item = await reference();
    await db.query("insert into product_images(product_id,url,sort_order,is_primary) values ($1,'https://fixture.invalid/storage/v1/object/public/product-images/products/fixture/remaining.webp',7,false)", [item.productId]);
    await db.query("begin; set local role service_role");
    try { await deleteAndQueue(item); await db.query("commit"); }
    catch (error) { await db.query("rollback"); throw error; }
    assert.equal((await db.query("select count(*)::int as n from product_images where id=$1", [item.imageId])).rows[0].n, 0);
    const remaining = (await db.query("select sort_order,is_primary from product_images where product_id=$1", [item.productId])).rows;
    assert.deepEqual(remaining, [{ sort_order: 0, is_primary: true }]);
    const tasks = (await db.query("select * from product_storage_tasks")).rows;
    assert.equal(tasks.length, 1); assert.equal(tasks[0].status, "pending");
    assert.deepEqual(tasks[0].expected_metadata, { path });
    const operation = (await db.query("select * from product_save_operations")).rows[0];
    assert.equal(operation.status, "aborted"); assert.equal(operation.recovery_metadata.source, "admin_image_delete");
    assert.equal((await apply())[0].error, "STORAGE_IDENTITY_REQUIRED");
    await assert.rejects(deleteAndQueue(item), /Product image not found/);
    assert.equal((await db.query("select count(*)::int as n from product_storage_tasks")).rows[0].n, 1);
    assert.ok(objects.has(path)); assert.deepEqual(removals, []);
  });
  test("queue failure rolls back metadata removal, gallery normalization and operation creation", async () => {
    const item = await reference();
    await db.query("insert into product_images(product_id,url,sort_order,is_primary) values ($1,'https://fixture.invalid/remaining.webp',5,false)", [item.productId]);
    const before = (await db.query("select * from product_images where product_id=$1", [item.productId])).rows;
    await db.query(`create function fixture_queue_failure() returns trigger language plpgsql as $$
      begin raise exception 'SYNTHETIC_QUEUE_FAILURE'; end; $$;
      create trigger fixture_queue_failure before insert on product_storage_tasks for each row execute function fixture_queue_failure()`);
    try {
      await assert.rejects(deleteAndQueue(item), /SYNTHETIC_QUEUE_FAILURE/);
      assert.deepEqual((await db.query("select * from product_images where product_id=$1", [item.productId])).rows, before);
      assert.equal((await db.query("select count(*)::int as n from product_save_operations")).rows[0].n, 0);
    } finally { await db.query("drop trigger fixture_queue_failure on product_storage_tasks; drop function fixture_queue_failure()"); }
  });
  test("changed URL, invalid path and historical identities reject atomically", async () => {
    const item = await reference();
    await assert.rejects(deleteAndQueue(item, "https://fixture.invalid/changed"), /PRODUCT_IMAGE_CHANGED/);
    await assert.rejects(deleteAndQueue(item, item.url, "../invalid"), /PRODUCT_INVALID_STORAGE_TASK/);
    await assert.rejects(deleteAndQueue(item, item.url, null), /PRODUCT_INVALID_STORAGE_TASK/);
    await db.query("update products set historical_identity=true, historical_group_key='synthetic-fixture', status='archived', price=null, short_description=null where id=$1", [item.productId]);
    await assert.rejects(deleteAndQueue(item), /historical identities/);
    assert.equal((await db.query("select count(*)::int as n from product_images where id=$1", [item.imageId])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int as n from product_storage_tasks")).rows[0].n, 0);
  });
  test("external image metadata removal requires no Storage task; RPC access is service-only", async () => {
    const item = await reference("https://fixture.invalid/external.webp");
    await deleteAndQueue(item, item.url, null);
    assert.equal((await db.query("select count(*)::int as n from product_storage_tasks")).rows[0].n, 0);
    const privileges = await db.query(`select
      has_function_privilege('anon','public.delete_product_image_metadata_and_queue(uuid,uuid,text,text)','execute') as anon,
      has_function_privilege('authenticated','public.delete_product_image_metadata_and_queue(uuid,uuid,text,text)','execute') as authenticated,
      has_function_privilege('service_role','public.delete_product_image_metadata_and_queue(uuid,uuid,text,text)','execute') as service`);
    assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service: true });
  });
});
