import { createProducer, createLogger, getPgPool, loadServiceEnv } from "@hospital/common";

import { createPatientApp } from "./app.js";

const logger = createLogger("patient-service");

const bootstrap = async () => {
  const env = loadServiceEnv({ APP_PORT: process.env.APP_PORT ?? 3002 }, { serviceName: "patient-service" });
  const pool = getPgPool(env.databaseUrl);
  const producer = await createProducer(env.kafkaBrokers, "patient-service");

  const app = createPatientApp({
    env,
    pool,
    producer
  });

  app.listen(env.appPort, () => {
    logger.info({ port: env.appPort }, "patient-service listening");
  });
};

bootstrap().catch((error) => {
  logger.error({ error }, "patient-service failed to start");
  process.exit(1);
});
