import type { DB } from "./drizzle";

export { db } from "./drizzle";
export type { DB } from "./drizzle";
export * as schema from "./schema";

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

type TransactionOf<T> = T extends {
  transaction(callback: (tx: infer Tx, ...args: never[]) => unknown): unknown;
}
  ? Tx
  : never;

export type KarakeepDBTransaction = TransactionOf<DB>;
