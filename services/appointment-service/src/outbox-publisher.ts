import type { Pool } from "pg";
import type { Producer } from "kafkajs";

import { createLogger, publishEvent } from "@hospital/common";

const logger = createLogger("appointment-outbox-publisher");

export const startOutboxPublisher = (pool: Pool, producer: Producer): NodeJS.Timeout => {
  return setInterval(async () => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const events = await client.query<{
        id: string;
        topic: string;
        aggregateId: string;
        payload: Record<string, unknown>;
      }>(
        `
          SELECT id, topic, aggregate_id AS "aggregateId", payload
          FROM appointment.outbox_events
          WHERE status = 'pending'
          ORDER BY created_at ASC
          LIMIT 50
          FOR UPDATE SKIP LOCKED
        `
      );

      for (const event of events.rows) {
        await publishEvent(producer, event.topic, event.aggregateId, event.payload);

        await client.query(
          `
            UPDATE appointment.outbox_events
            SET status = 'published', published_at = NOW()
            WHERE id = $1
          `,
          [event.id]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error({ error }, "outbox publish cycle failed");
    } finally {
      client.release();
    }
  }, 1500);
};
