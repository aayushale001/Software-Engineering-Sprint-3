import type { Pool } from "pg";

export type PatientProfile = {
  id: string;
  email: string;
  fullName: string | null;
  dateOfBirth: string | null;
  phoneNumber: string | null;
  profileComplete: boolean;
  status: "active" | "inactive";
  createdAt: Date;
};

type PatientProfileRow = Omit<PatientProfile, "profileComplete">;

export const isPatientProfileComplete = (profile: Pick<PatientProfile, "fullName" | "dateOfBirth" | "phoneNumber">): boolean => {
  return Boolean(profile.fullName?.trim() && profile.dateOfBirth && profile.phoneNumber?.trim());
};

const mapPatientProfile = (row: PatientProfileRow): PatientProfile => {
  return {
    ...row,
    profileComplete: isPatientProfileComplete(row)
  };
};

export const getPatientProfile = async (pool: Pool, patientId: string): Promise<PatientProfile | null> => {
  const result = await pool.query<PatientProfileRow>(
    `
      SELECT
        p.id,
        p.email,
        p.full_name AS "fullName",
        p.date_of_birth::text AS "dateOfBirth",
        pc.phone_number AS "phoneNumber",
        p.status,
        p.created_at AS "createdAt"
      FROM patient.patients p
      LEFT JOIN patient.patient_contacts pc ON pc.patient_id = p.id AND pc.is_primary = true
      WHERE p.id = $1
      LIMIT 1
    `,
    [patientId]
  );

  return result.rows[0] ? mapPatientProfile(result.rows[0]) : null;
};

export const updatePatientProfile = async (
  pool: Pool,
  patientId: string,
  payload: Partial<{ fullName: string; dateOfBirth: string; phoneNumber: string }>
): Promise<PatientProfile | null> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (payload.fullName !== undefined || payload.dateOfBirth !== undefined) {
      await client.query(
        `
          UPDATE patient.patients
          SET
            full_name = COALESCE($2, full_name),
            date_of_birth = COALESCE($3::date, date_of_birth)
          WHERE id = $1
        `,
        [patientId, payload.fullName ?? null, payload.dateOfBirth ?? null]
      );
    }

    if (payload.phoneNumber !== undefined) {
      const updated = await client.query(
        `
          UPDATE patient.patient_contacts
          SET phone_number = $2
          WHERE patient_id = $1
            AND is_primary = true
        `,
        [patientId, payload.phoneNumber]
      );

      if (updated.rowCount === 0) {
        await client.query(
          `
            INSERT INTO patient.patient_contacts (patient_id, phone_number, is_primary)
            VALUES ($1, $2, true)
          `,
          [patientId, payload.phoneNumber]
        );
      }
    }

    const profileResult = await client.query<PatientProfileRow>(
      `
        SELECT
          p.id,
          p.email,
          p.full_name AS "fullName",
          p.date_of_birth::text AS "dateOfBirth",
          pc.phone_number AS "phoneNumber",
          p.status,
          p.created_at AS "createdAt"
        FROM patient.patients p
        LEFT JOIN patient.patient_contacts pc ON pc.patient_id = p.id AND pc.is_primary = true
        WHERE p.id = $1
        LIMIT 1
      `,
      [patientId]
    );

    await client.query("COMMIT");
    return profileResult.rows[0] ? mapPatientProfile(profileResult.rows[0]) : null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listPatients = async (pool: Pool): Promise<PatientProfile[]> => {
  const result = await pool.query<PatientProfileRow>(
    `
      SELECT
        p.id,
        p.email,
        p.full_name AS "fullName",
        p.date_of_birth::text AS "dateOfBirth",
        pc.phone_number AS "phoneNumber",
        p.status,
        p.created_at AS "createdAt"
      FROM patient.patients p
      LEFT JOIN patient.patient_contacts pc ON pc.patient_id = p.id AND pc.is_primary = true
      ORDER BY p.created_at DESC
    `
  );

  return result.rows.map(mapPatientProfile);
};

export const updatePatientStatus = async (
  pool: Pool,
  patientId: string,
  status: "active" | "inactive"
): Promise<PatientProfile | null> => {
  await pool.query(
    `
      UPDATE patient.patients
      SET
        status = $2,
        deactivated_at = CASE
          WHEN $2 = 'inactive' THEN COALESCE(deactivated_at, NOW())
          ELSE NULL
        END
      WHERE id = $1
    `,
    [patientId, status]
  );

  return getPatientProfile(pool, patientId);
};

export const doctorHasPatientAccess = async (pool: Pool, doctorId: string, patientId: string): Promise<boolean> => {
  const result = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM appointment.appointments
      WHERE doctor_id = $1
        AND patient_id = $2
      LIMIT 1
    `,
    [doctorId, patientId]
  );

  return Boolean(result.rows[0]);
};
