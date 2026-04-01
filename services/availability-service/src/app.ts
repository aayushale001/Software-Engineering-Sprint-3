import type { Pool } from "pg";
import { z } from "zod";

import { asyncHandler, createServiceApp, requireAuth, type ServiceEnv } from "@hospital/common";

import { makeAvailabilityCacheKey } from "./cache.js";
import { getDoctorAvailability } from "./repositories/availability-repository.js";

const querySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime()
});

type AvailabilityContext = {
  env: ServiceEnv;
  pool: Pool;
  redis: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, options: { EX: number }) => Promise<unknown>;
  };
};

export const createAvailabilityApp = ({ env, pool, redis }: AvailabilityContext) => {
  const app = createServiceApp("availability-service", env.frontendOrigin);

  app.get(
    "/doctors/:doctorId/availability",
    requireAuth(env.jwtAccessSecret, env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const { start, end } = querySchema.parse(req.query);
      const { doctorId } = req.params;
      if (typeof doctorId !== "string") {
        throw new Error("Invalid doctor id");
      }

      const cacheKey = makeAvailabilityCacheKey(doctorId, start, end);
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.status(200).json({
          source: "cache",
          slots: JSON.parse(cached)
        });
        return;
      }

      const slots = await getDoctorAvailability(pool, doctorId, start, end);
      await redis.set(cacheKey, JSON.stringify(slots), {
        EX: 30
      });

      res.status(200).json({
        source: "database",
        slots
      });
    })
  );

  return app;
};
