import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const moduleSource = readFileSync(
  join(testDirectory, "..", "lib", "product-import", "confirmation.ts"),
  "utf8",
);
const compiledModule = ts.transpileModule(moduleSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { runProductImportConfirmation } = await import(
  `data:text/javascript;base64,${Buffer.from(compiledModule).toString("base64")}`
);

const row = (action, canImport = false) => ({
  action,
  rowState: action === "error" ? "error" : action,
  canImport,
  excludedFromImport: !canImport,
  sourceSheet: "Precios Productos",
  rowNumber: 1,
  slug: `product-${action}`,
});

const emptyResult = {
  created: 0,
  updated: 0,
  unchanged: 0,
  review: 0,
  omittedErrors: 0,
  omittedDuplicates: 0,
};

test("confirmation reaches the service with only importable updates", async () => {
  const rows = [
    row("update", true),
    row("unchanged"),
    row("review"),
    row("duplicate"),
    { ...row("blocked"), rowState: "blocked" },
    row("error"),
  ];
  let receivedRows = [];
  const state = await runProductImportConfirmation(
    JSON.stringify(rows),
    "google",
    async (received) => {
      receivedRows = received;
      return { ...emptyResult, updated: 1 };
    },
  );

  assert.deepEqual(receivedRows.map((item) => item.action), ["update"]);
  assert.equal(state.status, "success");
  assert.match(state.message, /1 actualizado/);
  assert.match(state.message, /1 en revisión/);
  assert.match(state.message, /1 duplicado/);
  assert.match(state.message, /1 bloqueado/);
  assert.match(state.message, /1 inválido/);
});

test("an action error is returned as visible error state", async () => {
  const state = await runProductImportConfirmation(
    JSON.stringify([row("update", true)]),
    "google",
    async () => {
      throw new Error("Fallo controlado");
    },
  );
  assert.deepEqual(state, { status: "error", message: "Fallo controlado" });
});

test("a successful action returns visible success state", async () => {
  const state = await runProductImportConfirmation(
    JSON.stringify([row("update", true)]),
    "google",
    async () => ({ ...emptyResult, updated: 1 }),
  );
  assert.equal(state.status, "success");
  assert.match(state.message, /^Sincronización completada:/);
});

test("no confirmable rows never invoke the service", async () => {
  let calls = 0;
  const state = await runProductImportConfirmation(
    JSON.stringify([row("review"), row("duplicate")]),
    "google",
    async () => {
      calls += 1;
      return emptyResult;
    },
  );
  assert.equal(calls, 0);
  assert.equal(state.status, "error");
});

test("the confirmation UI exposes pending feedback and prevents duplicate submits", () => {
  const component = readFileSync(
    join(testDirectory, "..", "components", "admin", "products", "product-import-tool.tsx"),
    "utf8",
  );
  assert.match(component, /isConfirmPending\s*\? "Sincronizando\.\.\."/);
  assert.match(component, /disabled=\{importableRows === 0 \|\| isConfirmPending \|\| completed\}/);
  assert.match(component, /role=\{confirmState\.status === "error" \? "alert" : "status"\}/);
});
