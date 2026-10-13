import { ESLint } from "eslint";
import { execFileSync } from "node:child_process";
import { relative } from "node:path";
import { writeFileSync } from "node:fs";

const base = process.argv[2] || "7a8a105";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trimEnd();
const eslint = new ESLint();
const current = await eslint.lintFiles(["."]);
const paths = git("ls-tree", "-r", "--name-only", base).split("\n").filter((path) => /\.(?:[cm]?js|tsx?)$/.test(path));
const baseline = [];
for (const filePath of paths) {
  if (await eslint.isPathIgnored(filePath)) continue;
  const source = execFileSync("git", ["show", `${base}:${filePath}`], { encoding: "utf8" });
  baseline.push(...await eslint.lintText(source, { filePath }));
}
function diagnostics(results, severity) {
  return results.flatMap((result) => result.messages.filter((message) => message.severity === severity).map((message) => ({
    path: relative(process.cwd(), result.filePath).replaceAll("\\", "/"),
    line: message.line, column: message.column, rule: message.ruleId, message: message.message,
  })));
}
const baseErrors = diagnostics(baseline, 2);
const currentErrors = diagnostics(current, 2);
const identity = (error) => JSON.stringify(error);
const original = new Set(baseErrors.map(identity));
const inherited = currentErrors.map((error) => ({ ...error, identicalToBase: original.has(identity(error)),
  fileBlobUnchanged: git("rev-parse", `${base}:${error.path}`) === git("rev-parse", `HEAD:${error.path}`),
}));
const newErrors = inherited.filter((error) => !error.identicalToBase);
const report = { base: git("rev-parse", base), implementationCommit: git("rev-parse", "HEAD"),
  method: "Lint Git base sources via lintText with identical file paths, ESLint configuration and dependency lockfile; compare full diagnostics and Git blobs.",
  configUnchanged: git("rev-parse", `${base}:eslint.config.mjs`) === git("rev-parse", "HEAD:eslint.config.mjs"),
  lockfileUnchanged: git("rev-parse", `${base}:package-lock.json`) === git("rev-parse", "HEAD:package-lock.json"),
  baseline: { errors: baseErrors, warningCount: diagnostics(baseline, 1).length },
  current: { errors: inherited, warningCount: diagnostics(current, 1).length }, newErrors,
  resolvedErrors: baseErrors.filter((error) => !currentErrors.some((currentError) => identity(currentError) === identity(error))),
};
writeFileSync("reports/ui-ux-stabilization/lint-baseline-comparison.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ baselineErrors: baseErrors.length, currentErrors: currentErrors.length, newErrors: newErrors.length,
  allErrorFilesUnchanged: inherited.every((error) => error.fileBlobUnchanged), configUnchanged: report.configUnchanged, lockfileUnchanged: report.lockfileUnchanged }));
if (newErrors.length || !report.configUnchanged || !report.lockfileUnchanged) process.exitCode = 1;
