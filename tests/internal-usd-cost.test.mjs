import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fetchMepQuote, parseProfitPercent, parseUsdCost, usdCostInArs } from "../lib/admin/internal-usd-cost.ts";

test("el costo en dólares se conserva y su equivalente cambia con la cotización de venta", async () => {
  const cost = parseUsdCost("11,00");
  for (const [venta, expected] of [[1661.9, 1_828_090n], [1700.125, 1_870_138n]]) {
    const quote = await fetchMepQuote(async (url) => {
      assert.equal(url, "https://dolarapi.com/v1/dolares/bolsa");
      return Response.json({ moneda: "USD", casa: "bolsa", compra: 1647, venta, fechaActualizacion: "2026-11-27T20:59:00Z" });
    });
    assert.equal(usdCostInArs(cost, quote), expected);
  }
  assert.equal(cost, 11);
  assert.equal(usdCostInArs(parseUsdCost("10"), { rate: 1661.9 }), 1_661_900n);
});

test("los costos inválidos y las cotizaciones fallidas no se convierten", async () => {
  for (const input of ["", "-1", "0", "1.234", "1e3", "NaN"]) {
    assert.throws(() => parseUsdCost(input));
  }
  for (const reply of [
    () => new Response(null, { status: 502 }),
    () => Response.json({ moneda: "USD", casa: "bolsa", venta: 0 }),
    () => Response.json({ moneda: "USD", casa: "oficial", venta: 1600, fechaActualizacion: "2026-11-27T20:59:00Z" }),
    () => { throw new Error("timeout"); },
  ]) {
    assert.equal(await fetchMepQuote(async () => reply()), null);
  }
});

test("la ganancia puede omitirse y admite el separador decimal local", () => {
  assert.equal(parseProfitPercent(""), null);
  assert.equal(parseProfitPercent("0"), 0);
  assert.equal(parseProfitPercent("25,125"), 25.125);
  assert.throws(() => parseProfitPercent("-1"));
});

const runtimePath = process.env.SFSTORE_TEST_PGLITE_MODULE;
test("PostgreSQL guarda el costo y la ganancia sin exponerlos ni cambiar el producto", { skip: !runtimePath }, async () => {
  const { PGlite } = createRequire(join(runtimePath, "package.json"))("@electric-sql/pglite");
  const db = new PGlite();
  const id = randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.products (id uuid primary key, price integer, stock integer, web_visible boolean, commercial_blocked boolean);`);
    await db.query("insert into public.products values ($1, 0, 2, false, true)", [id]);
    await db.exec(readFileSync(new URL("../supabase/migrations/202611290003_internal_product_usd_costs.sql", import.meta.url), "utf8"));
    await db.exec("set role service_role");
    await db.query("insert into public.internal_product_usd_costs values ($1, 11, null)", [id]);
    await db.query(`insert into public.internal_product_usd_costs values ($1, 11, 40)
      on conflict (product_id) do update set target_profit_percent = excluded.target_profit_percent`, [id]);
    const { rows } = await db.query("select unit_cost_usd, target_profit_percent from public.internal_product_usd_costs");
    assert.deepEqual(rows, [{ unit_cost_usd: "11.00", target_profit_percent: "40.0000" }]);
    await assert.rejects(db.query("update public.internal_product_usd_costs set unit_cost_usd = 0"), /check constraint/);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from public.internal_product_usd_costs"), /permission denied/);
      await assert.rejects(db.query("update public.internal_product_usd_costs set unit_cost_usd = 10"), /permission denied/);
    }
    await db.exec("reset role");
    const product = await db.query("select price, stock, web_visible, commercial_blocked from public.products where id = $1", [id]);
    assert.deepEqual(product.rows, [{ price: 0, stock: 2, web_visible: false, commercial_blocked: true }]);
  } finally {
    await db.close();
  }
});
