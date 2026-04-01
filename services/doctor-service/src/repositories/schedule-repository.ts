import { v4 as uuidv4 } from "uuid";
import type { Pool, PoolClient } from "pg";

import { ApiError } from "@hospital/common";
import { KAFKA_TOPICS } from "@hospital/contracts";

export type DoctorSchedule = {
  id: string;
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type DoctorScheduleException = {
  id: string;
  doctorId: string;
  exceptionDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  createdByRole: "doctor" | "admin";
  createdById: string;
  createdAt: Date;
};

export type AppointmentConflict = {
  appointmentId: string;
  patientId: string;
  patientEmail: string;
  patientName: string | null;
  slotStart: string;
  slotEnd: string;
  doctorName: string;
};

type ScheduleInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type ExceptionInput = {
  exceptionDate: string;
  startTime?: string;
  endTime?: string;
  reason: string;
  createdByRole: "doctor" | "admin";
  createdById: string;
};

const SLOT_DURATION_MINUTES = 30;
const WINDOW_DAYS = 30;

const timeToMinutes = (value: string): number => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const dateToIsoDay = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

const composeSlotDate = (date: string, time: string): string => {
  return `${date}T${time}:00.000Z`;
};

const overlapsException = (
  date: string,
  slotStart: string,
  slotEnd: string,
  exception: Pick<DoctorScheduleException, "exceptionDate" | "startTime" | "endTime">
): boolean => {
  if (exception.exceptionDate !== date) {
    return false;
  }

  if (!exception.startTime || !exception.endTime) {
    return true;
  }

  const slotStartMinutes = timeToMinutes(slotStart);
  const slotEndMinutes = timeToMinutes(slotEnd);
  const exceptionStart = timeToMinutes(exception.startTime.slice(0, 5));
  const exceptionEnd = timeToMinutes(exception.endTime.slice(0, 5));

  return slotStartMinutes < exceptionEnd && slotEndMinutes > exceptionStart;
};

const getWindowBounds = () => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + WINDOW_DAYS);
  return {
    start,
    end
  };
};

export const listDoctorSchedules = async (pool: Pool, doctorId: string): Promise<DoctorSchedule[]> => {
  const result = await pool.query<DoctorSchedule>(
    `
      SELECT
        id,
        doctor_id AS "doctorId",
        day_of_week AS "dayOfWeek",
        start_time::text AS "startTime",
        end_time::text AS "endTime"
      FROM doctor.doctor_schedules
      WHERE doctor_id = $1
      ORDER BY day_of_week ASC, start_time ASC
    `,
    [doctorId]
  );

  return result.rows;
};

export const listDoctorExceptions = async (pool: Pool, doctorId: string): Promise<DoctorScheduleException[]> => {
  const result = await pool.query<DoctorScheduleException>(
    `
      SELECT
        id,
        doctor_id AS "doctorId",
        exception_date::text AS "exceptionDate",
        start_time::text AS "startTime",
        end_time::text AS "endTime",
        reason,
        created_by_role AS "createdByRole",
        created_by_id AS "createdById",
        created_at AS "createdAt"
      FROM doctor.schedule_exceptions
      WHERE doctor_id = $1
      ORDER BY exception_date DESC, start_time ASC NULLS FIRST
    `,
    [doctorId]
  );

  return result.rows;
};

const deleteFutureUnbookedSlots = async (client: PoolClient, doctorId: string, start: Date, end: Date): Promise<void> => {
  await client.query(
    `
      DELETE FROM doctor.doctor_slots
      WHERE doctor_id = $1
        AND slot_start >= $2
        AND slot_start < $3
        AND status <> 'booked'
    `,
    [doctorId, start.toISOString(), end.toISOString()]
  );
};

const buildSlotRows = (
  schedules: ScheduleInput[],
  exceptions: Array<Pick<DoctorScheduleException, "exceptionDate" | "startTime" | "endTime">>
): Array<{ slotStart: string; slotEnd: string }> => {
  const rows: Array<{ slotStart: string; slotEnd: string }> = [];
  const { start, end } = getWindowBounds();

  for (let cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = dateToIsoDay(cursor);
    const dayOfWeek = cursor.getUTCDay();
    const daySchedules = schedules.filter((schedule) => schedule.dayOfWeek === dayOfWeek);

    for (const schedule of daySchedules) {
      const startMinutes = timeToMinutes(schedule.startTime.slice(0, 5));
      const endMinutes = timeToMinutes(schedule.endTime.slice(0, 5));

      for (let minutes = startMinutes; minutes + SLOT_DURATION_MINUTES <= endMinutes; minutes += SLOT_DURATION_MINUTES) {
        const slotStartTime = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        const slotEndMinutes = minutes + SLOT_DURATION_MINUTES;
        const slotEndTime = `${String(Math.floor(slotEndMinutes / 60)).padStart(2, "0")}:${String(slotEndMinutes % 60).padStart(2, "0")}`;

        const blocked = exceptions.some((exception) => overlapsException(date, slotStartTime, slotEndTime, exception));
        if (blocked) {
          continue;
        }

        rows.push({
          slotStart: composeSlotDate(date, slotStartTime),
          slotEnd: composeSlotDate(date, slotEndTime)
        });
      }
    }
  }

  return rows;
};

const insertGeneratedSlots = async (
  client: PoolClient,
  doctorId: string,
  slots: Array<{ slotStart: string; slotEnd: string }>
): Promise<void> => {
  for (const slot of slots) {
    await client.query(
      `
        INSERT INTO doctor.doctor_slots (doctor_id, slot_start, slot_end, status)
        VALUES ($1, $2::timestamptz, $3::timestamptz, 'available')
        ON CONFLICT (doctor_id, slot_start) DO NOTHING
      `,
      [doctorId, slot.slotStart, slot.slotEnd]
    );
  }
};

export const regenerateDoctorSlots = async (client: PoolClient, doctorId: string): Promise<void> => {
  const schedules = await client.query<ScheduleInput>(
    `
      SELECT
        day_of_week AS "dayOfWeek",
        start_time::text AS "startTime",
        end_time::text AS "endTime"
      FROM doctor.doctor_schedules
      WHERE doctor_id = $1
    `,
    [doctorId]
  );

  const exceptions = await client.query<Array<Pick<DoctorScheduleException, "exceptionDate" | "startTime" | "endTime">>[number]>(
    `
      SELECT
        exception_date::text AS "exceptionDate",
        start_time::text AS "startTime",
        end_time::text AS "endTime"
      FROM doctor.schedule_exceptions
      WHERE doctor_id = $1
        AND exception_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    `,
    [doctorId]
  );

  const { start, end } = getWindowBounds();
  await deleteFutureUnbookedSlots(client, doctorId, start, end);
  const slots = buildSlotRows(schedules.rows, exceptions.rows);
  await insertGeneratedSlots(client, doctorId, slots);
};

export const replaceDoctorSchedules = async (
  pool: Pool,
  doctorId: string,
  schedules: ScheduleInput[]
): Promise<DoctorSchedule[]> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM doctor.doctor_schedules WHERE doctor_id = $1`, [doctorId]);

    for (const schedule of schedules) {
      await client.query(
        `
          INSERT INTO doctor.doctor_schedules (doctor_id, day_of_week, start_time, end_time)
          VALUES ($1, $2, $3::time, $4::time)
        `,
        [doctorId, schedule.dayOfWeek, schedule.startTime, schedule.endTime]
      );
    }

    await regenerateDoctorSlots(client, doctorId);
    const result = await client.query<DoctorSchedule>(
      `
        SELECT
          id,
          doctor_id AS "doctorId",
          day_of_week AS "dayOfWeek",
          start_time::text AS "startTime",
          end_time::text AS "endTime"
        FROM doctor.doctor_schedules
        WHERE doctor_id = $1
        ORDER BY day_of_week ASC, start_time ASC
      `,
      [doctorId]
    );

    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listOverlappingAppointments = async (
  client: PoolClient,
  doctorId: string,
  input: Pick<ExceptionInput, "exceptionDate" | "startTime" | "endTime">
): Promise<AppointmentConflict[]> => {
  const params: unknown[] = [doctorId, input.exceptionDate];
  const clauses = [`a.doctor_id = $1`, `a.status = 'confirmed'`, `a.slot_start::date = $2::date`];

  if (input.startTime && input.endTime) {
    params.push(input.startTime);
    params.push(input.endTime);
    clauses.push(`a.slot_start::time < $4::time`);
    clauses.push(`a.slot_end::time > $3::time`);
  }

  const result = await client.query<AppointmentConflict>(
    `
      SELECT
        a.id AS "appointmentId",
        a.patient_id AS "patientId",
        p.email AS "patientEmail",
        p.full_name AS "patientName",
        a.slot_start::text AS "slotStart",
        a.slot_end::text AS "slotEnd",
        d.full_name AS "doctorName"
      FROM appointment.appointments a
      INNER JOIN patient.patients p ON p.id = a.patient_id
      INNER JOIN doctor.doctors d ON d.id = a.doctor_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY a.slot_start ASC
    `,
    params
  );

  return result.rows;
};

const cancelAppointmentsForException = async (
  client: PoolClient,
  conflicts: AppointmentConflict[],
  reason: string
): Promise<void> => {
  for (const conflict of conflicts) {
    await client.query(
      `
        UPDATE appointment.appointments
        SET status = 'cancelled', cancelled_at = NOW(), reason = $2
        WHERE id = $1
      `,
      [conflict.appointmentId, reason]
    );

    await client.query(
      `
        DELETE FROM doctor.doctor_slots
        WHERE doctor_id = (
          SELECT doctor_id
          FROM appointment.appointments
          WHERE id = $1
        )
          AND slot_start = $2::timestamptz
      `,
      [conflict.appointmentId, conflict.slotStart]
    );
  }
};

const deleteSlotsForException = async (
  client: PoolClient,
  doctorId: string,
  input: Pick<ExceptionInput, "exceptionDate" | "startTime" | "endTime">
): Promise<void> => {
  const params: unknown[] = [doctorId, input.exceptionDate];
  const clauses = [`doctor_id = $1`, `slot_start::date = $2::date`, `status <> 'booked'`];

  if (input.startTime && input.endTime) {
    params.push(input.startTime);
    params.push(input.endTime);
    clauses.push(`slot_start::time < $4::time`);
    clauses.push(`slot_end::time > $3::time`);
  }

  await client.query(
    `
      DELETE FROM doctor.doctor_slots
      WHERE ${clauses.join(" AND ")}
    `,
    params
  );
};

export const createScheduleException = async (
  pool: Pool,
  doctorId: string,
  input: ExceptionInput & {
    applyToBookedAppointments?: boolean;
  }
): Promise<{
  exception: DoctorScheduleException;
  conflicts: AppointmentConflict[];
}> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const conflicts = await listOverlappingAppointments(client, doctorId, input);
    if (conflicts.length > 0 && !input.applyToBookedAppointments) {
      await client.query("ROLLBACK");
      return {
        exception: null as never,
        conflicts
      };
    }

    if (conflicts.length > 0) {
      await cancelAppointmentsForException(client, conflicts, input.reason);
    }

    await deleteSlotsForException(client, doctorId, input);

    const inserted = await client.query<DoctorScheduleException>(
      `
        INSERT INTO doctor.schedule_exceptions (
          doctor_id,
          exception_date,
          start_time,
          end_time,
          reason,
          created_by_role,
          created_by_id
        )
        VALUES ($1, $2::date, $3::time, $4::time, $5, $6, $7)
        RETURNING
          id,
          doctor_id AS "doctorId",
          exception_date::text AS "exceptionDate",
          start_time::text AS "startTime",
          end_time::text AS "endTime",
          reason,
          created_by_role AS "createdByRole",
          created_by_id AS "createdById",
          created_at AS "createdAt"
      `,
      [
        doctorId,
        input.exceptionDate,
        input.startTime ?? null,
        input.endTime ?? null,
        input.reason,
        input.createdByRole,
        input.createdById
      ]
    );

    await client.query("COMMIT");
    return {
      exception: inserted.rows[0],
      conflicts
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const publishExceptionSideEffects = async (
  publish: (topic: string, key: string, payload: Record<string, unknown>) => Promise<void>,
  conflicts: AppointmentConflict[],
  reason: string
): Promise<void> => {
  for (const conflict of conflicts) {
    await Promise.all([
      publish(KAFKA_TOPICS.APPOINTMENT_CANCELLED, conflict.appointmentId, {
        appointmentId: conflict.appointmentId,
        patientId: conflict.patientId,
        doctorId: null,
        slotStart: conflict.slotStart,
        cancelledByRole: "doctor",
        cancelledById: null,
        reason
      }),
      publish(KAFKA_TOPICS.NOTIFICATION_REQUESTED, conflict.appointmentId, {
        notificationId: uuidv4(),
        channel: "email",
        destination: conflict.patientEmail,
        template: "appointment_cancelled",
        data: {
          appointmentId: conflict.appointmentId,
          slotStart: conflict.slotStart,
          reason,
          doctorName: conflict.doctorName
        },
        requestedAt: new Date().toISOString()
      })
    ]);
  }
};

export const assertDoctorOwnership = async (pool: Pool, staffUserId: string, doctorId: string): Promise<void> => {
  const result = await pool.query<{ doctorId: string }>(
    `
      SELECT doctor_id AS "doctorId"
      FROM auth.staff_users
      WHERE id = $1
        AND doctor_id = $2
      LIMIT 1
    `,
    [staffUserId, doctorId]
  );

  if (!result.rows[0]) {
    throw new ApiError(403, "Forbidden");
  }
};
