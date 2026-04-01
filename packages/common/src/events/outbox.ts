import type { PoolClient } from "pg";

export const insertOutboxEvent = async (
  client: PoolClient,
  schema: string,
  topic: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>
): Promise<void> => {
  await client.query(
    `
      INSERT INTO ${schema}.outbox_events (topic, aggregate_type, aggregate_id, payload, status)
      VALUES ($1, $2, $3, $4::jsonb, 'pending')
    `,
    [topic, aggregateType, aggregateId, JSON.stringify(payload)]
  );
};
