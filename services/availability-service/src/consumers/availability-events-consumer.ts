import { createConsumer, type ServiceEnv } from "@hospital/common";
import { KAFKA_TOPICS } from "@hospital/contracts";

import { invalidateDoctorAvailabilityCache } from "../cache.js";

type AvailabilityEvent = {
  doctorId: string;
};

export const startAvailabilityEventsConsumer = async (
  env: ServiceEnv,
  redis: { keys: (pattern: string) => Promise<string[]>; del: (keys: string | string[]) => Promise<number> }
): Promise<void> => {
  await createConsumer(
    env.kafkaBrokers,
    "availability-service",
    "availability-cache-group",
    [KAFKA_TOPICS.DOCTOR_AVAILABILITY_UPDATED],
    async (_topic, message) => {
      if (!message.value) {
        return;
      }

      const payload = JSON.parse(message.value.toString()) as AvailabilityEvent;
      if (payload.doctorId) {
        await invalidateDoctorAvailabilityCache(redis, payload.doctorId);
      }
    }
  );
};
