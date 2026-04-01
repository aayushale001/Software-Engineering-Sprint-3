import { createProducer, createLogger, getPgPool, getRedisClient, loadServiceEnv } from "@hospital/common";

import { createAppointmentApp } from "./app.js";
import { startOutboxPublisher } from "./outbox-publisher.js";

const logger = createLogger("appointment-service");

const bootstrap = async () => {
  const env = loadServiceEnv({ APP_PORT: process.env.APP_PORT ?? 3005 }, { serviceName: "appointment-service" });
  const pool = getPgPool(env.databaseUrl);
  const redis = await getRedisClient(env.redisUrl);
  const producer = await createProducer(env.kafkaBrokers, "appointment-service");

  startOutboxPublisher(pool, producer);

  const app = createAppointmentApp({
    env,
    pool,
    redis
  });

  app.listen(env.appPort, () => {
    logger.info({ port: env.appPort }, "appointment-service listening");
  });
};

bootstrap().catch((error) => {
  logger.error({ error }, "appointment-service failed to start");
  process.exit(1);
});
