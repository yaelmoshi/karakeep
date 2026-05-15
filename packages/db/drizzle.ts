import "dotenv/config";

import serverConfig from "@karakeep/shared/config";

import { createPostgresDatabase } from "./postgres-runtime";

type SqliteDB = ReturnType<typeof import("./sqlite").createSqliteDatabase>;

async function createDatabase(): Promise<SqliteDB> {
  if (serverConfig.database.driver === "postgres") {
    return createPostgresDatabase() as unknown as SqliteDB;
  }

  const { createSqliteDatabase } = await import("./sqlite");
  return createSqliteDatabase();
}

export const db = await createDatabase();
export type DB = typeof db;
