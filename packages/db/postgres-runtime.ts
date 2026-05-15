import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import serverConfig from "@karakeep/shared/config";

import * as pgSchema from "./schema.pg";

export function createPostgresDatabase() {
  const sql = serverConfig.database.url
    ? postgres(serverConfig.database.url, {
        max: 10,
        prepare: false,
      })
    : postgres({
        host: serverConfig.database.postgres.host,
        port: serverConfig.database.postgres.port,
        database: serverConfig.database.postgres.database,
        username: serverConfig.database.postgres.user,
        password: serverConfig.database.postgres.password,
        ssl: serverConfig.database.postgres.ssl,
        max: 10,
        prepare: false,
      });

  return drizzlePostgres(sql, { schema: pgSchema });
}
