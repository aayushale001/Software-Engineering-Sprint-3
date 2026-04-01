/** @param {import('knex').Knex} knex */
exports.seed = async function seed(knex) {
  await knex.raw(`
    TRUNCATE TABLE
      appointment.outbox_events,
      appointment.idempotency_keys,
      appointment.appointments,
      appointment.appointment_holds,
      doctor.schedule_exceptions,
      doctor.doctor_slots,
      doctor.doctor_schedules,
      doctor.doctors,
      auth.staff_refresh_tokens,
      auth.staff_invites,
      auth.staff_users,
      records.record_entries,
      records.record_attachments,
      records.medical_records,
      patient.patient_contacts,
      patient.consents,
      auth.refresh_tokens,
      auth.otp_requests,
      patient.patients
    RESTART IDENTITY CASCADE;
  `);

  await knex.raw(`
    INSERT INTO patient.patients (id, email, full_name, date_of_birth)
    VALUES
      ('f1f6cb89-8143-45da-9b8a-f2fa3a8042e4', 'patient@example.com', 'Alex Carter', '1990-02-15');

    INSERT INTO patient.patient_contacts (patient_id, phone_number, is_primary)
    VALUES
      ('f1f6cb89-8143-45da-9b8a-f2fa3a8042e4', '+447700900111', true);

    INSERT INTO doctor.doctors (id, full_name, specialty, timezone)
    VALUES
      ('dd12b0bc-fb95-4266-a10f-53df120f65cc', 'Dr. Sarah Mitchell', 'Cardiology', 'Europe/London'),
      ('df7f2023-b629-404e-94b4-efdf5ed0a429', 'Dr. Omar Reed', 'Dermatology', 'Europe/London');

    INSERT INTO doctor.doctor_schedules (doctor_id, day_of_week, start_time, end_time)
    VALUES
      ('dd12b0bc-fb95-4266-a10f-53df120f65cc', 1, '09:00', '12:00'),
      ('dd12b0bc-fb95-4266-a10f-53df120f65cc', 3, '14:00', '17:00'),
      ('df7f2023-b629-404e-94b4-efdf5ed0a429', 2, '10:00', '13:00'),
      ('df7f2023-b629-404e-94b4-efdf5ed0a429', 4, '10:00', '15:00');

    INSERT INTO doctor.doctor_slots (doctor_id, slot_start, slot_end, status)
    VALUES
      ('dd12b0bc-fb95-4266-a10f-53df120f65cc', NOW() + interval '1 hour', NOW() + interval '1 hour 30 minutes', 'available'),
      ('dd12b0bc-fb95-4266-a10f-53df120f65cc', NOW() + interval '2 hours', NOW() + interval '2 hours 30 minutes', 'available'),
      ('df7f2023-b629-404e-94b4-efdf5ed0a429', NOW() + interval '1 hour', NOW() + interval '1 hour 30 minutes', 'available');

    INSERT INTO records.medical_records (id, patient_id, record_type, title, record_date)
    VALUES
      ('a6fc7062-6b4d-471b-b6c0-c0391f31c6cb', 'f1f6cb89-8143-45da-9b8a-f2fa3a8042e4', 'lab_result', 'Routine Blood Test', NOW()::date - interval '7 days');

    INSERT INTO records.record_entries (medical_record_id, entry_key, entry_value)
    VALUES
      ('a6fc7062-6b4d-471b-b6c0-c0391f31c6cb', 'hemoglobin', '13.8 g/dL'),
      ('a6fc7062-6b4d-471b-b6c0-c0391f31c6cb', 'wbc', '6.2 x10^9/L');
  `);
};
