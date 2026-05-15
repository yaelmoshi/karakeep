import { PluginManager } from "@karakeep/shared/plugins";
import serverConfig from "@karakeep/shared/config";

let pluginsLoaded = false;
export async function loadAllPlugins() {
  if (pluginsLoaded) {
    return;
  }
  // Load plugins here. Order of plugin loading matter.
  // Queue provider(s)
  if (serverConfig.database.driver === "postgres") {
    await import("@karakeep/plugins/queue-postgres");
  } else {
    await import("@karakeep/plugins/queue-liteque");
  }
  await import("@karakeep/plugins/queue-restate");
  await import("@karakeep/plugins/search-meilisearch");
  // Rate limiters (order matters - last one wins)
  await import("@karakeep/plugins/ratelimit-memory");
  await import("@karakeep/plugins/ratelimit-redis");
  PluginManager.logAllPlugins();
  pluginsLoaded = true;
}
