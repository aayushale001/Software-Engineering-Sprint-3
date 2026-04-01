import { createProducer, createLogger, getPgPool, getRedisClient, loadServiceEnv } from "@hospital/common";

import { createMedicalRecordsApp } from "./app.js";

const logger = createLogger("medical-records-service");

const bootstrap = async () => {
  const env = loadServiceEnv({ APP_PORT: process.env.APP_PORT ?? 3006 }, { serviceName: "medical-records-service" });
  const pool = getPgPool(env.databaseUrl);
  const redis = await getRedisClient(env.redisUrl);
  const producer = await createProducer(env.kafkaBrokers, "medical-records-service");

  const app = createMedicalRecordsApp({
    env,
    pool,
    redis,
    producer
  });

  app.listen(env.appPort, () => {
    logger.info({ port: env.appPort }, "medical-records-service listening");
  });
};

bootstrap().catch((error) => {
  logger.error({ error }, "medical-records-service failed to start");
  process.exit(1);
});
