// Import stats to register Prometheus metrics
import "@karakeep/trpc/stats";

import { prometheus } from "@hono/prometheus";
import { Hono } from "hono";
import type { Env, MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { register } from "prom-client";

import serverConfig from "@karakeep/shared/config";

export const { printMetrics, registerMetrics } = prometheus({
  registry: register,
  prefix: "karakeep_",
  collectDefaultMetrics: true,
});

const metricsAuth = bearerAuth({
  token: serverConfig.prometheus.metricsToken,
}) as MiddlewareHandler<Env, "/">;

const app = new Hono().get("/", metricsAuth, printMetrics);

export default app;
