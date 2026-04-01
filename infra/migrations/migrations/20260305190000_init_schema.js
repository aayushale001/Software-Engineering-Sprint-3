/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  await knex.raw(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS patient;
    CREATE SCHEMA IF NOT EXISTS doctor;
    CREATE SCHEMA IF NOT EXISTS appointment;
    CREATE SCHEMA IF NOT EXISTS records;
    CREATE SCHEMA IF NOT EXISTS notification;
    CREATE SCHEMA IF NOT EXISTS audit;
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS patient.patients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT,
      date_of_birth DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS patient.patient_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patient.patients(id) ON DELETE CASCADE,
      phone_number TEXT,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS patient.consents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patient.patients(id) ON DELETE CASCADE,
      consent_type TEXT NOT NULL,
      granted BOOLEAN NOT NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS auth.otp_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patient.patients(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_patient_id ON auth.refresh_tokens (patient_id);
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS doctor.doctors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doctor.doctor_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id UUID NOT NULL REFERENCES doctor.doctors(id) ON DELETE CASCADE,
      day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doctor.doctor_slots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id UUID NOT NULL REFERENCES doctor.doctors(id) ON DELETE CASCADE,
      slot_start TIMESTAMPTZ NOT NULL,
      slot_end TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('available', 'held', 'booked')) DEFAULT 'available',
      held_by_patient_id UUID REFERENCES patient.patients(id),
      hold_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (doctor_id, slot_start)
    );

    CREATE INDEX IF NOT EXISTS idx_doctor_slots_lookup ON doctor.doctor_slots (doctor_id, slot_start, status);
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS appointment.appointment_holds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patient.patients(id) ON DELETE CASCADE,
      doctor_id UUID NOT NULL REFERENCES doctor.doctors(id) ON DELETE CASCADE,
      slot_start TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'confirmed', 'cancelled')) DEFAULT 'active',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointment.appointments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patient.patients(id) ON DELETE CASCADE,
      doctor_id UUID NOT NULL REFERENCES doctor.doctors(id) ON DELETE CASCADE,
      slot_start TIMESTAMPTZ NOT NULL,
      slot_end TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled', 'completed')) DEFAULT 'confirmed',
      reason TEXT,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointment.idempotency_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patient.patients(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      response_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (patient_id, endpoint, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS appointment.outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      topic TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'failed')) DEFAULT 'pending',
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_appointment_outbox_pending ON appointment.outbox_events (status, created_at);
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS records.medical_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patient.patients(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL,
      title TEXT NOT NULL,
      record_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS records.record_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      medical_record_id UUID NOT NULL REFERENCES records.medical_records(id) ON DELETE CASCADE,
      entry_key TEXT NOT NULL,
      entry_value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS records.record_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      medical_record_id UUID NOT NULL REFERENCES records.medical_records(id) ON DELETE CASCADE,
      s3_key TEXT NOT NULL,
      content_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_records_lookup ON records.medical_records (patient_id, record_date DESC);
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS notification.delivery_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      destination TEXT NOT NULL,
      template TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_notification_created_at ON notification.delivery_logs (created_at DESC);
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS audit.audit_logs (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_actor_occurred ON audit.audit_logs (actor_id, occurred_at DESC);
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw(`
    DROP SCHEMA IF EXISTS audit CASCADE;
    DROP SCHEMA IF EXISTS notification CASCADE;
    DROP SCHEMA IF EXISTS records CASCADE;
    DROP SCHEMA IF EXISTS appointment CASCADE;
    DROP SCHEMA IF EXISTS doctor CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    DROP SCHEMA IF EXISTS patient CASCADE;
  `);
};
