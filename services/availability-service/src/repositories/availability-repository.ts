import type { Pool } from "pg";

export type AvailabilitySlot = {
  doctorId: string;
  slotStart: string;
  slotEnd: string;
  status: "available" | "held" | "booked";
  heldByPatientId: string | null;
  holdExpiresAt: string | null;
};

export const getDoctorAvailability = async (
  pool: Pool,
  doctorId: string,
  start: string,
  end: string
): Promise<AvailabilitySlot[]> => {
  const result = await pool.query<AvailabilitySlot>(
    `
      SELECT
        ds.doctor_id AS "doctorId",
        ds.slot_start::text AS "slotStart",
        ds.slot_end::text AS "slotEnd",
        ds.status,
        ds.held_by_patient_id AS "heldByPatientId",
        ds.hold_expires_at::text AS "holdExpiresAt"
      FROM doctor.doctor_slots ds
      INNER JOIN doctor.doctors d ON d.id = ds.doctor_id
      WHERE ds.doctor_id = $1
        AND d.status = 'active'
        AND ds.slot_start >= $2::timestamptz
        AND ds.slot_end <= $3::timestamptz
      ORDER BY ds.slot_start ASC
    `,
    [doctorId, start, end]
  );

  return result.rows;
};
