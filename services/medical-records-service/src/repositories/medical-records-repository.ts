import type { Pool } from "pg";

export type MedicalRecordEntry = {
  id: string;
  key: string;
  value: string;
};

export type MedicalRecordSummary = {
  id: string;
  patientId: string;
  recordType: string;
  title: string;
  recordDate: string;
  createdAt: Date;
};

export type MedicalRecordDetail = MedicalRecordSummary & {
  entries: MedicalRecordEntry[];
};

type MedicalRecordEntryRow = MedicalRecordEntry & {
  medicalRecordId: string;
};

type Queryable = Pick<Pool, "query">;

const getEntriesForRecordIds = async (db: Queryable, recordIds: string[]): Promise<Map<string, MedicalRecordEntry[]>> => {
  if (recordIds.length === 0) {
    return new Map();
  }

  const entriesResult = await db.query<MedicalRecordEntryRow>(
    `
      SELECT
        id,
        medical_record_id AS "medicalRecordId",
        entry_key AS key,
        entry_value AS value
      FROM records.record_entries
      WHERE medical_record_id = ANY($1::uuid[])
      ORDER BY medical_record_id ASC, created_at ASC
    `,
    [recordIds]
  );

  const entriesByRecordId = new Map<string, MedicalRecordEntry[]>();

  for (const entry of entriesResult.rows) {
    const currentEntries = entriesByRecordId.get(entry.medicalRecordId);
    const mappedEntry = {
      id: entry.id,
      key: entry.key,
      value: entry.value
    };

    if (currentEntries) {
      currentEntries.push(mappedEntry);
      continue;
    }

    entriesByRecordId.set(entry.medicalRecordId, [mappedEntry]);
  }

  return entriesByRecordId;
};

export const getMedicalRecords = async (
  pool: Pool,
  patientId: string,
  filters: {
    from?: string;
    to?: string;
    type?: string;
    limit: number;
    offset: number;
  }
): Promise<MedicalRecordDetail[]> => {
  const params: unknown[] = [patientId];
  const clauses: string[] = ["mr.patient_id = $1"];

  if (filters.from) {
    params.push(filters.from);
    clauses.push(`mr.record_date >= $${params.length}::date`);
  }

  if (filters.to) {
    params.push(filters.to);
    clauses.push(`mr.record_date <= $${params.length}::date`);
  }

  if (filters.type) {
    params.push(filters.type);
    clauses.push(`mr.record_type = $${params.length}`);
  }

  params.push(filters.limit);
  const limitPosition = params.length;
  params.push(filters.offset);
  const offsetPosition = params.length;

  const result = await pool.query<MedicalRecordSummary>(
    `
      SELECT
        mr.id,
        mr.patient_id AS "patientId",
        mr.record_type AS "recordType",
        mr.title,
        mr.record_date::text AS "recordDate",
        mr.created_at AS "createdAt"
      FROM records.medical_records mr
      WHERE ${clauses.join(" AND ")}
      ORDER BY mr.record_date DESC
      LIMIT $${limitPosition}
      OFFSET $${offsetPosition}
    `,
    params
  );

  const entriesByRecordId = await getEntriesForRecordIds(
    pool,
    result.rows.map((record) => record.id)
  );

  return result.rows.map((record) => ({
    ...record,
    entries: entriesByRecordId.get(record.id) ?? []
  }));
};

export const getMedicalRecordById = async (
  pool: Pool,
  patientId: string,
  recordId: string
): Promise<MedicalRecordDetail | null> => {
  const headerResult = await pool.query<MedicalRecordSummary>(
    `
      SELECT
        mr.id,
        mr.patient_id AS "patientId",
        mr.record_type AS "recordType",
        mr.title,
        mr.record_date::text AS "recordDate",
        mr.created_at AS "createdAt"
      FROM records.medical_records mr
      WHERE mr.id = $1
        AND mr.patient_id = $2
      LIMIT 1
    `,
    [recordId, patientId]
  );

  const record = headerResult.rows[0];
  if (!record) {
    return null;
  }

  return {
    ...record,
    entries: (await getEntriesForRecordIds(pool, [recordId])).get(recordId) ?? []
  };
};

export const createMedicalRecord = async (
  pool: Pool,
  input: {
    patientId: string;
    recordType: string;
    title: string;
    recordDate: string;
    entries: Array<{ key: string; value: string }>;
  }
): Promise<MedicalRecordDetail> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertedRecord = await client.query<MedicalRecordSummary>(
      `
        INSERT INTO records.medical_records (patient_id, record_type, title, record_date)
        VALUES ($1, $2, $3, $4::date)
        RETURNING
          id,
          patient_id AS "patientId",
          record_type AS "recordType",
          title,
          record_date::text AS "recordDate",
          created_at AS "createdAt"
      `,
      [input.patientId, input.recordType, input.title, input.recordDate]
    );

    const record = insertedRecord.rows[0];

    const entries: MedicalRecordEntry[] = [];
    for (const entry of input.entries) {
      const insertedEntry = await client.query<MedicalRecordEntry>(
        `
          INSERT INTO records.record_entries (medical_record_id, entry_key, entry_value)
          VALUES ($1, $2, $3)
          RETURNING id, entry_key AS key, entry_value AS value
        `,
        [record.id, entry.key, entry.value]
      );
      entries.push(insertedEntry.rows[0]);
    }

    await client.query("COMMIT");

    return {
      ...record,
      entries
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateMedicalRecord = async (
  pool: Pool,
  input: {
    patientId: string;
    recordId: string;
    recordType?: string;
    title?: string;
    recordDate?: string;
    entries?: Array<{ key: string; value: string }>;
  }
): Promise<MedicalRecordDetail | null> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const exists = await client.query<{ id: string }>(
      `
        SELECT id
        FROM records.medical_records
        WHERE id = $1
          AND patient_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [input.recordId, input.patientId]
    );

    if (!exists.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    if (input.recordType !== undefined || input.title !== undefined || input.recordDate !== undefined) {
      await client.query(
        `
          UPDATE records.medical_records
          SET
            record_type = COALESCE($3, record_type),
            title = COALESCE($4, title),
            record_date = COALESCE($5::date, record_date)
          WHERE id = $1
            AND patient_id = $2
        `,
        [input.recordId, input.patientId, input.recordType ?? null, input.title ?? null, input.recordDate ?? null]
      );
    }

    if (input.entries !== undefined) {
      await client.query(
        `
          DELETE FROM records.record_entries
          WHERE medical_record_id = $1
        `,
        [input.recordId]
      );

      for (const entry of input.entries) {
        await client.query(
          `
            INSERT INTO records.record_entries (medical_record_id, entry_key, entry_value)
            VALUES ($1, $2, $3)
          `,
          [input.recordId, entry.key, entry.value]
        );
      }
    }

    const headerResult = await client.query<MedicalRecordSummary>(
      `
        SELECT
          mr.id,
          mr.patient_id AS "patientId",
          mr.record_type AS "recordType",
          mr.title,
          mr.record_date::text AS "recordDate",
          mr.created_at AS "createdAt"
        FROM records.medical_records mr
        WHERE mr.id = $1
          AND mr.patient_id = $2
        LIMIT 1
      `,
      [input.recordId, input.patientId]
    );

    await client.query("COMMIT");

    const record = headerResult.rows[0];
    if (!record) {
      return null;
    }

    return {
      ...record,
      entries: (await getEntriesForRecordIds(pool, [input.recordId])).get(input.recordId) ?? []
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
