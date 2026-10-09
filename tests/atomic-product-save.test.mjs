import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, beforeEach, describe, test } from "node:test";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const migrationName = "202610060001_atomic_product_save.sql";
const migration = readFileSync(join(root, "supabase", "migrations", migrationName), "utf8");

test("product save migration is additive and never operates on physical Storage", () => {
  assert.match(migration, /^--[\s\S]*?begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.doesNotMatch(migration, /alter table public\.(products|product_attributes|product_images)\b/i);
  assert.doesNotMatch(migration, /security definer|(?:insert into|update|delete from) storage\./i);
  assert.doesNotMatch(migration, /create or replace function/i);
  assert.match(migration, /PRODUCT_STALE_VERSION/);
  assert.match(migration, /PRODUCT_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /for update/);
  assert.match(migration, /HISTORICAL_PRODUCT_IDENTITY_IMMUTABLE/);
});

test("all new RPCs explicitly revoke client access and use a safe search_path", () => {
  const declarations = [...migration.matchAll(/create function public\.([a-z_]+)\(/g)];
  assert.equal(declarations.length, 8);
  assert.equal((migration.match(/security invoker set search_path = pg_catalog, public/g) ?? []).length, 8);
  for (const [, name] of declarations) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, anon, authenticated;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([^;]+to service_role;`));
  }
});

// No remote connection string is accepted. Native PostgreSQL and pg are optional test-only runtimes.
// Run with SFSTORE_TEST_PG_BIN and SFSTORE_TEST_PG_MODULE as documented in the Phase A contract.
const enabled = Boolean(process.env.SFSTORE_TEST_PG_BIN && process.env.SFSTORE_TEST_PG_MODULE);
describe("atomic product save: real isolated PostgreSQL", { skip: !enabled, concurrency: false }, () => {
  let cluster;
  let db;
  let Client;
  let connection;
  let started = false;
  const categoryId = "10000000-0000-4000-8000-000000000001";
  const supplierId = "10000000-0000-4000-8000-000000000002";
  const purchaseId = "10000000-0000-4000-8000-000000000003";
  const purchaseItemId = "10000000-0000-4000-8000-000000000004";
  const pgBin = process.env.SFSTORE_TEST_PG_BIN;

  function executable(name) {
    return join(pgBin, process.platform === "win32" ? `${name}.exe` : name);
  }

  function run(name, args) {
    const result = spawnSync(executable(name), args, { encoding: "utf8", stdio: "ignore", windowsHide: true, timeout: 60000 });
    assert.equal(result.status, 0, `${name}: ${result.stderr ?? result.error ?? result.stdout}`);
  }

  async function rpc(name, args, client = db) {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(", ");
    const { rows } = await client.query(`select public.${name}(${placeholders}) as result`, args);
    return rows[0].result;
  }

  function payload(productId, changes = {}) {
    return {
      product: {
        category_id: categoryId, name: "Local SQL fixture", slug: `fixture-${productId}`,
        short_description: "Fixture", description: "sensacion", price: 100,
        transfer_price: 90, compare_at_price: null, cost: 10, sku: null, featured: false, status: "active",
        ...changes,
      },
      attributes: [{ name: "Marca", value: "Fixture brand", sort_order: 10 }],
      images: [],
    };
  }

  function image(productId, options = {}) {
    const id = randomUUID();
    const path = `products/${productId}/${id}.webp`;
    return {
      id, url: `https://fixture.invalid/storage/v1/object/public/product-images/${path}`,
      path, size: 1234, mime: "image/webp", content_hash: id.replaceAll("-", ""),
      alt: "Fixture image", ...options,
    };
  }

  async function create(changes = {}) {
    const id = randomUUID();
    const request = payload(id, changes);
    const result = await rpc("create_product_atomic", [randomUUID(), id, request]);
    return { id, request, result };
  }

  async function snapshot(id) {
    const { rows } = await db.query(`select jsonb_build_object(
      'product', (select to_jsonb(p) from products p where id = $1),
      'attributes', (select coalesce(jsonb_agg(to_jsonb(a) order by id), '[]') from product_attributes a where product_id = $1),
      'images', (select coalesce(jsonb_agg(to_jsonb(i) order by id), '[]') from product_images i where product_id = $1)
    ) as result`, [id]);
    return rows[0].result;
  }

  before(async () => {
    const pg = await import(pathToFileURL(resolve(process.env.SFSTORE_TEST_PG_MODULE)).href);
    Client = pg.Client ?? pg.default.Client;
    cluster = mkdtempSync(join(tmpdir(), "sfstore-atomic-product-db-"));
    mkdirSync(join(cluster, "data"));
    run("initdb", ["-D", join(cluster, "data"), "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--no-locale"]);
    const listener = createServer();
    await new Promise((done, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", done); });
    const port = listener.address().port;
    await new Promise((done) => listener.close(done));
    run("pg_ctl", ["-D", join(cluster, "data"), "-l", join(cluster, "postgres.log"), "-o",
      `-h 127.0.0.1 -p ${port} -c fsync=off -c statement_timeout=10000`, "-w", "start"]);
    started = true;
    connection = { host: "127.0.0.1", port, user: "postgres", database: "postgres" };
    db = new Client(connection);
    await db.connect();
    await db.query("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.query(readFileSync(join(root, "supabase", "schema.sql"), "utf8"));
    for (const file of readdirSync(join(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql") && name < migrationName).sort()) {
      await db.query(readFileSync(join(root, "supabase", "migrations", file), "utf8"));
    }
    await db.query("grant usage on schema public to service_role; grant all on all tables in schema public to service_role;");
    // Prove the migration itself does not mutate an existing aggregate or deployed image RPC.
    const id = randomUUID();
    await db.query("insert into categories(id,name,slug) values ($1,'Perfumes','perfumes')", [categoryId]);
    await db.query("insert into products(id,category_id,name,slug,short_description,price) values ($1,$2,'Before migration','before-migration','Before',1)", [id, categoryId]);
    await db.query("insert into product_attributes(product_id,name,value) values ($1,'Proveedor','Untouched legacy')", [id]);
    await db.query("insert into product_images(product_id,url,is_primary) values ($1,'https://fixture.invalid/unchanged.jpg',true)", [id]);
    const pre = await snapshot(id);
    const oldDelete = await db.query("select pg_get_functiondef('delete_product_image_metadata(uuid,uuid)'::regprocedure) as source");
    await db.query(migration);
    assert.deepEqual(await snapshot(id), pre);
    assert.deepEqual(await db.query("select pg_get_functiondef('delete_product_image_metadata(uuid,uuid)'::regprocedure) as source").then((r) => r.rows), oldDelete.rows);
    const empty = await db.query("select (select count(*) from product_save_operations)::int as operations, (select count(*) from product_storage_tasks)::int as tasks");
    assert.deepEqual(empty.rows[0], { operations: 0, tasks: 0 });
  });

  beforeEach(async () => {
    await db.query("reset role; drop trigger if exists fixture_attribute_failure on product_attributes; drop trigger if exists fixture_image_failure on product_images;");
    await db.query("truncate product_storage_tasks, product_save_operations, products, categories, suppliers, purchases restart identity cascade;");
    await db.query("insert into categories(id,name,slug) values ($1,'Perfumes','perfumes')", [categoryId]);
    await db.query("set role service_role");
  });

  after(async () => {
    if (db) await db.end();
    if (started) run("pg_ctl", ["-D", join(cluster, "data"), "-m", "immediate", "-w", "stop"]);
    if (cluster) {
      const safe = resolve(cluster);
      assert.ok(safe.startsWith(resolve(tmpdir()) + sep) && basename(safe).startsWith("sfstore-atomic-product-db-"));
      rmSync(safe, { recursive: true, force: true });
    }
  });

  test("create commits product, attributes, metadata and result together", async () => {
    const id = randomUUID(); const key = randomUUID(); const request = payload(id);
    request.images = [image(id), image(id, { is_primary: true })];
    const result = await rpc("create_product_atomic", [key, id, request]);
    const state = await snapshot(id);
    assert.equal(state.product.stock, 0);
    assert.equal(state.product.historical_identity, false);
    assert.equal(state.product.cost_source_purchase_item_id, null);
    assert.equal(state.attributes.length, 1);
    assert.equal(state.images.length, 2);
    assert.equal(state.images.filter((i) => i.is_primary)[0].id, request.images[1].id);
    assert.deepEqual(state.images.map((i) => i.sort_order).sort(), [0, 1]);
    assert.equal(result.version, await rpc("get_product_save_version", [id]));
    assert.equal((await rpc("resolve_product_save_operation", [key])).status, "committed");
  });

  test("attributes and images remain optional", async () => {
    const id = randomUUID(); const request = payload(id); delete request.attributes; delete request.images;
    const result = await rpc("create_product_atomic", [randomUUID(), id, request]);
    assert.equal(result.attributes_count, 0); assert.equal(result.images_count, 0);
  });

  for (const entity of ["attribute", "image"]) {
    for (const operation of ["create", "update"]) {
      test(`${operation}: injected ${entity} INSERT failure rolls back the entire aggregate`, async () => {
        const existing = operation === "update" ? await create() : null;
        const id = existing?.id ?? randomUUID(); const request = payload(id, { name: "Must roll back" });
        if (entity === "attribute") request.attributes[0].value = "fail-marker";
        else request.images = [image(id, { alt: "fail-marker" })];
        const pre = await snapshot(id); const key = randomUUID();
        await db.query("reset role");
        const table = entity === "attribute" ? "product_attributes" : "product_images";
        const field = entity === "attribute" ? "value" : "alt";
        await db.query(`create or replace function fixture_failure() returns trigger language plpgsql as $$ begin
          if new.${field} = 'fail-marker' then raise exception 'INJECTED_DB_FAILURE'; end if; return new; end; $$;
          create trigger fixture_${entity}_failure before insert on ${table} for each row execute function fixture_failure();`);
        await db.query("set role service_role");
        const args = operation === "create" ? [key, id, request] : [key, id, existing.result.version, request];
        await assert.rejects(rpc(`${operation}_product_atomic`, args), /INJECTED_DB_FAILURE/);
        assert.deepEqual(await snapshot(id), pre);
        assert.equal((await rpc("resolve_product_save_operation", [key])).status, "not_found");
      });
    }
  }

  test("identical retry returns exactly the stored result with no duplicate rows", async () => {
    const id = randomUUID(); const key = randomUUID(); const request = payload(id); request.images = [image(id)];
    const first = await rpc("create_product_atomic", [key, id, request]); const state = await snapshot(id);
    assert.deepEqual(await rpc("create_product_atomic", [key, id, request]), first);
    assert.deepEqual(await snapshot(id), state);
    request.product.name = "Different";
    await assert.rejects(rpc("create_product_atomic", [key, id, request]), /PRODUCT_IDEMPOTENCY_CONFLICT/);
    assert.deepEqual(await snapshot(id), state);
  });

  test("prepared failure survives, resolves safely, can be fenced and cannot later commit", async () => {
    const id = randomUUID(); const key = randomUUID(); const request = payload(id);
    request.attributes[0].name = "Unknown";
    await rpc("prepare_product_save_operation", [key, "create_product", id, request, null]);
    await assert.rejects(rpc("create_product_atomic", [key, id, request]), /PRODUCT_INVALID_ATTRIBUTE/);
    assert.equal((await rpc("resolve_product_save_operation", [key])).status, "prepared");
    assert.equal((await rpc("abort_product_save_operation", [key])).status, "aborted");
    await assert.rejects(rpc("create_product_atomic", [key, id, request]), /PRODUCT_OPERATION_ABORTED/);
    assert.equal((await snapshot(id)).product, null);
  });

  test("update preserves unmanaged legacy attributes and replaces only managed attributes", async () => {
    const { id, request } = await create();
    await db.query("insert into product_attributes(product_id,name,value) values ($1,'Proveedor','Legacy supplier'),($1,'decant_available','true'),($1,'Familia olfativa','Legacy family')", [id]);
    request.attributes = [{ name: "Tipo", value: "EDP", sort_order: 20 }, { name: "olfactory_family", value: "fresco" }];
    const version = await rpc("get_product_save_version", [id]);
    const result = await rpc("update_product_atomic", [randomUUID(), id, version, request]);
    const state = await snapshot(id);
    assert.deepEqual(state.attributes.map((a) => a.name).sort(), ["Tipo", "olfactory_family", "Proveedor", "decant_available", "Familia olfativa"].sort());
    assert.equal(result.version, await rpc("get_product_save_version", [id]));
  });

  test("same update retry is idempotent even though its expected version is now old", async () => {
    const { id, request, result } = await create(); const key = randomUUID(); request.product.name = "Edited";
    const first = await rpc("update_product_atomic", [key, id, result.version, request]); const state = await snapshot(id);
    assert.deepEqual(await rpc("update_product_atomic", [key, id, result.version, request]), first);
    assert.deepEqual(await snapshot(id), state);
  });

  test("stale aggregate versions reject both product edits and legacy attribute/gallery changes", async () => {
    const { id, request, result } = await create(); const pre = await snapshot(id);
    await assert.rejects(rpc("update_product_atomic", [randomUUID(), id, "0".repeat(64), request]), /PRODUCT_STALE_VERSION/);
    assert.deepEqual(await snapshot(id), pre);
    await db.query("insert into product_attributes(product_id,name,value) values ($1,'Proveedor','Changed')", [id]);
    await assert.rejects(rpc("update_product_atomic", [randomUUID(), id, result.version, request]), /PRODUCT_STALE_VERSION/);
    const next = await rpc("get_product_save_version", [id]);
    await db.query("insert into product_images(product_id,url,is_primary) values ($1,'https://fixture.invalid/legacy.jpg',true)", [id]);
    await assert.rejects(rpc("update_product_atomic", [randomUUID(), id, next, request]), /PRODUCT_STALE_VERSION/);
  });

  test("aggregate version is independent of the caller timezone and preserves UTF-8 data", async () => {
    const description = "sensaci\u00f3n, busc\u00e1s, acompa\u00f1e, seg\u00fan, ocasi\u00f3n";
    const { id } = await create({ description });
    await db.query("set timezone = 'UTC'"); const version = await rpc("get_product_save_version", [id]);
    await db.query("set timezone = 'America/Argentina/Buenos_Aires'");
    assert.equal(await rpc("get_product_save_version", [id]), version);
    assert.equal((await snapshot(id)).product.description, description);
    await db.query("set timezone = 'UTC'");
  });

  test("historical identities reject updates without mutating anything", async () => {
    const id = randomUUID();
    await db.query("insert into products(id,category_id,name,slug,short_description,price,historical_identity,historical_group_key,status) values ($1,$2,'Historical','historical',null,null,true,'fixture-historical','archived')", [id, categoryId]);
    const pre = await snapshot(id); const version = await rpc("get_product_save_version", [id]);
    await assert.rejects(rpc("update_product_atomic", [randomUUID(), id, version, payload(id)]), /HISTORICAL_PRODUCT_IDENTITY_IMMUTABLE/);
    assert.deepEqual(await snapshot(id), pre);
  });

  test("cost provenance survives equal rounded cost and is cleared only for a changed cost", async () => {
    const { id, request } = await create();
    await db.query("insert into suppliers(id,name,normalized_name) values ($1,'Fixture supplier','fixture-supplier')", [supplierId]);
    await db.query("insert into purchases(id,supplier_id,supplier_name_snapshot,purchase_date) values ($1,$2,'Fixture supplier','2026-01-01')", [purchaseId, supplierId]);
    await db.query(`insert into purchase_items(id,purchase_id,product_id,product_name_snapshot,product_slug_snapshot,
      quantity,unit_purchase_cost,supplier_line_total,allocated_shipping_total,allocated_shipping_per_unit,effective_unit_cost,effective_line_total)
      values ($1,$2,$3,'Fixture','fixture',1,10,10,0,0,10,10)`, [purchaseItemId, purchaseId, id]);
    await db.query("update products set cost_source_purchase_item_id=$2,stock=7 where id=$1", [id, purchaseItemId]);
    request.product.cost = 10.001;
    await rpc("update_product_atomic", [randomUUID(), id, await rpc("get_product_save_version", [id]), request]);
    assert.equal((await snapshot(id)).product.cost_source_purchase_item_id, purchaseItemId);
    request.product.cost = 11;
    await rpc("update_product_atomic", [randomUUID(), id, await rpc("get_product_save_version", [id]), request]);
    assert.equal((await snapshot(id)).product.cost_source_purchase_item_id, null);
    assert.equal((await snapshot(id)).product.stock, 7);
  });

  test("images normalize array order, choose one primary and reject duplicate IDs/paths/content", async () => {
    for (const duplicate of ["id", "url", "path", "content_hash", "primary"]) {
      const id = randomUUID(); const request = payload(id); const one = image(id); const two = image(id);
      if (duplicate === "primary") one.is_primary = two.is_primary = true;
      else two[duplicate] = one[duplicate];
      request.images = [one, two];
      await assert.rejects(rpc("create_product_atomic", [randomUUID(), id, request]), /PRODUCT_(DUPLICATE_IMAGE_OR_PRIMARY|INVALID_IMAGE_MANIFEST)/);
      assert.equal((await snapshot(id)).product, null);
    }
    const id = randomUUID(); const request = payload(id); request.images = [image(id), image(id)];
    await rpc("create_product_atomic", [randomUUID(), id, request]); const state = await snapshot(id);
    assert.equal(state.images.filter((i) => i.is_primary)[0].id, request.images[0].id);
    assert.deepEqual(state.images.map((i) => i.sort_order).sort(), [0, 1]);
  });

  test("missing image payload preserves metadata exactly, explicit [] requires durable cleanup", async () => {
    const id = randomUUID(); const request = payload(id); const original = image(id); request.images = [original];
    await rpc("create_product_atomic", [randomUUID(), id, request]); const state = await snapshot(id);
    delete request.images;
    await rpc("update_product_atomic", [randomUUID(), id, await rpc("get_product_save_version", [id]), request]);
    assert.deepEqual((await snapshot(id)).images, state.images);
    request.images = [];
    await assert.rejects(rpc("update_product_atomic", [randomUUID(), id, await rpc("get_product_save_version", [id]), request]), /PRODUCT_STORAGE_TASK_REQUIRED/);
    request.storage_tasks = [{ action: "delete_object", path: original.path, image_id: original.id,
      expected_metadata: { path: original.path, size: original.size, mime: original.mime, content_hash: original.content_hash } }];
    const key = randomUUID(); const version = await rpc("get_product_save_version", [id]);
    const result = await rpc("update_product_atomic", [key, id, version, request]);
    assert.equal((await snapshot(id)).images.length, 0);
    const tasks = await db.query("select status,attempts from product_storage_tasks");
    assert.deepEqual(tasks.rows, [{ status: "pending", attempts: 0 }]);
    assert.deepEqual(await rpc("update_product_atomic", [key, id, version, request]), result);
    assert.equal((await db.query("select count(*)::int as n from product_storage_tasks")).rows[0].n, 1);
  });

  test("queue creation is idempotent, conflicting expectations abort and referenced paths cannot be deleted", async () => {
    const id = randomUUID(); const key = randomUUID(); const request = payload(id);
    await rpc("prepare_product_save_operation", [key, "create_product", id, request, null]);
    const path = `products/${id}/pending.webp`; const metadata = { path, etag: "fixture-hash", size: 1234, mime: "image/webp" };
    const args = [key, id, "reconcile", path, metadata, null];
    const first = await rpc("enqueue_product_storage_task", args);
    assert.equal(await rpc("enqueue_product_storage_task", args), first);
    await assert.rejects(rpc("enqueue_product_storage_task", [...args.slice(0, 4), { ...metadata, size: 2 }, null]), /PRODUCT_STORAGE_TASK_CONFLICT/);
    const created = await create();
    await db.query("insert into product_images(product_id,url,is_primary) values ($1,$2,true)", [created.id, `https://fixture.invalid/storage/v1/object/public/product-images/${path}`]);
    await assert.rejects(rpc("enqueue_product_storage_task", [key, id, "delete_object", path, metadata, null]), /PRODUCT_STORAGE_DELETE_NOT_UNREFERENCED/);
  });

  test("invalid cleanup task rolls back product, attributes and metadata", async () => {
    const { id, request, result } = await create(); const pre = await snapshot(id);
    request.product.name = "Must roll back";
    request.storage_tasks = [{ action: "delete_everything", path: "invalid", expected_metadata: { path: "invalid" } }];
    await assert.rejects(rpc("update_product_atomic", [randomUUID(), id, result.version, request]), /PRODUCT_INVALID_STORAGE_TASK/);
    assert.deepEqual(await snapshot(id), pre);
  });

  test("forbidden operational fields and duplicate attributes cannot enter the save", async () => {
    for (const field of ["stock", "historical_identity", "cost_source_purchase_item_id"]) {
      const id = randomUUID(); const request = payload(id); request.product[field] = 1;
      await assert.rejects(rpc("create_product_atomic", [randomUUID(), id, request]), /PRODUCT_INVALID_FIELDS/);
    }
    const id = randomUUID(); const request = payload(id); request.attributes.push({ ...request.attributes[0] });
    await assert.rejects(rpc("create_product_atomic", [randomUUID(), id, request]), /PRODUCT_DUPLICATE_ATTRIBUTE/);
  });

  test("existing SKU/slug constraints and nonnegative prices roll back a rejected create", async () => {
    const original = await create({ sku: "FIXTURE-SKU" });
    for (const change of [{ sku: "FIXTURE-SKU" }, { slug: original.request.product.slug }, { price: -0.001 }]) {
      const id = randomUUID(); const key = randomUUID();
      await assert.rejects(rpc("create_product_atomic", [key, id, payload(id, change)]), /unique constraint|PRODUCT_INVALID_MONEY/);
      assert.equal((await snapshot(id)).product, null);
      assert.equal((await rpc("resolve_product_save_operation", [key])).status, "not_found");
    }
  });

  test("an image owned by a different product cannot be reassigned or modified", async () => {
    const id = randomUUID(); const request = payload(id); const owned = image(id); request.images = [owned];
    await rpc("create_product_atomic", [randomUUID(), id, request]); const pre = await snapshot(id);
    const otherId = randomUUID(); const other = payload(otherId); other.images = [{ ...owned, alt: "Must not change" }];
    await assert.rejects(rpc("create_product_atomic", [randomUUID(), otherId, other]), /PRODUCT_IMAGE_ID_CONFLICT/);
    assert.deepEqual(await snapshot(id), pre);
    assert.equal((await snapshot(otherId)).product, null);
  });

  test("removing shared image metadata leaves its other reference intact and never queues deletion", async () => {
    const id = randomUUID(); const request = payload(id); const shared = image(id); request.images = [shared];
    await rpc("create_product_atomic", [randomUUID(), id, request]);
    const other = await create();
    await db.query("insert into product_images(product_id,url,is_primary) values ($1,$2,true)", [other.id, shared.url]);
    const pre = await snapshot(other.id); request.images = [];
    await rpc("update_product_atomic", [randomUUID(), id, await rpc("get_product_save_version", [id]), request]);
    assert.deepEqual(await snapshot(other.id), pre);
    assert.equal((await db.query("select count(*)::int as n from product_storage_tasks")).rows[0].n, 0);
  });

  test("DB attribute options and multiplicity agree with the versioned form configuration", async () => {
    const source = readFileSync(join(root, "lib/catalog/attribute-config.ts"), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const config = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    for (const slug of ["perfumes", "mates"]) {
      await db.query("update categories set slug=$2 where id=$1", [categoryId, slug]);
      for (const field of config.getAttributeFieldsForCategory(slug)) {
        for (const option of field.options) {
          const id = randomUUID(); const request = payload(id); request.attributes = [{ name: field.key, value: option.value }];
          await rpc("create_product_atomic", [randomUUID(), id, request]);
        }
        const id = randomUUID(); const request = payload(id); request.attributes = field.options.slice(0, 2).map((o) => ({ name: field.key, value: o.value }));
        if (field.multiple) await rpc("create_product_atomic", [randomUUID(), id, request]);
        else await assert.rejects(rpc("create_product_atomic", [randomUUID(), id, request]), /PRODUCT_DUPLICATE_ATTRIBUTE/);
      }
    }
  });

  test("two actual concurrent transactions with the same version allow exactly one update", async () => {
    const { id, request, result } = await create(); const left = new Client(connection); const right = new Client(connection);
    await left.connect(); await right.connect();
    try {
      await left.query("begin; set local role service_role");
      await right.query("begin; set local role service_role");
      const rightPid = (await right.query("select pg_backend_pid() as pid")).rows[0].pid;
      const first = await rpc("update_product_atomic", [randomUUID(), id, result.version, request], left);
      const pending = rpc("update_product_atomic", [randomUUID(), id, result.version, { ...request, product: { ...request.product, name: "Concurrent" } }], right)
        .then((value) => ({ value }), (error) => ({ error }));
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        await db.query("reset role");
        const activity = await db.query("select wait_event_type from pg_stat_activity where pid=$1", [rightPid]);
        if (activity.rows[0]?.wait_event_type === "Lock") { blocked = true; break; }
        await new Promise((done) => setTimeout(done, 10));
      }
      assert.equal(blocked, true, "second transaction really waited on a PostgreSQL row lock");
      await left.query("commit"); const second = await pending;
      assert.match(second.error?.message ?? "", /PRODUCT_STALE_VERSION/);
      await right.query("rollback");
      assert.equal(await rpc("get_product_save_version", [id]), first.version);
      assert.equal((await snapshot(id)).product.name, request.product.name);
    } finally {
      await left.query("rollback"); await right.query("rollback"); await left.end(); await right.end();
      await db.query("set role service_role");
    }
  });

  test("RPCs/tables are service-only and existing updated_at behavior remains installed", async () => {
    await db.query("reset role");
    const { rows } = await db.query(`select p.oid::regprocedure::text as signature, p.prosecdef,
      p.proconfig, has_function_privilege('service_role',p.oid,'EXECUTE') as service,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,
      exists(select 1 from aclexplode(p.proacl) where grantee=0 and privilege_type='EXECUTE') as public
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in ('get_product_save_version','prepare_product_save_operation','resolve_product_save_operation',
        'abort_product_save_operation','enqueue_product_storage_task','save_product_atomic_internal','create_product_atomic','update_product_atomic')`);
    assert.equal(rows.length, 8);
    for (const row of rows) {
      assert.equal(row.prosecdef, false); assert.ok(row.proconfig.includes("search_path=pg_catalog, public"));
      assert.equal(row.service, true); assert.equal(row.anon, false); assert.equal(row.authenticated, false); assert.equal(row.public, false);
    }
    for (const role of ["anon", "authenticated"]) {
      await db.query(`set role ${role}`);
      await assert.rejects(rpc("get_product_save_version", [randomUUID()]), /permission denied/);
      await assert.rejects(db.query("select * from product_save_operations"), /permission denied/);
      await assert.rejects(db.query("select * from product_storage_tasks"), /permission denied/);
      await db.query("reset role");
    }
    const tables = await db.query("select relname,relrowsecurity from pg_class where relname in ('product_save_operations','product_storage_tasks')");
    assert.ok(tables.rows.every((r) => r.relrowsecurity));
    for (const table of ["product_save_operations", "product_storage_tasks"]) {
      const grants = await db.query("select has_table_privilege('service_role',$1,'SELECT,INSERT,UPDATE') as write, has_table_privilege('service_role',$1,'DELETE') as delete", [table]);
      assert.equal(grants.rows[0].write, true); assert.equal(grants.rows[0].delete, false);
    }
    assert.equal((await db.query("select count(*)::int as n from pg_trigger where tgname='set_products_updated_at' and not tgisinternal")).rows[0].n, 1);
  });
});
