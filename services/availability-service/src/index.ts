import { createLogger, getPgPool, getRedisClient, loadServiceEnv } from "@hospital/common";

import { createAvailabilityApp } from "./app.js";
import { startAvailabilityEventsConsumer } from "./consumers/availability-events-consumer.js";

const logger = createLogger("availability-service");

const bootstrap = async () => {
  const env = loadServiceEnv({ APP_PORT: process.env.APP_PORT ?? 3004 }, { serviceName: "availability-service" });
  const pool = getPgPool(env.databaseUrl);
  const redis = await getRedisClient(env.redisUrl);

  void startAvailabilityEventsConsumer(env, redis).catch((error) => {
    logger.warn({ error }, "availability event consumer unavailable; continuing without cache invalidation");
  });

  const app = createAvailabilityApp({
    env,
    pool,
    redis
  });

  app.listen(env.appPort, () => {
    logger.info({ port: env.appPort }, "availability-service listening");
  });
};

bootstrap().catch((error) => {
  logger.error({ error }, "availability-service failed to start");
  process.exit(1);
});
