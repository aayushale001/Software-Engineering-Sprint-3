import crypto from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { ApiError, hashPassword } from "@hospital/common";

export type PatientRefreshTokenRecord = {
  id: string;
  patientId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type StaffRefreshTokenRecord = {
  id: string;
  staffUserId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type PatientAuthRecord = {
  id: string;
  email: string;
  status: "active" | "inactive";
  createdAt: Date;
};

export type PatientPasswordLoginRecord = PatientAuthRecord & {
  passwordHash: string | null;
};

export type PatientPasswordResetTokenRecord = {
  id: string;
  patientId: string;
  email: string;
  status: "active" | "inactive";
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

export type StaffUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  role: "doctor" | "admin";
  doctorId: string | null;
  status: "invited" | "active" | "inactive";
  createdAt: Date;
};

export type StaffInviteRecord = {
  inviteId: string;
  staffUserId: string;
  email: string;
  role: "doctor" | "admin";
  doctorId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  status: "invited" | "active" | "inactive";
};

const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const createRawToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

const getPatientById = async (client: Pool | PoolClient, patientId: string): Promise<PatientAuthRecord | null> => {
  const result = await client.query<PatientAuthRecord>(
    `
      SELECT
        id,
        email,
        status,
        created_at AS "createdAt"
      FROM patient.patients
      WHERE id = $1
      LIMIT 1
    `,
    [patientId]
  );

  return result.rows[0] ?? null;
};

const createPatient = async (
  client: Pool | PoolClient,
  email: string,
  profile: {
    fullName?: string;
  } = {}
): Promise<PatientAuthRecord> => {
  const created = await client.query<PatientAuthRecord>(
    `
      INSERT INTO patient.patients (email, full_name, status)
      VALUES ($1, $2, 'active')
      RETURNING
        id,
        email,
        status,
        created_at AS "createdAt"
    `,
    [email, profile.fullName ?? null]
  );

  return created.rows[0];
};

const isUniqueViolation = (error: unknown): boolean => {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
};

export const storeOtpRequest = async (pool: Pool, email: string): Promise<void> => {
  await pool.query(
    `
      INSERT INTO auth.otp_requests (email, requested_at)
      VALUES ($1, NOW())
    `,
    [email]
  );
};

export const findPatientByEmail = async (pool: Pool, email: string): Promise<PatientAuthRecord | null> => {
  const result = await pool.query<PatientAuthRecord>(
    `
      SELECT
        id,
        email,
        status,
        created_at AS "createdAt"
      FROM patient.patients
      WHERE email = $1
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] ?? null;
};

export const findPatientWithPasswordByEmail = async (pool: Pool, email: string): Promise<PatientPasswordLoginRecord | null> => {
  const result = await pool.query<PatientPasswordLoginRecord>(
    `
      SELECT
        p.id,
        p.email,
        p.status,
        p.created_at AS "createdAt",
        ppc.password_hash AS "passwordHash"
      FROM patient.patients p
      LEFT JOIN auth.patient_password_credentials ppc ON ppc.patient_id = p.id
      WHERE p.email = $1
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] ?? null;
};

export const findOrCreatePatientByEmail = async (
  pool: Pool,
  email: string,
  profile: {
    fullName?: string;
  } = {}
): Promise<{ id: string; email: string; status: "active" | "inactive" }> => {
  const existing = await findPatientByEmail(pool, email);

  if (existing) {
    if (existing.status !== "active") {
      throw new ApiError(403, "Patient account is inactive");
    }

    if (profile.fullName) {
      await pool.query(
        `
          UPDATE patient.patients
          SET full_name = COALESCE(full_name, $2)
          WHERE email = $1
        `,
        [email, profile.fullName]
      );
    }

    return existing;
  }

  return createPatient(pool, email, profile);
};

export const createPatientWithPassword = async (
  pool: Pool,
  email: string,
  password: string
): Promise<PatientAuthRecord> => {
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let patient: PatientAuthRecord;
    try {
      patient = await createPatient(client, email);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "An account already exists for this email. Log in or reset your password.");
      }
      throw error;
    }

    await client.query(
      `
        INSERT INTO auth.patient_password_credentials (patient_id, password_hash)
        VALUES ($1, $2)
      `,
      [patient.id, passwordHash]
    );

    await client.query("COMMIT");
    return patient;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const upsertPatientPasswordCredential = async (
  client: Pool | PoolClient,
  patientId: string,
  passwordHash: string
): Promise<void> => {
  await client.query(
    `
      INSERT INTO auth.patient_password_credentials (patient_id, password_hash)
      VALUES ($1, $2)
      ON CONFLICT (patient_id) DO UPDATE
      SET
        password_hash = EXCLUDED.password_hash,
        updated_at = NOW()
    `,
    [patientId, passwordHash]
  );
};

export const createPatientPasswordResetToken = async (
  pool: Pool,
  patientId: string,
  ttlSeconds: number
): Promise<{ resetToken: string; expiresAt: Date }> => {
  const resetToken = createRawToken();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        UPDATE auth.patient_password_reset_tokens
        SET consumed_at = NOW()
        WHERE patient_id = $1
          AND consumed_at IS NULL
      `,
      [patientId]
    );

    await client.query(
      `
        INSERT INTO auth.patient_password_reset_tokens (patient_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `,
      [patientId, hashToken(resetToken), expiresAt]
    );

    await client.query("COMMIT");
    return {
      resetToken,
      expiresAt
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getPatientPasswordResetToken = async (
  pool: Pool,
  resetToken: string
): Promise<PatientPasswordResetTokenRecord | null> => {
  const result = await pool.query<PatientPasswordResetTokenRecord>(
    `
      SELECT
        prt.id,
        prt.patient_id AS "patientId",
        p.email,
        p.status,
        prt.expires_at AS "expiresAt",
        prt.consumed_at AS "consumedAt",
        prt.created_at AS "createdAt"
      FROM auth.patient_password_reset_tokens prt
      INNER JOIN patient.patients p ON p.id = prt.patient_id
      WHERE prt.token_hash = $1
      ORDER BY prt.created_at DESC
      LIMIT 1
    `,
    [hashToken(resetToken)]
  );

  return result.rows[0] ?? null;
};

export const resetPatientPasswordWithToken = async (
  pool: Pool,
  resetToken: string,
  password: string
): Promise<PatientAuthRecord> => {
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query<PatientPasswordResetTokenRecord>(
      `
        SELECT
          prt.id,
          prt.patient_id AS "patientId",
          p.email,
          p.status,
          prt.expires_at AS "expiresAt",
          prt.consumed_at AS "consumedAt",
          prt.created_at AS "createdAt"
        FROM auth.patient_password_reset_tokens prt
        INNER JOIN patient.patients p ON p.id = prt.patient_id
        WHERE prt.token_hash = $1
        ORDER BY prt.created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [hashToken(resetToken)]
    );

    const tokenRecord = tokenResult.rows[0];
    if (!tokenRecord) {
      throw new ApiError(404, "Reset link is invalid");
    }

    if (tokenRecord.status !== "active") {
      throw new ApiError(403, "Patient account is inactive");
    }

    if (tokenRecord.consumedAt) {
      throw new ApiError(409, "Reset link has already been used");
    }

    if (tokenRecord.expiresAt.getTime() < Date.now()) {
      throw new ApiError(410, "Reset link has expired");
    }

    await upsertPatientPasswordCredential(client, tokenRecord.patientId, passwordHash);
    await client.query(
      `
        UPDATE auth.patient_password_reset_tokens
        SET consumed_at = NOW()
        WHERE patient_id = $1
          AND consumed_at IS NULL
      `,
      [tokenRecord.patientId]
    );

    const patient = await getPatientById(client, tokenRecord.patientId);
    if (!patient) {
      throw new ApiError(404, "Patient account not found");
    }

    await client.query("COMMIT");
    return patient;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const storeRefreshToken = async (
  pool: Pool,
  patientId: string,
  refreshToken: string,
  expiresAt: Date
): Promise<void> => {
  await pool.query(
    `
      INSERT INTO auth.refresh_tokens (patient_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [patientId, hashToken(refreshToken), expiresAt]
  );
};

export const revokeRefreshToken = async (pool: Pool, refreshToken: string): Promise<void> => {
  await pool.query(
    `
      UPDATE auth.refresh_tokens
      SET revoked_at = NOW()
      WHERE token_hash = $1
    `,
    [hashToken(refreshToken)]
  );
};

export const getRefreshTokenRecord = async (pool: Pool, refreshToken: string): Promise<PatientRefreshTokenRecord | null> => {
  const result = await pool.query<PatientRefreshTokenRecord>(
    `
      SELECT id, patient_id AS "patientId", expires_at AS "expiresAt", revoked_at AS "revokedAt"
      FROM auth.refresh_tokens
      WHERE token_hash = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [hashToken(refreshToken)]
  );

  return result.rows[0] ?? null;
};

export const listStaffUsers = async (
  pool: Pool,
  role?: "doctor" | "admin"
): Promise<Array<Omit<StaffUser, "passwordHash">>> => {
  const params: unknown[] = [];
  let sql = `
    SELECT
      id,
      email,
      role,
      doctor_id AS "doctorId",
      status,
      created_at AS "createdAt"
    FROM auth.staff_users
  `;

  if (role) {
    params.push(role);
    sql += ` WHERE role = $1`;
  }

  sql += " ORDER BY created_at DESC";

  const result = await pool.query<Array<Omit<StaffUser, "passwordHash">>[number]>(sql, params);
  return result.rows;
};

export const findStaffUserByEmail = async (pool: Pool, email: string): Promise<StaffUser | null> => {
  const result = await pool.query<StaffUser>(
    `
      SELECT
        id,
        email,
        password_hash AS "passwordHash",
        role,
        doctor_id AS "doctorId",
        status,
        created_at AS "createdAt"
      FROM auth.staff_users
      WHERE email = $1
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] ?? null;
};

export const findStaffUserById = async (pool: Pool, staffUserId: string): Promise<StaffUser | null> => {
  const result = await pool.query<StaffUser>(
    `
      SELECT
        id,
        email,
        password_hash AS "passwordHash",
        role,
        doctor_id AS "doctorId",
        status,
        created_at AS "createdAt"
      FROM auth.staff_users
      WHERE id = $1
      LIMIT 1
    `,
    [staffUserId]
  );

  return result.rows[0] ?? null;
};

export const storeStaffRefreshToken = async (
  pool: Pool,
  staffUserId: string,
  refreshToken: string,
  expiresAt: Date
): Promise<void> => {
  await pool.query(
    `
      INSERT INTO auth.staff_refresh_tokens (staff_user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [staffUserId, hashToken(refreshToken), expiresAt]
  );
};

export const getStaffRefreshTokenRecord = async (
  pool: Pool,
  refreshToken: string
): Promise<StaffRefreshTokenRecord | null> => {
  const result = await pool.query<StaffRefreshTokenRecord>(
    `
      SELECT
        id,
        staff_user_id AS "staffUserId",
        expires_at AS "expiresAt",
        revoked_at AS "revokedAt"
      FROM auth.staff_refresh_tokens
      WHERE token_hash = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [hashToken(refreshToken)]
  );

  return result.rows[0] ?? null;
};

export const revokeStaffRefreshToken = async (pool: Pool, refreshToken: string): Promise<void> => {
  await pool.query(
    `
      UPDATE auth.staff_refresh_tokens
      SET revoked_at = NOW()
      WHERE token_hash = $1
    `,
    [hashToken(refreshToken)]
  );
};

export const recordStaffLogin = async (pool: Pool, staffUserId: string): Promise<void> => {
  await pool.query(
    `
      UPDATE auth.staff_users
      SET last_login_at = NOW()
      WHERE id = $1
    `,
    [staffUserId]
  );
};

export const createStaffInvite = async (
  pool: Pool,
  input: {
    email: string;
    role: "doctor" | "admin";
    doctorId?: string | null;
    ttlSeconds: number;
  }
): Promise<{
  staffUserId: string;
  inviteToken: string;
  email: string;
  role: "doctor" | "admin";
  doctorId: string | null;
  expiresAt: Date;
}> => {
  const existing = await findStaffUserByEmail(pool, input.email);
  if (existing && existing.status !== "inactive") {
    throw new ApiError(409, "A staff account with this email already exists");
  }

  const inviteToken = createRawToken();
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let staffUserId = existing?.id ?? null;

    if (existing) {
      await client.query(
        `
          UPDATE auth.staff_users
          SET
            role = $2,
            doctor_id = $3,
            status = 'invited',
            password_hash = NULL
          WHERE id = $1
        `,
        [existing.id, input.role, input.doctorId ?? null]
      );
    } else {
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO auth.staff_users (email, role, doctor_id, status)
          VALUES ($1, $2, $3, 'invited')
          RETURNING id
        `,
        [input.email, input.role, input.doctorId ?? null]
      );
      staffUserId = inserted.rows[0].id;
    }

    await client.query(
      `
        INSERT INTO auth.staff_invites (staff_user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `,
      [staffUserId, hashToken(inviteToken), expiresAt]
    );

    await client.query("COMMIT");

    return {
      staffUserId: staffUserId ?? "",
      inviteToken,
      email: input.email,
      role: input.role,
      doctorId: input.doctorId ?? null,
      expiresAt
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getStaffInviteByToken = async (pool: Pool, inviteToken: string): Promise<StaffInviteRecord | null> => {
  const result = await pool.query<StaffInviteRecord>(
    `
      SELECT
        si.id AS "inviteId",
        su.id AS "staffUserId",
        su.email,
        su.role,
        su.doctor_id AS "doctorId",
        si.expires_at AS "expiresAt",
        si.accepted_at AS "acceptedAt",
        su.status
      FROM auth.staff_invites si
      INNER JOIN auth.staff_users su ON su.id = si.staff_user_id
      WHERE si.token_hash = $1
      ORDER BY si.created_at DESC
      LIMIT 1
    `,
    [hashToken(inviteToken)]
  );

  return result.rows[0] ?? null;
};

export const acceptStaffInvite = async (
  pool: Pool,
  inviteToken: string,
  password: string
): Promise<StaffUser> => {
  const invite = await getStaffInviteByToken(pool, inviteToken);
  if (!invite) {
    throw new ApiError(404, "Invite not found");
  }

  if (invite.acceptedAt) {
    throw new ApiError(409, "Invite has already been accepted");
  }

  if (invite.status === "inactive") {
    throw new ApiError(403, "Staff account is inactive");
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    throw new ApiError(410, "Invite has expired");
  }

  const passwordHash = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        UPDATE auth.staff_users
        SET password_hash = $2, status = 'active'
        WHERE id = $1
      `,
      [invite.staffUserId, passwordHash]
    );

    await client.query(
      `
        UPDATE auth.staff_invites
        SET accepted_at = NOW()
        WHERE id = $1
      `,
      [invite.inviteId]
    );

    const result = await client.query<StaffUser>(
      `
        SELECT
          id,
          email,
          password_hash AS "passwordHash",
          role,
          doctor_id AS "doctorId",
          status,
          created_at AS "createdAt"
        FROM auth.staff_users
        WHERE id = $1
        LIMIT 1
      `,
      [invite.staffUserId]
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const ensureBootstrapAdmin = async (pool: Pool, email: string, password: string): Promise<void> => {
  const anyAdmin = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM auth.staff_users
      WHERE role = 'admin'
        AND status = 'active'
      LIMIT 1
    `
  );

  if (anyAdmin.rows[0]) {
    return;
  }

  const passwordHash = await hashPassword(password);
  await pool.query(
    `
      INSERT INTO auth.staff_users (email, password_hash, role, status)
      VALUES ($1, $2, 'admin', 'active')
      ON CONFLICT (email) DO UPDATE
      SET
        password_hash = EXCLUDED.password_hash,
        role = 'admin',
        status = 'active'
    `,
    [email, passwordHash]
  );
};
