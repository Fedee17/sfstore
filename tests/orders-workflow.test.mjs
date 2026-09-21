import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");
const migration = source("supabase", "migrations", "202609210001_orders_workflow.sql");
const actions = source("app", "admin", "pedidos", "actions.ts");
const service = source("services", "customer-orders.ts");
const listPage = source("app", "admin", "pedidos", "page.tsx");
const newPage = source("app", "admin", "pedidos", "nuevo", "page.tsx");
const detailPage = source("app", "admin", "pedidos", "[id]", "page.tsx");
const editPage = source("app", "admin", "pedidos", "[id]", "editar", "page.tsx");
const form = source("components", "admin", "orders", "customer-order-form.tsx");
const actionsUi = source("components", "admin", "orders", "customer-order-actions.tsx");
const webhook = source("app", "api", "mercadopago", "webhook", "route.ts");
const storeService = source("services", "store-sales.ts");
const checkoutService = source("services", "orders.ts");
const workflow = await import(pathToFileURL(join(root, "lib", "orders", "workflow.ts")).href);

test("all order pages and mutations require admin authorization", () => {
  for (const page of [listPage, newPage, detailPage, editPage]) assert.match(page, /await requireAdminSession\(\)/);
  assert.equal(actions.match(/await requireAdminActionSession\(\)/g)?.length, 4);
});

test("customer orders use channel order and require a customer", () => {
  assert.match(migration, /insert into orders[\s\S]+['"]order['"]/i);
  assert.match(migration, /CUSTOMER_ORDER_CUSTOMER_REQUIRED/i);
  assert.match(migration, /orders_order_customer_name_check/i);
});

test("empty and malformed item lists are rejected", () => {
  assert.match(migration, /jsonb_array_length\(p_items\) = 0[\s\S]+CUSTOMER_ORDER_NO_ITEMS/i);
  assert.match(migration, /quantity <= 0[\s\S]+quantity <> trunc\(quantity\)/i);
  assert.throws(() => workflow.validateCustomerOrderItems([]), /al menos un producto/i);
});

test("creation and editing are atomic and preserve agreed snapshots", () => {
  assert.match(migration, /create or replace function save_customer_order/i);
  assert.match(migration, /insert into order_items[\s\S]+product\.name[\s\S]+round\(item\.unit_price/i);
  assert.match(service, /\.rpc\("save_customer_order"/i);
});

test("saving an order never reserves or changes stock", () => {
  const saveBlock = migration.slice(migration.indexOf("create or replace function save_customer_order"), migration.indexOf("create or replace function transition_customer_order"));
  assert.doesNotMatch(saveBlock, /update products|insert into inventory_movements/i);
  assert.match(form, /no reserva ni descuenta inventario/i);
});

test("partial and full payments do not touch inventory", () => {
  assert.match(actions, /El stock no fue reservado ni descontado/i);
  assert.match(actions, /El stock no se descuenta hasta la entrega/i);
  assert.doesNotMatch(actions, /decreaseStockForOrder|apply_sale_inventory/i);
  assert.doesNotMatch(service.slice(service.indexOf("addCustomerOrderPayment"), service.indexOf("transitionCustomerOrder")), /products|inventory_movements/i);
});

test("ready is a pure operational transition", () => {
  const transitionBlock = migration.slice(migration.indexOf("create or replace function transition_customer_order"), migration.indexOf("create or replace function deliver_order"));
  assert.match(transitionBlock, /ordered['"] and p_next_status in \(['"]ready/i);
  assert.doesNotMatch(transitionBlock, /update products|inventory_movements|apply_sale_inventory/i);
});

test("delivery requires ready and paid", () => {
  assert.match(migration, /v_order\.status <> 'ready'[\s\S]+CUSTOMER_ORDER_NOT_READY/i);
  assert.match(migration, /v_order\.payment_status <> 'paid'[\s\S]+CUSTOMER_ORDER_PAYMENT_INCOMPLETE/i);
  assert.match(actionsUi, /disabled=\{paymentStatus !== "paid"\}/i);
});

test("delivery delegates stock validation and movements to atomic sale inventory", () => {
  assert.match(migration, /select apply_sale_inventory\(p_order_id, p_delivered_by\)/i);
  assert.match(migration, /update orders set status = 'delivered'/i);
  assert.doesNotMatch(service.slice(service.indexOf("deliverCustomerOrder")), /\.from\("products"\)|inventory_movements/i);
});

test("double delivery is idempotent", () => {
  assert.match(migration, /if v_order\.status = 'delivered'[\s\S]+'already_delivered'/i);
  assert.match(migration, /'movements_created', 0/i);
});

test("terminal orders are read-only for edits and payments", () => {
  assert.match(migration, /status in \('delivered', 'cancelled'\)[\s\S]+CUSTOMER_ORDER_READ_ONLY/i);
  assert.match(service, /isCustomerOrderEditable\(order\.status\)/i);
  assert.match(editPage, /isCustomerOrderEditable/i);
});

test("editing cannot reduce total below approved payments", () => {
  assert.match(migration, /v_total < v_total_paid[\s\S]+CUSTOMER_ORDER_TOTAL_BELOW_PAID/i);
});

test("multiple idempotent payments use the shared ledger", () => {
  assert.match(service, /return addOrderPayment\(\{ \.\.\.input, status: "approved" \}\)/i);
  assert.match(actions, /order:\$\{orderId\}:payment:\$\{paymentKey\}/i);
  assert.match(detailPage, /paymentSequence=\{order\.order_payments\.length \+ 1\}/i);
});

test("list exposes balances and operational filters", () => {
  assert.match(service, /calculateOrderPaymentSummary/i);
  assert.match(listPage, /remainingAmount/i);
  assert.match(listPage, /name="status"/i);
  assert.match(listPage, /name="paymentStatus"/i);
});

test("search covers customer phone order number and products", () => {
  assert.match(service, /order\.customer_name[\s\S]+order\.customer_phone[\s\S]+order\.order_number[\s\S]+item\.product_name/i);
  assert.match(listPage, /Cliente, telefono o producto/i);
});

test("WhatsApp links are normalized safely", () => {
  assert.equal(workflow.getWhatsAppUrl("+54 9 11-2345-6789"), "https://wa.me/5491123456789");
  assert.equal(workflow.getWhatsAppUrl(""), null);
  assert.match(detailPage, /Contactar/i);
});

test("commercial status graph stays separate from payment status", () => {
  assert.deepEqual(workflow.CUSTOMER_ORDER_TRANSITIONS.pending, ["ordered", "cancelled"]);
  assert.deepEqual(workflow.CUSTOMER_ORDER_TRANSITIONS.ordered, ["ready", "cancelled"]);
  assert.deepEqual(workflow.CUSTOMER_ORDER_TRANSITIONS.delivered, []);
  assert.match(detailPage, /order\.payment_status/i);
});

test("product picker includes active zero-stock products", () => {
  assert.match(service, /from\("products"\)[\s\S]+\.eq\("status", "active"\)/i);
  assert.doesNotMatch(service, /\.gt\("stock", 0\)/i);
  assert.match(form, /Puede incluir productos sin stock/i);
});

test("the list uses compact commercial product names", () => {
  assert.equal(workflow.getCustomerOrderDisplayName("SF-P-1", [{ product_name: "Perfume" }]), "Perfume");
  assert.equal(workflow.getCustomerOrderDisplayName("SF-P-1", [{ product_name: "Perfume" }, { product_name: "Mate" }]), "Perfume + 1 producto");
  assert.equal(workflow.getCustomerOrderDisplayName("SF-P-1", []), "SF-P-1");
});

test("RPCs are service-role only", () => {
  for (const name of ["save_customer_order", "transition_customer_order", "deliver_order"]) {
    assert.match(migration, new RegExp(`revoke all on function ${name}[\\s\\S]+public, anon, authenticated`, "i"));
    assert.match(migration, new RegExp(`grant execute on function ${name}[\\s\\S]+service_role`, "i"));
  }
});

test("Mercado Pago never auto-applies inventory to order channel", () => {
  assert.match(webhook, /order\.channel === "web"[\s\S]+decreaseStockForOrder/i);
  assert.match(webhook, /paymentStatus === "paid" && order\.channel === "web"[\s\S]+updatePayload\.status = "paid"/i);
});

test("store sales remain on their existing channel and completion service", () => {
  assert.match(storeService, /create_store_sale/i);
  assert.match(storeService, /complete_store_sale/i);
});

test("web checkout remains explicitly channel web", () => {
  assert.match(checkoutService, /channel: "web"/i);
});

test("detail shows products payments balance notes and movements", () => {
  for (const text of ["Productos", "Pagos", "Saldo", "Notas", "Movimientos de inventario"]) assert.match(detailPage, new RegExp(text, "i"));
});

test("the workflow adds no reservation model", () => {
  const implementation = [migration, actions, service].join("\n");
  assert.doesNotMatch(implementation, /stock_reserved|movement_type\s*=\s*['"]reservation|['"]release['"]/i);
});
