/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE patient.patients
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'patients_status_check'
      ) THEN
        ALTER TABLE patient.patients
          ADD CONSTRAINT patients_status_check CHECK (status IN ('active', 'inactive'));
      END IF;
    END $$;
  `);

  await knex.raw(`
    ALTER TABLE doctor.doctors
      ADD COLUMN IF NOT EXISTS bio TEXT,
      ADD COLUMN IF NOT EXISTS phone_number TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'doctors_status_check'
      ) THEN
        ALTER TABLE doctor.doctors
          ADD CONSTRAINT doctors_status_check CHECK (status IN ('active', 'inactive'));
      END IF;
    END $$;
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS auth.staff_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('doctor', 'admin')),
      doctor_id UUID UNIQUE REFERENCES doctor.doctors(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'inactive')) DEFAULT 'invited',
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_staff_users_role_status ON auth.staff_users (role, status);
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS auth.staff_invites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_user_id UUID NOT NULL REFERENCES auth.staff_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_staff_invites_staff_user_id ON auth.staff_invites (staff_user_id, created_at DESC);
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS auth.staff_refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_user_id UUID NOT NULL REFERENCES auth.staff_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_staff_refresh_tokens_staff_user_id ON auth.staff_refresh_tokens (staff_user_id);
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS doctor.schedule_exceptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id UUID NOT NULL REFERENCES doctor.doctors(id) ON DELETE CASCADE,
      exception_date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      reason TEXT NOT NULL,
      created_by_role TEXT NOT NULL CHECK (created_by_role IN ('doctor', 'admin')),
      created_by_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (
        (start_time IS NULL AND end_time IS NULL)
        OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_lookup
      ON doctor.schedule_exceptions (doctor_id, exception_date);
  `);

  await knex.raw(`
    ALTER TABLE appointment.appointments
      ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_appointments_doctor_slot_start
      ON appointment.appointments (doctor_id, slot_start DESC);
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS appointment.idx_appointments_doctor_slot_start;
    DROP TABLE IF EXISTS doctor.schedule_exceptions;
    DROP TABLE IF EXISTS auth.staff_refresh_tokens;
    DROP TABLE IF EXISTS auth.staff_invites;
    DROP TABLE IF EXISTS auth.staff_users;
  `);

  await knex.raw(`
    ALTER TABLE doctor.doctors
      DROP COLUMN IF EXISTS deactivated_at,
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS phone_number,
      DROP COLUMN IF EXISTS bio;
  `);

  await knex.raw(`
    ALTER TABLE patient.patients
      DROP COLUMN IF EXISTS deactivated_at,
      DROP COLUMN IF EXISTS status;
  `);

  await knex.raw(`
    ALTER TABLE appointment.appointments
      DROP COLUMN IF EXISTS cancellation_reason;
  `);
};
