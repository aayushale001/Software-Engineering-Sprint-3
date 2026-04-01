/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS auth.patient_password_credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL UNIQUE REFERENCES patient.patients(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_patient_password_credentials_patient_id
      ON auth.patient_password_credentials (patient_id);
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS auth.patient_password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patient.patients(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_patient_password_reset_tokens_patient_created
      ON auth.patient_password_reset_tokens (patient_id, created_at DESC);
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS auth.patient_password_reset_tokens;
    DROP TABLE IF EXISTS auth.patient_password_credentials;
  `);
};
