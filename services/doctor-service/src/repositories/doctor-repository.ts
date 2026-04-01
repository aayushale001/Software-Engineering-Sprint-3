import type { Pool, PoolClient } from "pg";

export type Doctor = {
  id: string;
  fullName: string;
  specialty: string;
  timezone: string;
  bio: string | null;
  phoneNumber: string | null;
  status: "active" | "inactive";
};

export type AdminDoctor = Doctor & {
  staffEmail: string | null;
  staffStatus: "invited" | "active" | "inactive" | null;
  staffUserId: string | null;
};

export const listDoctors = async (pool: Pool): Promise<Doctor[]> => {
  const result = await pool.query<Doctor>(
    `
      SELECT
        id,
        full_name AS "fullName",
        specialty,
        timezone,
        bio,
        phone_number AS "phoneNumber",
        status
      FROM doctor.doctors
      WHERE status = 'active'
      ORDER BY full_name ASC
    `
  );

  return result.rows;
};

export const listDoctorsForAdmin = async (pool: Pool): Promise<AdminDoctor[]> => {
  const result = await pool.query<AdminDoctor>(
    `
      SELECT
        d.id,
        d.full_name AS "fullName",
        d.specialty,
        d.timezone,
        d.bio,
        d.phone_number AS "phoneNumber",
        d.status,
        su.email AS "staffEmail",
        su.status AS "staffStatus",
        su.id AS "staffUserId"
      FROM doctor.doctors d
      LEFT JOIN auth.staff_users su ON su.doctor_id = d.id
      ORDER BY d.full_name ASC
    `
  );

  return result.rows;
};

export const getDoctorById = async (pool: Pool, doctorId: string): Promise<Doctor | null> => {
  const result = await pool.query<Doctor>(
    `
      SELECT
        id,
        full_name AS "fullName",
        specialty,
        timezone,
        bio,
        phone_number AS "phoneNumber",
        status
      FROM doctor.doctors
      WHERE id = $1
        AND status = 'active'
      LIMIT 1
    `,
    [doctorId]
  );

  return result.rows[0] ?? null;
};

export const getDoctorForAdmin = async (pool: Pool, doctorId: string): Promise<AdminDoctor | null> => {
  const result = await pool.query<AdminDoctor>(
    `
      SELECT
        d.id,
        d.full_name AS "fullName",
        d.specialty,
        d.timezone,
        d.bio,
        d.phone_number AS "phoneNumber",
        d.status,
        su.email AS "staffEmail",
        su.status AS "staffStatus",
        su.id AS "staffUserId"
      FROM doctor.doctors d
      LEFT JOIN auth.staff_users su ON su.doctor_id = d.id
      WHERE d.id = $1
      LIMIT 1
    `,
    [doctorId]
  );

  return result.rows[0] ?? null;
};

export const getDoctorByStaffUserId = async (pool: Pool, staffUserId: string): Promise<Doctor | null> => {
  const result = await pool.query<Doctor>(
    `
      SELECT
        d.id,
        d.full_name AS "fullName",
        d.specialty,
        d.timezone,
        d.bio,
        d.phone_number AS "phoneNumber",
        d.status
      FROM doctor.doctors d
      INNER JOIN auth.staff_users su ON su.doctor_id = d.id
      WHERE su.id = $1
      LIMIT 1
    `,
    [staffUserId]
  );

  return result.rows[0] ?? null;
};

export const updateDoctorProfile = async (
  client: Pool | PoolClient,
  doctorId: string,
  payload: Partial<{
    fullName: string;
    specialty: string;
    timezone: string;
    bio: string | null;
    phoneNumber: string | null;
    status: "active" | "inactive";
  }>
): Promise<Doctor | null> => {
  const result = await client.query<Doctor>(
    `
      UPDATE doctor.doctors
      SET
        full_name = COALESCE($2, full_name),
        specialty = COALESCE($3, specialty),
        timezone = COALESCE($4, timezone),
        bio = COALESCE($5, bio),
        phone_number = COALESCE($6, phone_number),
        status = COALESCE($7, status),
        deactivated_at = CASE
          WHEN COALESCE($7, status) = 'inactive' THEN COALESCE(deactivated_at, NOW())
          WHEN COALESCE($7, status) = 'active' THEN NULL
          ELSE deactivated_at
        END
      WHERE id = $1
      RETURNING
        id,
        full_name AS "fullName",
        specialty,
        timezone,
        bio,
        phone_number AS "phoneNumber",
        status
    `,
    [
      doctorId,
      payload.fullName ?? null,
      payload.specialty ?? null,
      payload.timezone ?? null,
      payload.bio ?? null,
      payload.phoneNumber ?? null,
      payload.status ?? null
    ]
  );

  return result.rows[0] ?? null;
};

export const syncDoctorStaffStatus = async (
  client: Pool | PoolClient,
  doctorId: string,
  status: "active" | "inactive"
): Promise<void> => {
  const nextStatus = status === "active" ? "active" : "inactive";
  await client.query(
    `
      UPDATE auth.staff_users
      SET status = $2
      WHERE doctor_id = $1
    `,
    [doctorId, nextStatus]
  );
};
