import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { processStorageTasks } from "../lib/products/storage-task-processor.ts";

// Deliberately separate credentials: never load the application's .env.local.
function required(name: string) {
  const value = process.env[name];
  if (!value) throw Error(`Missing ${name}`);
  return value;
}
const args = process.argv.slice(2);
if (args.some((arg) => !["--apply", "--dry-run"].includes(arg)) ||
    (args.includes("--apply") && args.includes("--dry-run"))) throw Error("Invalid arguments");
const dryRun = !args.includes("--apply");
const databaseUrl = required("STORAGE_TASKS_DATABASE_URL");
const storageUrl = required("STORAGE_TASKS_SUPABASE_URL");
const environment = required("STORAGE_TASKS_ENVIRONMENT");
if (!["local", "staging"].includes(environment)) throw Error("Only local/staging targets are enabled");
const dbTarget = new URL(databaseUrl);
const storageTarget = new URL(storageUrl);
if (environment === "local") {
  if (![dbTarget.hostname, storageTarget.hostname].every((host) => ["localhost", "127.0.0.1", "[::1]"].includes(host))) {
    throw Error("Local mode requires loopback targets");
  }
} else {
  // Explicit pair prevents accidentally mixing a staging DB with application Storage.
  if (dbTarget.hostname !== required("STORAGE_TASKS_STAGING_DB_HOST") ||
      storageTarget.hostname !== required("STORAGE_TASKS_STAGING_STORAGE_HOST") ||
      storageTarget.protocol !== "https:" || dbTarget.searchParams.get("sslmode") !== "verify-full") {
    throw Error("Staging requires matching target hosts and verified TLS");
  }
}
const supabase = createClient(storageUrl, required("STORAGE_TASKS_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
});
const bucket = supabase.storage.from("product-images");
const db = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 });
await db.connect();
try {
  const results = await processStorageTasks(db, {
    async inspect(path) {
      const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const name = path.slice(path.lastIndexOf("/") + 1);
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket.list(folder, { limit: 1000, offset,
          sortBy: { column: "name", order: "asc" } });
        if (error) throw Error(error.message);
        const object = data?.find((item) => item.name === name && item.id);
        if (object) {
          if (!object.metadata) throw Error("STORAGE_METADATA_MISSING");
          return object.metadata;
        }
        if ((data?.length ?? 0) < 1000) return null;
      }
    },
    async remove(path) {
      const { error } = await bucket.remove([path]);
      if (error) throw Error(error.message);
    },
  }, { dryRun });
  console.log(JSON.stringify({ dryRun, results }, null, 2));
  if (results.some((result) => result.outcome === "failed")) process.exitCode = 1;
} finally {
  await db.end();
}
