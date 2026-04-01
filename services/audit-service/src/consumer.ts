import type { Pool } from "pg";

import { createConsumer, type ServiceEnv } from "@hospital/common";
import { KAFKA_TOPICS } from "@hospital/contracts";

type AuditEvent = {
  eventType: string;
  actorType: string;
  actorId: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
};

export const startAuditConsumer = async (env: ServiceEnv, pool: Pool): Promise<void> => {
  await createConsumer(
    env.kafkaBrokers,
    "audit-service",
    "audit-service-group",
    [KAFKA_TOPICS.AUDIT_EVENT_LOGGED],
    async (_topic, message) => {
      if (!message.value) {
        return;
      }

      const payload = JSON.parse(message.value.toString()) as AuditEvent;
      await pool.query(
        `
          INSERT INTO audit.audit_logs (event_type, actor_type, actor_id, metadata, occurred_at)
          VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
        `,
        [
          payload.eventType,
          payload.actorType,
          payload.actorId,
          JSON.stringify(payload.metadata ?? {}),
          payload.occurredAt
        ]
      );
    }
  );
};
