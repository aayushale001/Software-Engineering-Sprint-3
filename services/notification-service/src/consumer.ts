import type { Pool } from "pg";

import { createConsumer, createLogger, type ServiceEnv } from "@hospital/common";
import { KAFKA_TOPICS } from "@hospital/contracts";

import type { NotificationEvent } from "./mailer.js";

const logger = createLogger("notification-service-consumer");

type NotificationMailer = {
  send: (notification: NotificationEvent) => Promise<void>;
};

export const startNotificationConsumer = async (
  env: ServiceEnv,
  pool: Pool,
  mailer: NotificationMailer | null
): Promise<void> => {
  await createConsumer(
    env.kafkaBrokers,
    "notification-service",
    "notification-service-group",
    [KAFKA_TOPICS.NOTIFICATION_REQUESTED],
    async (_topic, message) => {
      if (!message.value) {
        return;
      }

      const payload = JSON.parse(message.value.toString()) as NotificationEvent;
      let status = "queued";

      if (payload.channel === "email" && mailer) {
        await mailer.send(payload);
        status = "sent";
      } else if (payload.channel === "email") {
        logger.warn({ notificationId: payload.notificationId }, "email notification left queued because SMTP is disabled");
      } else {
        logger.info({ notificationId: payload.notificationId, channel: payload.channel }, "non-email notification queued");
      }

      await pool.query(
        `
          INSERT INTO notification.delivery_logs (notification_id, channel, destination, template, payload, status)
          VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        `,
        [
          payload.notificationId,
          payload.channel,
          payload.destination,
          payload.template,
          JSON.stringify(payload.data ?? {}),
          status
        ]
      );

      logger.info(
        {
          notificationId: payload.notificationId,
          channel: payload.channel,
          destination: payload.destination,
          status
        },
        "notification processed"
      );
    }
  );
};
