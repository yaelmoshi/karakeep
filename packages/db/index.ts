import Database from "better-sqlite3";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";

import * as schema from "./schema";

export { db } from "./drizzle";
export type { DB } from "./drizzle";
export * as schema from "./schema";
export { SqliteError } from "better-sqlite3";

function getDatabaseErrorCode(error: unknown) {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

export function isUniqueConstraintError(error: unknown) {
  const code = getDatabaseErrorCode(error);
  return code === "SQLITE_CONSTRAINT_UNIQUE" || code === "23505";
}

export function isPrimaryKeyConstraintError(error: unknown) {
  const code = getDatabaseErrorCode(error);
  return code === "SQLITE_CONSTRAINT_PRIMARYKEY" || code === "23505";
}

export function getMutationCount(result: unknown) {
  if (Array.isArray(result)) {
    return result.length;
  }

  if (!result || typeof result !== "object") {
    return 0;
  }

  if ("changes" in result && typeof result.changes === "number") {
    return result.changes;
  }

  if ("count" in result && typeof result.count === "number") {
    return result.count;
  }

  if ("rowCount" in result && typeof result.rowCount === "number") {
    return result.rowCount;
  }

  return 0;
}

// This is exported here to avoid leaking better-sqlite types outside of this package.
export type KarakeepDBTransaction = SQLiteTransaction<
  "sync",
  Database.RunResult,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
