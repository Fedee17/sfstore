import type { Client } from "pg";

type Task = {
  id: string; operation_key: string; action: string; bucket: string;
  storage_path: string; expected_metadata: Record<string, unknown>;
};
export type StorageTaskResult = { id: string; outcome: string; error?: string };
export type TaskStorage = {
  inspect(path: string): Promise<Record<string, unknown> | null>;
};

const marker = "/product-images/";
function references(url: string, path: string) {
  const index = url.indexOf(marker);
  if (index < 0) return false;
  const suffix = url.slice(index + marker.length).split(/[?#]/)[0];
  // Malformed encodings fail closed, rather than hiding a potential reference.
  return suffix === path || decodeURIComponent(suffix) === path;
}
const hash = (value: unknown) => String(value ?? "").replace(/^"|"$/g, "").toLowerCase();
const eligible = `status in ('pending','processing') or (status='failed' and
  updated_at + make_interval(secs => least(3600, 30 * power(2, least(attempts,7)))::int) <= now())`;

async function decide(db: Client, storage: TaskStorage, task: Task): Promise<string> {
  if (task.bucket !== "product-images" || !["reconcile", "delete_object"].includes(task.action) ||
      !task.storage_path || /(^\/|(^|\/)\.\.?(\/|$)|[?#\\])/.test(task.storage_path) ||
      task.expected_metadata.path !== task.storage_path) throw Error("INVALID_STORAGE_TASK");
  const operations = await db.query("select operation_key,status,recovery_metadata from public.product_save_operations");
  const operation = operations.rows.find((row) => row.operation_key === task.operation_key);
  if (!operation) throw Error("OPERATION_NOT_FOUND");
  // Never fence/abort a save here. Its existing retry protocol owns that decision.
  if (operation.status === "prepared" || operations.rows.some((row) => row.status === "prepared" &&
    Array.isArray(row.recovery_metadata?.uploads) && row.recovery_metadata.uploads.some(
      (upload: { path?: string }) => upload.path === task.storage_path))) return "deferred_prepared";
  const images = await db.query("select url from public.product_images");
  if (images.rows.some((row) => references(row.url, task.storage_path))) return "preserved_referenced";
  const actual = await storage.inspect(task.storage_path);
  if (!actual) return "already_absent";
  const expected = task.expected_metadata;
  // Path, size and MIME identify a location/format, not the object to remove.
  if (![expected.etag, expected.content_hash].some((value) =>
    typeof value === "string" && hash(value).trim().length > 0)) {
    throw Error("STORAGE_IDENTITY_REQUIRED");
  }
  for (const key of ["etag", "content_hash", "size", "mime"]) {
    if (!(key in expected)) continue;
    const value = key === "size" ? actual.size : key === "mime" ? actual.mimetype : actual.eTag;
    if (value == null || (key === "size" ? Number(value) !== expected[key] :
      key === "mime" ? value !== expected[key] : hash(value) !== hash(expected[key]))) {
      throw Error(`STORAGE_METADATA_MISMATCH:${key}`);
    }
  }
  // The Supabase API available here has no atomic version precondition. Even a
  // matching identity can be replaced after inspect. Never issue a path-only DELETE.
  return "retained_requires_conditional_delete";
}

/** Dedicated connection only. No remote URLs, credentials or scheduling in this module. */
export async function processStorageTasks(db: Client, storage: TaskStorage, options: {
  dryRun?: boolean; limit?: number;
} = {}): Promise<StorageTaskResult[]> {
  const dryRun = options.dryRun !== false;
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw Error("INVALID_BATCH_LIMIT");
  const candidates = await db.query(`select id from public.product_storage_tasks
    where ${eligible}
    order by created_at,id limit $1`, [limit]);
  const results: StorageTaskResult[] = [];
  for (const { id } of candidates.rows) {
    await db.query(dryRun ? "begin isolation level repeatable read read only" : "begin");
    try {
      await db.query("set local role service_role");
      await db.query("set local lock_timeout = '5s'");
      if (!dryRun) {
        // Keep the inspection and task result consistent with cooperating writers.
        // SHARE conflicts with INSERT/UPDATE/DELETE, including legacy gallery writes.
        await db.query("lock table public.product_save_operations in share mode");
        await db.query("lock table public.product_images in share mode");
      }
      const selected = await db.query(`select * from public.product_storage_tasks
        where id=$1 and (${eligible}) ${dryRun ? "" : "for update skip locked"}`, [id]);
      if (!selected.rowCount) { await db.query("rollback"); continue; }
      const task = selected.rows[0] as Task;
      if (!dryRun) {
        const ownership = await db.query(`select pg_try_advisory_xact_lock(
          hashtextextended($1, 0)) as acquired`, [`${task.bucket}/${task.storage_path}`]);
        if (!ownership.rows[0].acquired) { await db.query("rollback"); continue; }
      }
      let outcome: string;
      let error: string | undefined;
      try {
        outcome = await decide(db, storage, task);
        if (outcome === "retained_requires_conditional_delete") error = "STORAGE_CONDITIONAL_DELETE_UNAVAILABLE";
      } catch (failure) {
        outcome = "failed";
        error = (failure instanceof Error ? failure.message : String(failure)).slice(0, 2000);
      }
      const result = { id, outcome, ...(error ? { error } : {}) };
      if (!dryRun && outcome !== "deferred_prepared") {
        await db.query(`update public.product_storage_tasks set status=$2, attempts=attempts+1,
          last_error=$3, result=$4 where id=$1`,
        [id, error ? "failed" : "completed", error ?? null, result]);
      }
      await db.query(dryRun ? "rollback" : "commit");
      results.push(result);
    } catch (failure) {
      await db.query("rollback");
      // Infrastructure failures remain retryable; never claim success after a lost commit.
      throw failure;
    }
  }
  return results;
}
