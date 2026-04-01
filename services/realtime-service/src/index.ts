import http from "node:http";

import { WebSocketServer } from "ws";

import { createLogger, loadServiceEnv } from "@hospital/common";
import { createServiceApp } from "@hospital/common";

import { startRealtimeConsumer } from "./consumer.js";
import { WebsocketHub } from "./websocket-hub.js";

const logger = createLogger("realtime-service");

const bootstrap = async () => {
  const env = loadServiceEnv({ APP_PORT: process.env.APP_PORT ?? 3007 }, { serviceName: "realtime-service" });
  const app = createServiceApp("realtime-service", env.frontendOrigin);

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    server,
    path: "/ws"
  });

  const hub = new WebsocketHub(wss, env);
  hub.start();
  void startRealtimeConsumer(env, hub).catch((error) => {
    logger.warn({ error }, "realtime consumer unavailable; websocket server is up without event streaming");
  });

  server.listen(env.appPort, () => {
    logger.info({ port: env.appPort }, "realtime-service listening");
  });
};

bootstrap().catch((error) => {
  logger.error({ error }, "realtime-service failed to start");
  process.exit(1);
});
