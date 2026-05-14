import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import serverConfig from "@karakeep/shared/config";

if (serverConfig.database.driver === "postgres") {
  throw new Error(
    "DB_DRIVER=postgres is configured, but Postgres migrations are not implemented yet.",
  );
}

const { db } = await import("./drizzle");

migrate(db, { migrationsFolder: "./drizzle" });
