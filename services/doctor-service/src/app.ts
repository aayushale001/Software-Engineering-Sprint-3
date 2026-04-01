import crypto from "node:crypto";

import type { Pool } from "pg";
import type { Producer } from "kafkajs";
import { z } from "zod";

import {
  ApiError,
  asyncHandler,
  createServiceApp,
  publishEvent,
  requireRoles,
  type RequestWithAuth,
  type ServiceEnv
} from "@hospital/common";
import { KAFKA_TOPICS } from "@hospital/contracts";

import {
  getDoctorById,
  getDoctorByStaffUserId,
  getDoctorForAdmin,
  listDoctors,
  listDoctorsForAdmin,
  syncDoctorStaffStatus,
  updateDoctorProfile
} from "./repositories/doctor-repository.js";
import {
  createScheduleException,
  listDoctorExceptions,
  listDoctorSchedules,
  replaceDoctorSchedules
} from "./repositories/schedule-repository.js";

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);

const doctorProfileSchema = z
  .object({
    fullName: z.string().min(2).max(120).optional(),
    specialty: z.string().min(2).max(120).optional(),
    timezone: z.string().min(2).max(80).optional(),
    bio: z.string().max(2000).nullable().optional(),
    phoneNumber: z.string().min(7).max(25).nullable().optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided"
  });

const scheduleSchema = z.object({
  schedules: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: timeSchema,
      endTime: timeSchema
    })
  )
});

const exceptionSchema = z.object({
  exceptionDate: z.string().date(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  reason: z.string().min(3).max(500),
  applyToBookedAppointments: z.boolean().optional()
});

type DoctorContext = {
  env: ServiceEnv;
  pool: Pool;
  redis: {
    keys: (pattern: string) => Promise<string[]>;
    del: (keys: string | string[]) => Promise<number>;
  };
  producer: Producer;
};

const invalidateDoctorAvailabilityCache = async (
  redis: { keys: (pattern: string) => Promise<string[]>; del: (keys: string | string[]) => Promise<number> },
  doctorId: string
) => {
  const keys = await redis.keys(`availability:${doctorId}:*`);
  if (keys.length > 0) {
    await redis.del(keys);
  }
};

const resolveDoctorContext = async (pool: Pool, auth: RequestWithAuth["auth"]) => {
  if (!auth?.staffUserId || auth.role !== "doctor") {
    throw new ApiError(403, "Forbidden");
  }

  const doctor = await getDoctorByStaffUserId(pool, auth.staffUserId);
  if (!doctor) {
    throw new ApiError(404, "Doctor profile not found");
  }

  if (doctor.status !== "active") {
    throw new ApiError(403, "Doctor account is inactive");
  }

  return doctor;
};

export const createDoctorApp = ({ env, pool, redis, producer }: DoctorContext) => {
  const app = createServiceApp("doctor-service", env.frontendOrigin);

  app.get(
    "/doctors",
    asyncHandler(async (_req, res) => {
      const doctors = await listDoctors(pool);
      res.status(200).json(doctors);
    })
  );

  app.get(
    "/doctors/:doctorId",
    asyncHandler(async (req, res) => {
      const doctorId = req.params.doctorId;
      if (typeof doctorId !== "string") {
        throw new ApiError(400, "Invalid doctor id");
      }

      const doctor = await getDoctorById(pool, doctorId);
      if (!doctor) {
        throw new ApiError(404, "Doctor not found");
      }

      res.status(200).json(doctor);
    })
  );

  app.get(
    "/doctors/me/profile",
    requireRoles(env.jwtAccessSecret, ["doctor"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const doctor = await resolveDoctorContext(pool, (req as RequestWithAuth).auth);
      res.status(200).json(doctor);
    })
  );

  app.patch(
    "/doctors/me/profile",
    requireRoles(env.jwtAccessSecret, ["doctor"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const doctor = await resolveDoctorContext(pool, auth);
      const payload = doctorProfileSchema.parse(req.body);
      const updated = await updateDoctorProfile(pool, doctor.id, payload);
      if (!updated) {
        throw new ApiError(404, "Doctor not found");
      }

      await publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, doctor.id, {
        eventType: "doctor.profile.updated",
        actorType: "doctor",
        actorId: auth?.userId ?? doctor.id,
        metadata: payload,
        occurredAt: new Date().toISOString()
      });

      res.status(200).json(updated);
    })
  );

  app.get(
    "/doctors/me/schedule",
    requireRoles(env.jwtAccessSecret, ["doctor"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const doctor = await resolveDoctorContext(pool, (req as RequestWithAuth).auth);
      const [schedules, exceptions] = await Promise.all([
        listDoctorSchedules(pool, doctor.id),
        listDoctorExceptions(pool, doctor.id)
      ]);

      res.status(200).json({
        schedules,
        exceptions
      });
    })
  );

  app.put(
    "/doctors/me/schedule",
    requireRoles(env.jwtAccessSecret, ["doctor"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const doctor = await resolveDoctorContext(pool, auth);
      const payload = scheduleSchema.parse(req.body);
      const schedules = await replaceDoctorSchedules(pool, doctor.id, payload.schedules);
      await invalidateDoctorAvailabilityCache(redis, doctor.id);

      await publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, doctor.id, {
        eventType: "doctor.schedule.updated",
        actorType: "doctor",
        actorId: auth?.userId ?? doctor.id,
        metadata: {
          schedules: payload.schedules
        },
        occurredAt: new Date().toISOString()
      });

      res.status(200).json({
        schedules
      });
    })
  );

  app.post(
    "/doctors/me/exceptions",
    requireRoles(env.jwtAccessSecret, ["doctor"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const doctor = await resolveDoctorContext(pool, auth);
      const payload = exceptionSchema.parse(req.body);
      const result = await createScheduleException(pool, doctor.id, {
        ...payload,
        createdById: auth?.userId ?? doctor.id,
        createdByRole: "doctor"
      });

      if (result.conflicts.length > 0 && !payload.applyToBookedAppointments) {
        res.status(409).json({
          error: "Exception overlaps booked appointments",
          affectedAppointments: result.conflicts
        });
        return;
      }

      await invalidateDoctorAvailabilityCache(redis, doctor.id);

      await Promise.all([
        publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, doctor.id, {
          eventType: "doctor.schedule.exception.created",
          actorType: "doctor",
          actorId: auth?.userId ?? doctor.id,
          metadata: {
            reason: payload.reason,
            exceptionDate: payload.exceptionDate,
            affectedAppointments: result.conflicts.map((conflict) => conflict.appointmentId)
          },
          occurredAt: new Date().toISOString()
        }),
        ...result.conflicts.flatMap((conflict) => [
          publishEvent(producer, KAFKA_TOPICS.APPOINTMENT_CANCELLED, conflict.appointmentId, {
            appointmentId: conflict.appointmentId,
            patientId: conflict.patientId,
            doctorId: doctor.id,
            slotStart: conflict.slotStart,
            reason: payload.reason,
            cancelledByRole: "doctor",
            cancelledById: auth?.userId ?? doctor.id
          }),
          publishEvent(producer, KAFKA_TOPICS.NOTIFICATION_REQUESTED, conflict.appointmentId, {
            notificationId: crypto.randomUUID(),
            channel: "email",
            destination: conflict.patientEmail,
            template: "appointment_cancelled",
            data: {
              appointmentId: conflict.appointmentId,
              slotStart: conflict.slotStart,
              reason: payload.reason,
              doctorName: conflict.doctorName
            },
            requestedAt: new Date().toISOString()
          })
        ])
      ]);

      res.status(201).json(result);
    })
  );

  app.get(
    "/admin/doctors",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (_req, res) => {
      const doctors = await listDoctorsForAdmin(pool);
      res.status(200).json({
        doctors
      });
    })
  );

  app.get(
    "/admin/doctors/:doctorId",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const doctorId = req.params.doctorId;
      if (typeof doctorId !== "string") {
        throw new ApiError(400, "Invalid doctor id");
      }

      const doctor = await getDoctorForAdmin(pool, doctorId);
      if (!doctor) {
        throw new ApiError(404, "Doctor not found");
      }

      const [schedules, exceptions] = await Promise.all([
        listDoctorSchedules(pool, doctorId),
        listDoctorExceptions(pool, doctorId)
      ]);

      res.status(200).json({
        doctor,
        schedules,
        exceptions
      });
    })
  );

  app.patch(
    "/admin/doctors/:doctorId",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const doctorId = req.params.doctorId;
      if (typeof doctorId !== "string") {
        throw new ApiError(400, "Invalid doctor id");
      }

      const payload = doctorProfileSchema.parse(req.body);
      const updated = await updateDoctorProfile(pool, doctorId, payload);
      if (!updated) {
        throw new ApiError(404, "Doctor not found");
      }

      if (payload.status) {
        await syncDoctorStaffStatus(pool, doctorId, payload.status);
      }

      await invalidateDoctorAvailabilityCache(redis, doctorId);

      await publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, doctorId, {
        eventType: "admin.doctor.updated",
        actorType: "admin",
        actorId: auth?.userId ?? doctorId,
        metadata: payload,
        occurredAt: new Date().toISOString()
      });

      res.status(200).json(updated);
    })
  );

  app.get(
    "/admin/doctors/:doctorId/schedule",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const doctorId = req.params.doctorId;
      if (typeof doctorId !== "string") {
        throw new ApiError(400, "Invalid doctor id");
      }

      const [schedules, exceptions] = await Promise.all([
        listDoctorSchedules(pool, doctorId),
        listDoctorExceptions(pool, doctorId)
      ]);

      res.status(200).json({
        schedules,
        exceptions
      });
    })
  );

  app.put(
    "/admin/doctors/:doctorId/schedule",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const doctorId = req.params.doctorId;
      if (typeof doctorId !== "string") {
        throw new ApiError(400, "Invalid doctor id");
      }

      const payload = scheduleSchema.parse(req.body);
      const schedules = await replaceDoctorSchedules(pool, doctorId, payload.schedules);
      await invalidateDoctorAvailabilityCache(redis, doctorId);

      await publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, doctorId, {
        eventType: "admin.doctor.schedule.updated",
        actorType: "admin",
        actorId: auth?.userId ?? doctorId,
        metadata: {
          schedules: payload.schedules
        },
        occurredAt: new Date().toISOString()
      });

      res.status(200).json({
        schedules
      });
    })
  );

  app.post(
    "/admin/doctors/:doctorId/exceptions",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const doctorId = req.params.doctorId;
      if (typeof doctorId !== "string") {
        throw new ApiError(400, "Invalid doctor id");
      }

      const payload = exceptionSchema.parse(req.body);
      const result = await createScheduleException(pool, doctorId, {
        ...payload,
        createdById: auth?.userId ?? doctorId,
        createdByRole: "admin"
      });

      if (result.conflicts.length > 0 && !payload.applyToBookedAppointments) {
        res.status(409).json({
          error: "Exception overlaps booked appointments",
          affectedAppointments: result.conflicts
        });
        return;
      }

      await invalidateDoctorAvailabilityCache(redis, doctorId);

      await Promise.all([
        publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, doctorId, {
          eventType: "admin.doctor.schedule.exception.created",
          actorType: "admin",
          actorId: auth?.userId ?? doctorId,
          metadata: {
            reason: payload.reason,
            exceptionDate: payload.exceptionDate,
            affectedAppointments: result.conflicts.map((conflict) => conflict.appointmentId)
          },
          occurredAt: new Date().toISOString()
        }),
        ...result.conflicts.flatMap((conflict) => [
          publishEvent(producer, KAFKA_TOPICS.APPOINTMENT_CANCELLED, conflict.appointmentId, {
            appointmentId: conflict.appointmentId,
            patientId: conflict.patientId,
            doctorId,
            slotStart: conflict.slotStart,
            reason: payload.reason,
            cancelledByRole: "admin",
            cancelledById: auth?.userId ?? doctorId
          }),
          publishEvent(producer, KAFKA_TOPICS.NOTIFICATION_REQUESTED, conflict.appointmentId, {
            notificationId: crypto.randomUUID(),
            channel: "email",
            destination: conflict.patientEmail,
            template: "appointment_cancelled",
            data: {
              appointmentId: conflict.appointmentId,
              slotStart: conflict.slotStart,
              reason: payload.reason,
              doctorName: conflict.doctorName
            },
            requestedAt: new Date().toISOString()
          })
        ])
      ]);

      res.status(201).json(result);
    })
  );

  return app;
};
