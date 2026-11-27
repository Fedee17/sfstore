import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";

const runtimePath = process.env.SFSTORE_TEST_PGLITE_MODULE;
const read = file => readFileSync(join(import.meta.dirname, "..", file), "utf8");

test("una venta histórica se registra una vez, conserva 2 unidades y no habilita la ficha", { skip: !runtimePath }, async () => {
  const runtime = createRequire(join(runtimePath, "package.json"));
  const { PGlite } = runtime("@electric-sql/pglite");
  const { pgcrypto } = runtime("@electric-sql/pglite/contrib/pgcrypto");
  const db = new PGlite({ extensions: { pgcrypto } });
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(read("tests/fixtures/storage-permissions.sql"));
    for (const entry of JSON.parse(read("staging/migration-manifest.json")).applicationOrder) {
      try { await db.exec(read(entry.stagingFile)); } catch (error) { throw new Error(entry.source + ": " + error.message); }
    }
    const category = randomUUID();
    const actor = randomUUID();
    await db.query("insert into public.categories(id, name, slug) values ($1, 'Sintética', 'sintetica')", [category]);
    await db.exec("set role service_role");
    const { id } = await one(`insert into public.products
      (category_id, name, slug, status, historical_identity, web_visible, commercial_blocked, stock, price, short_description)
      values ($1, 'Inventario sintético', 'inventario-interno-sintetico', 'draft', false, false, true, 0, 0, '') returning id`, [category]);
    await one("select public.adjust_inventory_stock($1, 2, 'Conteo físico inicial', $2)", [id, actor]);
    const { id: batch } = await one(`insert into public.historical_import_batches(source_file,source_sha256,imported_by)
      values ('Administrador · ventas realizadas', repeat('a', 64), $1)
      on conflict (source_sha256) do nothing returning id`, [actor]);
    const record = () => one(`select public.import_historical_sale($1, 'Carga manual', 1, repeat('b', 64),
      '2026-11-26', 'Venta ya realizada', $2::jsonb) as result`,
    [batch, JSON.stringify([{ product_id: id, quantity: 1, unit_price: 123, source_total: 123 }])]);
    const first = (await record()).result;
    const retry = (await record()).result;
    assert.equal(first.operation, "imported");
    assert.equal(retry.operation, "already_imported");
    assert.equal(retry.order_id, first.order_id);
    await assert.rejects(
      one("select public.create_store_sale_atomic($1,$2,null,null,$3::jsonb,$4::jsonb)", [
        randomUUID(),
        actor,
        JSON.stringify([{ product_id: id, quantity: 1, unit_price: 123 }]),
        JSON.stringify([{ method: "cash", amount: 123 }]),
      ]),
      /VARIANT_COMMERCIALLY_BLOCKED/,
    );
    assert.deepEqual(await one(`select p.stock, o.historical_import, o.affects_inventory, o.total, i.quantity,
      (select count(*)::int from public.order_items oi where product_id = p.id) as historical_lines,
      (select count(*)::int from public.inventory_movements m where product_id = p.id) as movements,
      (select count(*)::int from public.public_catalog_skus s where s.id = p.id) as public_rows
      from public.products p join public.order_items i on i.product_id = p.id
      join public.orders o on o.id = i.order_id where p.id = $1`, [id]),
    { stock: 2, historical_import: true, affects_inventory: false, total: "123.00", quantity: 1, historical_lines: 1, movements: 1, public_rows: 0 });
  } finally {
    await db.close();
  }
});
