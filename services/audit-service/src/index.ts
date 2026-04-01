import { z } from "zod";

import { createLogger, createServiceApp, getPgPool, loadServiceEnv, requireRoles } from "@hospital/common";

import { startAuditConsumer } from "./consumer.js";

const logger = createLogger("audit-service");

const bootstrap = async () => {
  const env = loadServiceEnv({ APP_PORT: process.env.APP_PORT ?? 3009 }, { serviceName: "audit-service" });
  const pool = getPgPool(env.databaseUrl);

  void startAuditConsumer(env, pool).catch((error) => {
    logger.warn({ error }, "audit consumer unavailable; continuing with read-only audit API");
  });

  const app = createServiceApp("audit-service", env.frontendOrigin);
  app.get("/audit/health", (_req, res) => {
    res.status(200).json({
      status: "ok"
    });
  });

  const querySchema = z.object({
    limit: z.coerce.number().int().positive().max(200).default(50),
    offset: z.coerce.number().int().nonnegative().default(0),
    actorType: z.string().optional(),
    eventType: z.string().optional()
  });

  app.get(
    "/admin/audit/logs",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    async (req, res, next) => {
      try {
        const query = querySchema.parse(req.query);
        const params: unknown[] = [];
        const clauses: string[] = [];

        if (query.actorType) {
          params.push(query.actorType);
          clauses.push(`actor_type = $${params.length}`);
        }

        if (query.eventType) {
          params.push(query.eventType);
          clauses.push(`event_type = $${params.length}`);
        }

        params.push(query.limit);
        const limitPosition = params.length;
        params.push(query.offset);
        const offsetPosition = params.length;

        const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
        const result = await pool.query(
          `
            SELECT
              id,
              event_type AS "eventType",
              actor_type AS "actorType",
              actor_id AS "actorId",
              metadata,
              occurred_at AS "occurredAt",
              created_at AS "createdAt"
            FROM audit.audit_logs
            ${whereClause}
            ORDER BY occurred_at DESC
            LIMIT $${limitPosition}
            OFFSET $${offsetPosition}
          `,
          params
        );

        res.status(200).json({
          logs: result.rows
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.listen(env.appPort, () => {
    logger.info({ port: env.appPort }, "audit-service listening");
  });
};

bootstrap().catch((error) => {
  logger.error({ error }, "audit-service failed to start");
  process.exit(1);
});
