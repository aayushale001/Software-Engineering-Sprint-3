import type { Pool } from "pg";
import type { Producer } from "kafkajs";
import { z } from "zod";

import {
  ApiError,
  asyncHandler,
  createServiceApp,
  publishEventSafely,
  requireRoles,
  type RequestWithAuth,
  type ServiceEnv
} from "@hospital/common";
import { KAFKA_TOPICS } from "@hospital/contracts";

import {
  doctorHasPatientAccess,
  getPatientProfile,
  listPatients,
  updatePatientProfile,
  updatePatientStatus
} from "./repositories/patient-repository.js";

const updateProfileSchema = z
  .object({
    fullName: z.string().min(2).max(120).optional(),
    dateOfBirth: z.string().date().optional(),
    phoneNumber: z.string().min(7).max(25).optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided"
  });

const updateStatusSchema = z.object({
  status: z.enum(["active", "inactive"])
});

type PatientContext = {
  env: ServiceEnv;
  pool: Pool;
  producer: Producer;
};

const ensureDoctorPatientAccess = async (pool: Pool, auth: RequestWithAuth["auth"], patientId: string) => {
  if (!auth?.doctorId) {
    throw new ApiError(403, "Forbidden");
  }

  const allowed = await doctorHasPatientAccess(pool, auth.doctorId, patientId);
  if (!allowed) {
    throw new ApiError(403, "Forbidden");
  }
};

export const createPatientApp = ({ env, pool, producer }: PatientContext) => {
  const app = createServiceApp("patient-service", env.frontendOrigin);

  app.get(
    "/patients/me/profile",
    requireRoles(env.jwtAccessSecret, ["patient"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.patientId) {
        throw new ApiError(401, "Unauthorized");
      }

      const profile = await getPatientProfile(pool, auth.patientId);
      if (!profile) {
        throw new ApiError(404, "Patient profile not found");
      }

      if (profile.status !== "active") {
        throw new ApiError(403, "Patient account is inactive");
      }

      await publishEventSafely(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, auth.patientId, {
        eventType: "patient.profile.viewed",
        actorType: "patient",
        actorId: auth.patientId,
        occurredAt: new Date().toISOString()
      });

      res.status(200).json(profile);
    })
  );

  app.patch(
    "/patients/me/profile",
    requireRoles(env.jwtAccessSecret, ["patient"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.patientId) {
        throw new ApiError(401, "Unauthorized");
      }

      const payload = updateProfileSchema.parse(req.body);
      const profile = await updatePatientProfile(pool, auth.patientId, payload);
      if (!profile) {
        throw new ApiError(404, "Patient profile not found");
      }

      await publishEventSafely(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, auth.patientId, {
        eventType: "patient.profile.updated",
        actorType: "patient",
        actorId: auth.patientId,
        occurredAt: new Date().toISOString(),
        metadata: payload
      });

      res.status(200).json({
        profile
      });
    })
  );

  app.get(
    "/doctors/me/patients/:patientId/profile",
    requireRoles(env.jwtAccessSecret, ["doctor"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const patientId = req.params.patientId;
      if (typeof patientId !== "string") {
        throw new ApiError(400, "Invalid patient id");
      }

      await ensureDoctorPatientAccess(pool, auth, patientId);
      const profile = await getPatientProfile(pool, patientId);
      if (!profile) {
        throw new ApiError(404, "Patient profile not found");
      }

      await publishEventSafely(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, patientId, {
        eventType: "doctor.patient.profile.viewed",
        actorType: "doctor",
        actorId: auth?.userId ?? patientId,
        metadata: {
          patientId
        },
        occurredAt: new Date().toISOString()
      });

      res.status(200).json(profile);
    })
  );

  app.get(
    "/admin/patients",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (_req, res) => {
      const patients = await listPatients(pool);
      res.status(200).json({
        patients
      });
    })
  );

  app.get(
    "/admin/patients/:patientId/profile",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const patientId = req.params.patientId;
      if (typeof patientId !== "string") {
        throw new ApiError(400, "Invalid patient id");
      }

      const profile = await getPatientProfile(pool, patientId);
      if (!profile) {
        throw new ApiError(404, "Patient profile not found");
      }

      await publishEventSafely(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, patientId, {
        eventType: "admin.patient.profile.viewed",
        actorType: "admin",
        actorId: auth?.userId ?? patientId,
        metadata: {
          patientId
        },
        occurredAt: new Date().toISOString()
      });

      res.status(200).json(profile);
    })
  );

  app.patch(
    "/admin/patients/:patientId/status",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const patientId = req.params.patientId;
      if (typeof patientId !== "string") {
        throw new ApiError(400, "Invalid patient id");
      }

      const { status } = updateStatusSchema.parse(req.body);
      const profile = await updatePatientStatus(pool, patientId, status);
      if (!profile) {
        throw new ApiError(404, "Patient profile not found");
      }

      await publishEventSafely(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, patientId, {
        eventType: "admin.patient.status.updated",
        actorType: "admin",
        actorId: auth?.userId ?? patientId,
        metadata: {
          patientId,
          status
        },
        occurredAt: new Date().toISOString()
      });

      res.status(200).json({
        profile
      });
    })
  );

  return app;
};
