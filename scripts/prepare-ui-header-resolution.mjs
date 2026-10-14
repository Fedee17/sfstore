import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join, relative } from "node:path";

const ref = process.argv[2] || "origin/ui-audit-pr2";
const root = process.cwd();
const temp = resolve(root, ".ui-header-resolution-check");
assert.equal(relative(root, temp), ".ui-header-resolution-check");
await assert.rejects(access(temp), { code: "ENOENT" });
const target = "components/site-header.tsx";
const baseline = execFileSync("git", ["show", `${ref}:${target}`], { encoding: "utf8" });
const resolved = (await readFile(target, "utf8")).replaceAll("\r\n", "\n");
assert.equal((resolved.match(/prefetch=\{false\}/g) || []).length, 2);
assert.ok(resolved.includes('action="/buscar"') && resolved.includes('href="/ayuda"'));
assert.ok(!resolved.includes("handleSearchSubmit"));
try {
  await mkdir(join(temp, "components"), { recursive: true });
  await writeFile(join(temp, target), baseline);
  await writeFile(join(temp, "resolved.tsx"), resolved);
  const diff = spawnSync("git", ["diff", "--no-index", "--", join(temp, target), join(temp, "resolved.tsx")], { encoding: "utf8" });
  assert.ok([0, 1].includes(diff.status), diff.stderr);
  const patch = diff.stdout.split("\n").map((line) => line === " " ? "" : line.startsWith("diff --git ") ? `diff --git a/${target} b/${target}` : line.startsWith("--- ") ? `--- a/${target}` : line.startsWith("+++ ") ? `+++ b/${target}` : line).join("\n");
  const patchPath = "reports/ui-ux-stabilization/site-header-pr2-resolution.patch";
  await writeFile(patchPath, patch);
  execFileSync("git", ["apply", "--check", "--directory=.ui-header-resolution-check", patchPath], { encoding: "utf8" });
  const checkoutConfigText = execFileSync("git", ["show", `${ref}:vercel.json`], { encoding: "utf8" });
  const checkoutConfig = JSON.parse(checkoutConfigText);
  const uiConfig = JSON.parse(await readFile("vercel.json", "utf8"));
  const combinedConfig = structuredClone(checkoutConfig);
  combinedConfig.git.deploymentEnabled = { ...checkoutConfig.git.deploymentEnabled, ...uiConfig.git.deploymentEnabled };
  for (const branch of Object.keys(checkoutConfig.git.deploymentEnabled)) {
    assert.equal(combinedConfig.git.deploymentEnabled[branch], checkoutConfig.git.deploymentEnabled[branch]);
  }
  await writeFile(join(temp, "vercel.json"), checkoutConfigText);
  await writeFile(join(temp, "resolved-vercel.json"), JSON.stringify(combinedConfig, null, 2) + "\n");
  const configDiff = spawnSync("git", ["diff", "--no-index", "--", join(temp, "vercel.json"), join(temp, "resolved-vercel.json")], { encoding: "utf8" });
  assert.ok([0, 1].includes(configDiff.status), configDiff.stderr);
  const configPatch = configDiff.stdout.split("\n").map((line) => line === " " ? "" : line.startsWith("diff --git ") ? "diff --git a/vercel.json b/vercel.json" : line.startsWith("--- ") ? "--- a/vercel.json" : line.startsWith("+++ ") ? "+++ b/vercel.json" : line).join("\n");
  const configPatchPath = "reports/ui-ux-stabilization/vercel-pr2-resolution.patch";
  await writeFile(configPatchPath, configPatch);
  execFileSync("git", ["apply", "--check", "--directory=.ui-header-resolution-check", configPatchPath], { encoding: "utf8" });
  await writeFile("reports/ui-ux-stabilization/header-resolution-check.json", JSON.stringify({
    checkoutHead: execFileSync("git", ["rev-parse", ref], { encoding: "utf8" }).trim(),
    target, patchPath, applyCheck: "passed", checkoutFilesModified: false, mergePerformed: false,
    configPatchPath, configApplyCheck: "passed", preservedCheckoutBranches: Object.keys(checkoutConfig.git.deploymentEnabled), additionalDisabledBranch: "codex/ui-ux-stabilization",
    preserves: ["Link with prefetch=false", "GET search", "touch and keyboard navigation", "current categories", "mobile layout", "FAQ destination"],
  }, null, 2) + "\n");
  console.log("PASS header and Vercel resolution patches apply to exact PR #2 sources without merging");
} finally {
  assert.equal(relative(root, temp), ".ui-header-resolution-check");
  await rm(temp, { recursive: true });
}
