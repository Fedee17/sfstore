import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseMoneyInputCents } from "../lib/money-input.ts";
import { parseStoreSalePaymentAmount, parseStoreSaleUnitPrice } from "../lib/store-sales.ts";
import { parseMoneyToCents } from "../lib/purchases/calculation.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin money input reads Argentine thousands and decimal separators", () => {
  const cases = {
    "15000": 1500000n,
    "15.000": 1500000n,
    "1.500.000": 150000000n,
    "15.000,50": 1500050n,
    "15000,5": 1500050n,
    "15000.50": 1500050n,
    " 12.500,50 ": 1250050n,
    "0": 0n,
    "0,5": 50n,
  };
  for (const [text, cents] of Object.entries(cases)) assert.equal(parseMoneyInputCents(text), cents, text);
});

test("admin money input rejects ambiguous or invalid amounts instead of guessing", () => {
  for (const text of ["", "-1", "abc", "1,5,0", "15.00.0", "15000.001", "15,000", "1.50.000", "NaN", "Infinity", "15 000", "15.000,505"]) {
    assert.equal(parseMoneyInputCents(text), null, text);
  }
});

test("store sales, customer orders and purchases share the same reading", () => {
  assert.equal(parseStoreSalePaymentAmount("15.000"), 15000);
  assert.equal(parseStoreSaleUnitPrice("12.500,50"), 12500.5);
  assert.equal(parseMoneyToCents("15.000"), 1500000);
  for (const file of ["components/admin/sales/store-sale-form.tsx", "components/admin/orders/customer-order-form.tsx", "app/admin/pedidos/actions.ts"]) {
    assert.match(source(file), /parseMoneyInputCents/, file);
    assert.doesNotMatch(source(file), /Number\([^)]*replace\(",", "\."\)/, file);
  }
});
