import "dotenv/config";

import type { Config } from "drizzle-kit";

import serverConfig from "@karakeep/shared/config";

const databaseURL = serverConfig.dataDir
  ? `${serverConfig.dataDir}/db.db`
  : "./db.db";

const config = (() => {
  if (serverConfig.database.driver === "postgres") {
    return {
      dialect: "postgresql",
      schema: "./schema.pg.ts",
      out: "./drizzle-pg",
      dbCredentials: {
        url: serverConfig.database.url!,
      },
    } satisfies Config;
  }

  return {
    dialect: "sqlite",
    schema: "./schema.ts",
    out: "./drizzle",
    dbCredentials: {
      url: databaseURL,
    },
  } satisfies Config;
})();

export default config;
