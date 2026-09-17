import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const moduleSource = readFileSync(
  join(testDirectory, "..", "lib", "admin-authorization.ts"),
  "utf8",
);
const compiledModule = ts.transpileModule(moduleSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { isAllowedAdminEmail, parseAllowedAdminEmails } = await import(
  `data:text/javascript;base64,${Buffer.from(compiledModule).toString("base64")}`
);

test("missing admin allowlist denies access", () => {
  assert.equal(isAllowedAdminEmail("owner@example.com", undefined), false);
});

test("blank admin allowlist denies access", () => {
  assert.equal(isAllowedAdminEmail("owner@example.com", "  ,  "), false);
});

test("an authenticated email outside the allowlist is denied", () => {
  assert.equal(
    isAllowedAdminEmail("other@example.com", "owner@example.com"),
    false,
  );
});

test("an allowed email is matched case-insensitively", () => {
  assert.equal(
    isAllowedAdminEmail(" Owner@Example.com ", "owner@example.com"),
    true,
  );
  assert.deepEqual(parseAllowedAdminEmails(" A@EXAMPLE.COM, b@example.com "), [
    "a@example.com",
    "b@example.com",
  ]);
});
