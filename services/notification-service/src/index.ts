import { createLogger, getPgPool, loadServiceEnv } from "@hospital/common";
import { createServiceApp } from "@hospital/common";

import { startNotificationConsumer } from "./consumer.js";
import { createNotificationMailer } from "./mailer.js";

const logger = createLogger("notification-service");

const bootstrap = async () => {
  const env = loadServiceEnv({ APP_PORT: process.env.APP_PORT ?? 3008 }, { serviceName: "notification-service" });
  const pool = getPgPool(env.databaseUrl);
  const mailer = createNotificationMailer(env);

  void startNotificationConsumer(env, pool, mailer).catch((error) => {
    logger.warn({ error }, "notification consumer unavailable; API is up but queued emails will not be processed");
  });

  const app = createServiceApp("notification-service", env.frontendOrigin);
  app.get("/notifications/health", (_req, res) => {
    res.status(200).json({
      status: "ok"
    });
  });

  app.listen(env.appPort, () => {
    logger.info({ port: env.appPort }, "notification-service listening");
  });
};

bootstrap().catch((error) => {
  logger.error({ error }, "notification-service failed to start");
  process.exit(1);
});
