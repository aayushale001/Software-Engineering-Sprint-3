import { createConsumer, createLogger, type ServiceEnv } from "@hospital/common";
import { KAFKA_TOPICS } from "@hospital/contracts";

import type { WebsocketHub } from "./websocket-hub.js";

const logger = createLogger("realtime-consumer");

export const startRealtimeConsumer = async (env: ServiceEnv, hub: WebsocketHub): Promise<void> => {
  await createConsumer(
    env.kafkaBrokers,
    "realtime-service",
    "realtime-websocket-group",
    [KAFKA_TOPICS.DOCTOR_AVAILABILITY_UPDATED, KAFKA_TOPICS.APPOINTMENT_CONFIRMED, KAFKA_TOPICS.APPOINTMENT_CANCELLED],
    async (topic, message) => {
      if (!message.value) {
        return;
      }

      const payload = JSON.parse(message.value.toString()) as {
        doctorId: string;
        patientId?: string | null;
        slotStart: string;
        status?: string;
        eventType?: string;
      };

      const status =
        payload.status ??
        (topic === KAFKA_TOPICS.APPOINTMENT_CONFIRMED
          ? "booked"
          : topic === KAFKA_TOPICS.APPOINTMENT_CANCELLED
            ? "available"
            : "updated");

      hub.broadcastAvailability({
        ...payload,
        status,
        eventType: payload.eventType
      });
    }
  );

  logger.info("realtime consumer started");
};
