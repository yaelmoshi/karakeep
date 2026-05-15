import { PluginManager, PluginType } from "@karakeep/shared/plugins";
import serverConfig from "@karakeep/shared/config";

import { PostgresQueueProvider } from "./src";

if (serverConfig.database.driver === "postgres") {
  PluginManager.register({
    type: PluginType.Queue,
    name: "Postgres",
    provider: new PostgresQueueProvider(),
  });
}
