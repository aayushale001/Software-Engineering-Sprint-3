import type { PoolClient } from "pg";
import { v4 as uuidv4 } from "uuid";

import { ApiError, insertOutboxEvent } from "@hospital/common";
import { KAFKA_TOPICS } from "@hospital/contracts";

export type AppointmentHold = {
  id: string;
  patientId: string;
  doctorId: string;
  slotStart: string;
  expiresAt: Date;
};

export type AppointmentRow = {
  id: string;
  patientId: string;
  doctorId: string;
  slotStart: string;
  slotEnd: string;
  status: string;
  reason: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  patientName: string | null;
  patientEmail: string;
  doctorName: string | null;
};

type CancellationActor = {
  role: "patient" | "doctor" | "admin";
  userId: string;
  patientId?: string | null;
  doctorId?: string | null;
  reason?: string;
};

const APPOINTMENT_SELECT = `
  SELECT
    a.id,
    a.patient_id AS "patientId",
    a.doctor_id AS "doctorId",
    a.slot_start::text AS "slotStart",
    a.slot_end::text AS "slotEnd",
    a.status,
    a.reason,
    a.cancellation_reason AS "cancellationReason",
    a.created_at AS "createdAt",
    p.full_name AS "patientName",
    p.email AS "patientEmail",
    d.full_name AS "doctorName"
  FROM appointment.appointments a
  INNER JOIN patient.patients p ON p.id = a.patient_id
  INNER JOIN doctor.doctors d ON d.id = a.doctor_id
`;

export const createHold = async (
  client: PoolClient,
  input: {
    patientId: string;
    doctorId: string;
    slotStart: string;
    holdExpiresAt: Date;
    reason?: string;
  }
): Promise<AppointmentHold> => {
  const slotQuery = await client.query<{
    status: "available" | "held" | "booked";
    heldByPatientId: string | null;
    slotStart: Date;
  }>(
    `
      SELECT
        ds.status,
        ds.held_by_patient_id AS "heldByPatientId",
        ds.slot_start AS "slotStart"
      FROM doctor.doctor_slots ds
      INNER JOIN doctor.doctors d ON d.id = ds.doctor_id
      WHERE ds.doctor_id = $1
        AND ds.slot_start = $2::timestamptz
        AND d.status = 'active'
      FOR UPDATE
    `,
    [input.doctorId, input.slotStart]
  );

  const slot = slotQuery.rows[0];
  if (!slot) {
    throw new ApiError(404, "Slot not found");
  }

  if (slot.status !== "available") {
    throw new ApiError(409, "Slot is not available");
  }

  await client.query(
    `
      UPDATE doctor.doctor_slots
      SET status = 'held', held_by_patient_id = $1, hold_expires_at = $2
      WHERE doctor_id = $3
        AND slot_start = $4::timestamptz
    `,
    [input.patientId, input.holdExpiresAt, input.doctorId, input.slotStart]
  );

  const holdResult = await client.query<AppointmentHold>(
    `
      INSERT INTO appointment.appointment_holds (patient_id, doctor_id, slot_start, expires_at, status, metadata)
      VALUES ($1, $2, $3::timestamptz, $4, 'active', $5::jsonb)
      RETURNING id, patient_id AS "patientId", doctor_id AS "doctorId", slot_start::text AS "slotStart", expires_at AS "expiresAt"
    `,
    [input.patientId, input.doctorId, input.slotStart, input.holdExpiresAt, JSON.stringify({ reason: input.reason ?? null })]
  );

  const hold = holdResult.rows[0];

  await insertOutboxEvent(client, "appointment", KAFKA_TOPICS.APPOINTMENT_HOLD_CREATED, "appointment_hold", hold.id, {
    holdId: hold.id,
    doctorId: hold.doctorId,
    patientId: hold.patientId,
    slotStart: hold.slotStart,
    expiresAt: hold.expiresAt.toISOString()
  });

  await insertOutboxEvent(client, "appointment", KAFKA_TOPICS.DOCTOR_AVAILABILITY_UPDATED, "doctor_slot", `${hold.doctorId}:${hold.slotStart}`, {
    doctorId: hold.doctorId,
    slotStart: hold.slotStart,
    status: "held",
    patientId: hold.patientId,
    eventType: "slot_held"
  });

  return hold;
};

export const findHoldForConfirmation = async (
  client: PoolClient,
  holdId: string,
  patientId: string
): Promise<AppointmentHold> => {
  const holdResult = await client.query<AppointmentHold>(
    `
      SELECT
        id,
        patient_id AS "patientId",
        doctor_id AS "doctorId",
        slot_start::text AS "slotStart",
        expires_at AS "expiresAt"
      FROM appointment.appointment_holds
      WHERE id = $1
        AND patient_id = $2
        AND status = 'active'
      FOR UPDATE
    `,
    [holdId, patientId]
  );

  const hold = holdResult.rows[0];
  if (!hold) {
    throw new ApiError(404, "Hold not found");
  }

  if (hold.expiresAt.getTime() < Date.now()) {
    throw new ApiError(409, "Hold has expired");
  }

  const slotResult = await client.query<{
    status: "available" | "held" | "booked";
    heldByPatientId: string | null;
  }>(
    `
      SELECT status, held_by_patient_id AS "heldByPatientId"
      FROM doctor.doctor_slots
      WHERE doctor_id = $1
        AND slot_start = $2::timestamptz
      FOR UPDATE
    `,
    [hold.doctorId, hold.slotStart]
  );

  const slot = slotResult.rows[0];
  if (!slot || slot.status !== "held" || slot.heldByPatientId !== patientId) {
    throw new ApiError(409, "Slot lock is not active for this patient");
  }

  return hold;
};

export const confirmHold = async (
  client: PoolClient,
  hold: AppointmentHold,
  reason?: string
): Promise<AppointmentRow> => {
  const slotEnd = new Date(new Date(hold.slotStart).getTime() + 30 * 60 * 1000);

  const created = await client.query<AppointmentRow>(
    `
      INSERT INTO appointment.appointments (patient_id, doctor_id, slot_start, slot_end, status, reason)
      VALUES ($1, $2, $3::timestamptz, $4::timestamptz, 'confirmed', $5)
      RETURNING
        id,
        patient_id AS "patientId",
        doctor_id AS "doctorId",
        slot_start::text AS "slotStart",
        slot_end::text AS "slotEnd",
        status,
        reason,
        cancellation_reason AS "cancellationReason",
        created_at AS "createdAt",
        NULL::text AS "patientName",
        ''::text AS "patientEmail",
        NULL::text AS "doctorName"
    `,
    [hold.patientId, hold.doctorId, hold.slotStart, slotEnd.toISOString(), reason ?? null]
  );

  const appointment = created.rows[0];

  await client.query(
    `
      UPDATE appointment.appointment_holds
      SET status = 'confirmed', confirmed_at = NOW()
      WHERE id = $1
    `,
    [hold.id]
  );

  await client.query(
    `
      UPDATE doctor.doctor_slots
      SET status = 'booked', held_by_patient_id = NULL, hold_expires_at = NULL
      WHERE doctor_id = $1
        AND slot_start = $2::timestamptz
    `,
    [hold.doctorId, hold.slotStart]
  );

  const patientResult = await client.query<{ email: string; doctorName: string }>(
    `
      SELECT p.email, d.full_name AS "doctorName"
      FROM patient.patients p
      INNER JOIN doctor.doctors d ON d.id = $2
      WHERE p.id = $1
      LIMIT 1
    `,
    [hold.patientId, hold.doctorId]
  );

  await insertOutboxEvent(client, "appointment", KAFKA_TOPICS.APPOINTMENT_CONFIRMED, "appointment", appointment.id, {
    appointmentId: appointment.id,
    doctorId: appointment.doctorId,
    patientId: appointment.patientId,
    slotStart: appointment.slotStart,
    slotEnd: appointment.slotEnd,
    status: appointment.status
  });

  await insertOutboxEvent(client, "appointment", KAFKA_TOPICS.DOCTOR_AVAILABILITY_UPDATED, "doctor_slot", `${appointment.doctorId}:${appointment.slotStart}`, {
    doctorId: appointment.doctorId,
    slotStart: appointment.slotStart,
    status: "booked",
    patientId: appointment.patientId,
    eventType: "slot_booked"
  });

  const patientEmail = patientResult.rows[0]?.email;
  const doctorName = patientResult.rows[0]?.doctorName;

  if (patientEmail) {
    await insertOutboxEvent(client, "appointment", KAFKA_TOPICS.NOTIFICATION_REQUESTED, "appointment", appointment.id, {
      notificationId: uuidv4(),
      channel: "email",
      template: "appointment_confirmed",
      destination: patientEmail,
      data: {
        appointmentId: appointment.id,
        slotStart: appointment.slotStart,
        doctorName
      },
      requestedAt: new Date().toISOString()
    });
  }

  return {
    ...appointment,
    patientEmail: patientEmail ?? "",
    doctorName: doctorName ?? null
  };
};

export const getAppointmentsByPatient = async (
  client: PoolClient,
  patientId: string,
  status?: string
): Promise<AppointmentRow[]> => {
  const params: unknown[] = [patientId];
  let sql = `${APPOINTMENT_SELECT} WHERE a.patient_id = $1`;

  if (status) {
    params.push(status);
    sql += ` AND a.status = $2`;
  }

  sql += " ORDER BY a.slot_start DESC";

  const result = await client.query<AppointmentRow>(sql, params);
  return result.rows;
};

export const getAppointmentsByDoctor = async (
  client: PoolClient,
  doctorId: string,
  status?: string
): Promise<AppointmentRow[]> => {
  const params: unknown[] = [doctorId];
  let sql = `${APPOINTMENT_SELECT} WHERE a.doctor_id = $1`;

  if (status) {
    params.push(status);
    sql += ` AND a.status = $2`;
  }

  sql += " ORDER BY a.slot_start DESC";

  const result = await client.query<AppointmentRow>(sql, params);
  return result.rows;
};

export const getAllAppointments = async (client: PoolClient, status?: string): Promise<AppointmentRow[]> => {
  const params: unknown[] = [];
  let sql = APPOINTMENT_SELECT;

  if (status) {
    params.push(status);
    sql += ` WHERE a.status = $1`;
  }

  sql += " ORDER BY a.slot_start DESC";

  const result = await client.query<AppointmentRow>(sql, params);
  return result.rows;
};

export const cancelAppointmentByActor = async (
  client: PoolClient,
  appointmentId: string,
  actor: CancellationActor
): Promise<AppointmentRow> => {
  const params: unknown[] = [appointmentId];
  const clauses = ["a.id = $1"];

  if (actor.role === "patient") {
    params.push(actor.patientId ?? actor.userId);
    clauses.push(`a.patient_id = $${params.length}`);
  }

  if (actor.role === "doctor") {
    params.push(actor.doctorId);
    clauses.push(`a.doctor_id = $${params.length}`);
  }

  const appointmentResult = await client.query<AppointmentRow>(
    `${APPOINTMENT_SELECT}
      WHERE ${clauses.join(" AND ")}
      FOR UPDATE`,
    params
  );

  const appointment = appointmentResult.rows[0];
  if (!appointment) {
    throw new ApiError(404, "Appointment not found");
  }

  if (appointment.status === "cancelled") {
    return appointment;
  }

  await client.query(
    `
      UPDATE appointment.appointments
      SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $2
      WHERE id = $1
    `,
    [appointmentId, actor.reason ?? null]
  );

  await client.query(
    `
      UPDATE doctor.doctor_slots
      SET status = 'available', held_by_patient_id = NULL, hold_expires_at = NULL
      WHERE doctor_id = $1
        AND slot_start = $2::timestamptz
    `,
    [appointment.doctorId, appointment.slotStart]
  );

  await insertOutboxEvent(client, "appointment", KAFKA_TOPICS.APPOINTMENT_CANCELLED, "appointment", appointment.id, {
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    slotStart: appointment.slotStart,
    cancelledByRole: actor.role,
    cancelledById: actor.userId,
    reason: actor.reason ?? null
  });

  await insertOutboxEvent(client, "appointment", KAFKA_TOPICS.DOCTOR_AVAILABILITY_UPDATED, "doctor_slot", `${appointment.doctorId}:${appointment.slotStart}`, {
    doctorId: appointment.doctorId,
    slotStart: appointment.slotStart,
    status: "available",
    patientId: null,
    eventType: "slot_released"
  });

  await insertOutboxEvent(client, "appointment", KAFKA_TOPICS.NOTIFICATION_REQUESTED, "appointment", appointment.id, {
    notificationId: uuidv4(),
    channel: "email",
    destination: appointment.patientEmail,
    template: "appointment_cancelled",
    data: {
      appointmentId: appointment.id,
      slotStart: appointment.slotStart,
      reason: actor.reason ?? "Appointment cancelled",
      doctorName: appointment.doctorName
    },
    requestedAt: new Date().toISOString()
  });

  return {
    ...appointment,
    status: "cancelled",
    cancellationReason: actor.reason ?? null
  };
};

export const getIdempotentResponse = async (
  client: PoolClient,
  patientId: string,
  endpoint: string,
  key: string
): Promise<Record<string, unknown> | null> => {
  const result = await client.query<{ responseJson: Record<string, unknown> }>(
    `
      SELECT response_json AS "responseJson"
      FROM appointment.idempotency_keys
      WHERE patient_id = $1
        AND endpoint = $2
        AND idempotency_key = $3
      LIMIT 1
    `,
    [patientId, endpoint, key]
  );

  return result.rows[0]?.responseJson ?? null;
};

export const storeIdempotentResponse = async (
  client: PoolClient,
  patientId: string,
  endpoint: string,
  key: string,
  responseJson: Record<string, unknown>
): Promise<void> => {
  await client.query(
    `
      INSERT INTO appointment.idempotency_keys (patient_id, endpoint, idempotency_key, response_json)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (patient_id, endpoint, idempotency_key)
      DO NOTHING
    `,
    [patientId, endpoint, key, JSON.stringify(responseJson)]
  );
};
