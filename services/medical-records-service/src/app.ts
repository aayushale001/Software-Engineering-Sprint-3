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

import { invalidatePatientRecordsCache, makeRecordsCacheKey } from "./cache.js";
import {
  createMedicalRecord,
  doctorHasPatientAccess,
  getMedicalRecordById,
  getMedicalRecords,
  updateMedicalRecord
} from "./repositories/medical-records-repository.js";

const listQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  type: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0)
});

const createRecordSchema = z.object({
  recordType: z.string().min(2).max(60),
  title: z.string().min(3).max(120),
  recordDate: z.string().date(),
  entries: z.array(
    z.object({
      key: z.string().min(1).max(100),
      value: z.string().min(1).max(5000)
    })
  )
});

const updateRecordSchema = z
  .object({
    recordType: z.string().min(2).max(60).optional(),
    title: z.string().min(3).max(120).optional(),
    recordDate: z.string().date().optional(),
    entries: z
      .array(
        z.object({
          key: z.string().min(1).max(100),
          value: z.string().min(1).max(5000)
        })
      )
      .optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided"
  });

type MedicalRecordsContext = {
  env: ServiceEnv;
  pool: Pool;
  redis: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, options: { EX: number }) => Promise<unknown>;
    keys: (pattern: string) => Promise<string[]>;
    del: (keys: string | string[]) => Promise<number>;
  };
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

export const createMedicalRecordsApp = ({ env, pool, redis, producer }: MedicalRecordsContext) => {
  const app = createServiceApp("medical-records-service", env.frontendOrigin);

  app.get(
    "/patients/me/records",
    requireRoles(env.jwtAccessSecret, ["patient"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.patientId) {
        throw new ApiError(401, "Unauthorized");
      }

      const query = listQuerySchema.parse(req.query);
      const cacheKey = makeRecordsCacheKey(auth.patientId, query);
      const cached = await redis.get(cacheKey);

      if (cached) {
        res.status(200).json({
          source: "cache",
          records: JSON.parse(cached)
        });
        return;
      }

      const records = await getMedicalRecords(pool, auth.patientId, query);
      await redis.set(cacheKey, JSON.stringify(records), {
        EX: 60
      });

      await publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, auth.patientId, {
        eventType: "medical.records.list.viewed",
        actorType: "patient",
        actorId: auth.patientId,
        occurredAt: new Date().toISOString(),
        metadata: {
          filter: query
        }
      });

      res.status(200).json({
        source: "database",
        records
      });
    })
  );

  app.get(
    "/patients/me/records/:recordId",
    requireRoles(env.jwtAccessSecret, ["patient"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.patientId) {
        throw new ApiError(401, "Unauthorized");
      }

      const recordId = req.params.recordId;
      if (typeof recordId !== "string") {
        throw new ApiError(400, "Invalid record id");
      }

      const record = await getMedicalRecordById(pool, auth.patientId, recordId);
      if (!record) {
        throw new ApiError(404, "Record not found");
      }

      await publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, auth.patientId, {
        eventType: "medical.record.detail.viewed",
        actorType: "patient",
        actorId: auth.patientId,
        occurredAt: new Date().toISOString(),
        metadata: {
          recordId
        }
      });

      res.status(200).json(record);
    })
  );

  app.post(
    "/patients/me/records",
    requireRoles(env.jwtAccessSecret, ["patient"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.patientId) {
        throw new ApiError(401, "Unauthorized");
      }

      const input = createRecordSchema.parse(req.body);
      const record = await createMedicalRecord(pool, {
        patientId: auth.patientId,
        ...input
      });

      await invalidatePatientRecordsCache(redis, auth.patientId);

      await Promise.all([
        publishEvent(producer, KAFKA_TOPICS.MEDICAL_RECORD_CREATED, record.id, {
          recordId: record.id,
          patientId: auth.patientId,
          recordType: record.recordType,
          recordDate: record.recordDate,
          createdAt: record.createdAt.toISOString()
        }),
        publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, auth.patientId, {
          eventType: "medical.record.created",
          actorType: "patient",
          actorId: auth.patientId,
          occurredAt: new Date().toISOString(),
          metadata: {
            recordId: record.id
          }
        })
      ]);

      res.status(201).json(record);
    })
  );

  app.patch(
    "/patients/me/records/:recordId",
    requireRoles(env.jwtAccessSecret, ["patient"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth?.patientId) {
        throw new ApiError(401, "Unauthorized");
      }

      const recordId = req.params.recordId;
      if (typeof recordId !== "string") {
        throw new ApiError(400, "Invalid record id");
      }

      const payload = updateRecordSchema.parse(req.body);
      const record = await updateMedicalRecord(pool, {
        patientId: auth.patientId,
        recordId,
        ...payload
      });

      if (!record) {
        throw new ApiError(404, "Record not found");
      }

      await invalidatePatientRecordsCache(redis, auth.patientId);

      await publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, auth.patientId, {
        eventType: "medical.record.updated",
        actorType: "patient",
        actorId: auth.patientId,
        occurredAt: new Date().toISOString(),
        metadata: {
          recordId
        }
      });

      res.status(200).json(record);
    })
  );

  app.get(
    "/doctors/me/patients/:patientId/records",
    requireRoles(env.jwtAccessSecret, ["doctor"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const patientId = req.params.patientId;
      if (typeof patientId !== "string") {
        throw new ApiError(400, "Invalid patient id");
      }

      await ensureDoctorPatientAccess(pool, auth, patientId);
      const query = listQuerySchema.parse(req.query);
      const records = await getMedicalRecords(pool, patientId, query);

      await publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, patientId, {
        eventType: "doctor.patient.records.viewed",
        actorType: "doctor",
        actorId: auth?.userId ?? patientId,
        metadata: {
          patientId,
          filter: query
        },
        occurredAt: new Date().toISOString()
      });

      res.status(200).json({
        records
      });
    })
  );

  app.get(
    "/doctors/me/patients/:patientId/records/:recordId",
    requireRoles(env.jwtAccessSecret, ["doctor"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const patientId = req.params.patientId;
      const recordId = req.params.recordId;
      if (typeof patientId !== "string" || typeof recordId !== "string") {
        throw new ApiError(400, "Invalid identifiers");
      }

      await ensureDoctorPatientAccess(pool, auth, patientId);
      const record = await getMedicalRecordById(pool, patientId, recordId);
      if (!record) {
        throw new ApiError(404, "Record not found");
      }

      await publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, patientId, {
        eventType: "doctor.patient.record.viewed",
        actorType: "doctor",
        actorId: auth?.userId ?? patientId,
        metadata: {
          patientId,
          recordId
        },
        occurredAt: new Date().toISOString()
      });

      res.status(200).json(record);
    })
  );

  app.get(
    "/admin/patients/:patientId/records",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const patientId = req.params.patientId;
      if (typeof patientId !== "string") {
        throw new ApiError(400, "Invalid patient id");
      }

      const query = listQuerySchema.parse(req.query);
      const records = await getMedicalRecords(pool, patientId, query);

      await publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, patientId, {
        eventType: "admin.patient.records.viewed",
        actorType: "admin",
        actorId: auth?.userId ?? patientId,
        metadata: {
          patientId,
          filter: query
        },
        occurredAt: new Date().toISOString()
      });

      res.status(200).json({
        records
      });
    })
  );

  app.get(
    "/admin/patients/:patientId/records/:recordId",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      const patientId = req.params.patientId;
      const recordId = req.params.recordId;
      if (typeof patientId !== "string" || typeof recordId !== "string") {
        throw new ApiError(400, "Invalid identifiers");
      }

      const record = await getMedicalRecordById(pool, patientId, recordId);
      if (!record) {
        throw new ApiError(404, "Record not found");
      }

      await publishEvent(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, patientId, {
        eventType: "admin.patient.record.viewed",
        actorType: "admin",
        actorId: auth?.userId ?? patientId,
        metadata: {
          patientId,
          recordId
        },
        occurredAt: new Date().toISOString()
      });

      res.status(200).json(record);
    })
  );

  return app;
};
