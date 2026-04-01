import { createProducer, createLogger, getPgPool, getRedisClient, loadServiceEnv } from "@hospital/common";

import { createAuthApp } from "./app.js";
import { ensureBootstrapAdmin } from "./repositories/auth-repository.js";

const logger = createLogger("auth-service");

const bootstrap = async () => {
  const env = loadServiceEnv({ APP_PORT: process.env.APP_PORT ?? 3001 }, { serviceName: "auth-service" });
  const pool = getPgPool(env.databaseUrl);
  const redis = await getRedisClient(env.redisUrl);
  const producer = await createProducer(env.kafkaBrokers, "auth-service");

  if (env.adminBootstrapEmail && env.adminBootstrapPassword) {
    await ensureBootstrapAdmin(pool, env.adminBootstrapEmail, env.adminBootstrapPassword);
  }

  const app = createAuthApp({
    env,
    pool,
    redis,
    producer
  });

  app.listen(env.appPort, () => {
    logger.info({ port: env.appPort }, "auth-service listening");
  });
};

bootstrap().catch((error) => {
  logger.error({ error }, "auth-service failed to start");
  process.exit(1);
});
