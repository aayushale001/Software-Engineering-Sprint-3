import { createLogger, createProducer, getPgPool, getRedisClient, loadServiceEnv } from "@hospital/common";

import { createDoctorApp } from "./app.js";

const logger = createLogger("doctor-service");

const bootstrap = async () => {
  const env = loadServiceEnv({ APP_PORT: process.env.APP_PORT ?? 3003 }, { serviceName: "doctor-service" });
  const pool = getPgPool(env.databaseUrl);
  const redis = await getRedisClient(env.redisUrl);
  const producer = await createProducer(env.kafkaBrokers, "doctor-service");

  const app = createDoctorApp({
    env,
    pool,
    redis,
    producer
  });

  app.listen(env.appPort, () => {
    logger.info({ port: env.appPort }, "doctor-service listening");
  });
};

bootstrap().catch((error) => {
  logger.error({ error }, "doctor-service failed to start");
  process.exit(1);
});
