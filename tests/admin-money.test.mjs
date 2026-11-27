import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { adminMoney, adminMoneyFromCents } from "../lib/admin/money.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const nbsp = (text) => text.replace(/ /g, " ");

test("admin amounts keep the cents in Argentine format", () => {
  assert.equal(nbsp(adminMoney(16000)), "$ 16.000,00");
  assert.equal(nbsp(adminMoney("107852.73")), "$ 107.852,73");
  assert.equal(nbsp(adminMoneyFromCents(1234567)), "$ 12.345,67");
});

test("admin screens share one money formatter instead of their own copies", () => {
  const files = [
    "app/admin/analytics/page.tsx", "app/admin/compras/[id]/page.tsx", "app/admin/page.tsx", "app/admin/pedidos/page.tsx",
    "app/admin/pedidos/[id]/page.tsx", "app/admin/proveedores/page.tsx", "app/admin/proveedores/[id]/page.tsx",
    "app/admin/ventas/[id]/page.tsx", "components/admin/commercial-history-ui.tsx",
    "components/admin/consulta/consultation-product-card.tsx", "components/admin/consulta/product-quick-actions.tsx",
    "components/admin/orders/customer-order-form.tsx", "components/admin/products/product-form.tsx",
    "components/admin/purchases/charger-components-preview.tsx", "components/admin/purchases/purchase-draft-form.tsx",
    "components/admin/sales/store-sale-form.tsx", "components/admin/products/family-forms.tsx",
    "app/admin/productos/familias/page.tsx", "app/admin/productos/familias/[id]/page.tsx",
  ];
  for (const file of files) {
    const text = source(file);
    assert.doesNotMatch(text, /Intl\.NumberFormat\("es-AR",\s*\{\s*style:\s*"currency"/, file);
    assert.match(text, /from "@\/lib\/admin\/money"/, file);
  }
});
