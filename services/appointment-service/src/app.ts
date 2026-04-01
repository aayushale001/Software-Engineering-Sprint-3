import { z } from "zod";
import type { Pool } from "pg";

import {
  ApiError,
  asyncHandler,
  createServiceApp,
  requireRoles,
  withTransaction,
  type RequestWithAuth,
  type ServiceEnv
} from "@hospital/common";

import {
  cancelAppointmentByActor,
  confirmHold,
  createHold,
  findHoldForConfirmation,
  getAllAppointments,
  getAppointmentsByDoctor,
  getAppointmentsByPatient,
  getIdempotentResponse,
  storeIdempotentResponse
} from "./repositories/appointment-repository.js";

const holdRequestSchema = z.object({
  doctorId: z.string().uuid(),
  slotStart: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "slotStart must be a valid datetime"
  }),
  reason: z.string().max(500).optional()
});

const confirmRequestSchema = z.object({
  holdId: z.string().uuid(),
  reason: z.string().max(500).optional()
});

const cancelRequestSchema = z.object({
  reason: z.string().min(3).max(500).optional()
});

type AppointmentContext = {
  env: ServiceEnv;
  pool: Pool;
  redis: {
    set: (key: string, value: string, options: { NX: boolean; EX: number }) => Promise<unknown>;
    get: (key: string) => Promise<string | null>;
    del: (key: string | string[]) => Promise<number>;
  };
};

const HOLD_TTL_SECONDS = 120;

const makeSlotLockKey = (doctorId: string, slotStart: string): string => {
  return `slot-lock:${doctorId}:${slotStart}`;
};

export const createAppointmentApp = ({ env, pool, redis }: AppointmentContext) => {
  const app = createServiceApp("appointment-service", env.frontendOrigin);

  app.post(
    "/appointments/hold",
    requireRoles(env.jwtAccessSecret, ["patient"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.patientId) {
        throw new ApiError(401, "Unauthorized");
      }

      const input = holdRequestSchema.parse(req.body);
      const slotLockKey = makeSlotLockKey(input.doctorId, input.slotStart);
      const redisLockResult = await redis.set(slotLockKey, auth.patientId, {
        NX: true,
        EX: HOLD_TTL_SECONDS
      });

      if (redisLockResult !== "OK") {
        throw new ApiError(409, "Slot is currently being held by another user");
      }

      try {
        const hold = await withTransaction(pool, async (client) => {
          return createHold(client, {
            patientId: auth.patientId ?? "",
            doctorId: input.doctorId,
            slotStart: input.slotStart,
            holdExpiresAt: new Date(Date.now() + HOLD_TTL_SECONDS * 1000),
            reason: input.reason
          });
        });

        res.status(201).json({
          holdId: hold.id,
          doctorId: hold.doctorId,
          slotStart: hold.slotStart,
          expiresAt: hold.expiresAt.toISOString()
        });
      } catch (error) {
        await redis.del(slotLockKey);
        throw error;
      }
    })
  );

  app.post(
    "/appointments/confirm",
    requireRoles(env.jwtAccessSecret, ["patient"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.patientId) {
        throw new ApiError(401, "Unauthorized");
      }

      const idempotencyKey = req.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
        throw new ApiError(400, "idempotency-key header is required");
      }

      const input = confirmRequestSchema.parse(req.body);

      const response = await withTransaction(pool, async (client) => {
        const previousResponse = await getIdempotentResponse(client, auth.patientId ?? "", "/appointments/confirm", idempotencyKey);
        if (previousResponse) {
          return previousResponse;
        }

        const hold = await findHoldForConfirmation(client, input.holdId, auth.patientId ?? "");
        const slotLockKey = makeSlotLockKey(hold.doctorId, hold.slotStart);
        const lockedBy = await redis.get(slotLockKey);
        if (lockedBy !== auth.patientId) {
          throw new ApiError(409, "Slot lock expired. Please hold the slot again.");
        }

        const appointment = await confirmHold(client, hold, input.reason);
        const payload = {
          appointment,
          idempotent: false
        };

        await storeIdempotentResponse(client, auth.patientId ?? "", "/appointments/confirm", idempotencyKey, payload);

        await redis.del(slotLockKey);
        return payload;
      });

      res.status(201).json(response);
    })
  );

  app.get(
    "/appointments/me",
    requireRoles(env.jwtAccessSecret, ["patient"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.patientId) {
        throw new ApiError(401, "Unauthorized");
      }

      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const appointments = await withTransaction(pool, async (client) => {
        return getAppointmentsByPatient(client, auth.patientId ?? "", status);
      });

      res.status(200).json({
        appointments
      });
    })
  );

  app.get(
    "/doctors/me/appointments",
    requireRoles(env.jwtAccessSecret, ["doctor"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.doctorId) {
        throw new ApiError(403, "Forbidden");
      }

      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const appointments = await withTransaction(pool, async (client) => {
        return getAppointmentsByDoctor(client, auth.doctorId ?? "", status);
      });

      res.status(200).json({
        appointments
      });
    })
  );

  app.get(
    "/admin/appointments",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const appointments = await withTransaction(pool, async (client) => {
        return getAllAppointments(client, status);
      });

      res.status(200).json({
        appointments
      });
    })
  );

  app.delete(
    "/appointments/:appointmentId",
    requireRoles(env.jwtAccessSecret, ["patient"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.patientId) {
        throw new ApiError(401, "Unauthorized");
      }

      const appointment = await withTransaction(pool, async (client) => {
        const appointmentId = req.params.appointmentId;
        if (typeof appointmentId !== "string") {
          throw new ApiError(400, "Invalid appointment id");
        }

        const payload = cancelRequestSchema.parse(req.body ?? {});
        return cancelAppointmentByActor(client, appointmentId, {
          role: "patient",
          userId: auth.userId,
          patientId: auth.patientId,
          reason: payload.reason
        });
      });

      res.status(200).json({
        appointment
      });
    })
  );

  app.post(
    "/doctors/me/appointments/:appointmentId/cancel",
    requireRoles(env.jwtAccessSecret, ["doctor"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.doctorId) {
        throw new ApiError(403, "Forbidden");
      }

      const payload = cancelRequestSchema.parse(req.body ?? {});
      const appointment = await withTransaction(pool, async (client) => {
        const appointmentId = req.params.appointmentId;
        if (typeof appointmentId !== "string") {
          throw new ApiError(400, "Invalid appointment id");
        }

        return cancelAppointmentByActor(client, appointmentId, {
          role: "doctor",
          userId: auth.userId,
          doctorId: auth.doctorId,
          reason: payload.reason
        });
      });

      res.status(200).json({
        appointment
      });
    })
  );

  app.post(
    "/admin/appointments/:appointmentId/cancel",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const payload = cancelRequestSchema.parse(req.body ?? {});
      const appointment = await withTransaction(pool, async (client) => {
        const appointmentId = req.params.appointmentId;
        if (typeof appointmentId !== "string") {
          throw new ApiError(400, "Invalid appointment id");
        }

        return cancelAppointmentByActor(client, appointmentId, {
          role: "admin",
          userId: auth?.userId ?? appointmentId,
          reason: payload.reason
        });
      });

      res.status(200).json({
        appointment
      });
    })
  );

  return app;
};
