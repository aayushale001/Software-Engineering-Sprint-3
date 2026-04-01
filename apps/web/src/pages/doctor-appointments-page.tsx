import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient, type MedicalRecord, type PatientProfile } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export const DoctorAppointmentsPage = () => {
  const token = useAuthStore((state) => state.accessToken);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  const appointmentsQuery = useQuery({
    queryKey: ["doctor-appointments"],
    queryFn: async () => apiClient.listDoctorAppointments(token ?? ""),
    enabled: Boolean(token)
  });

  const patientProfileQuery = useQuery({
    queryKey: ["doctor-patient-profile", selectedPatientId],
    queryFn: async () => apiClient.getDoctorPatientProfile(token ?? "", selectedPatientId ?? ""),
    enabled: Boolean(token && selectedPatientId)
  });

  const patientRecordsQuery = useQuery({
    queryKey: ["doctor-patient-records", selectedPatientId],
    queryFn: async () => apiClient.getDoctorPatientRecords(token ?? "", selectedPatientId ?? ""),
    enabled: Boolean(token && selectedPatientId)
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => apiClient.cancelDoctorAppointment(token ?? "", appointmentId, cancelReason[appointmentId]),
    onSuccess: async () => {
      setStatus("Appointment cancelled.");
      await appointmentsQuery.refetch();
    },
    onError: (error) => setStatus((error as Error).message)
  });

  const profile = patientProfileQuery.data as PatientProfile | undefined;
  const records = (patientRecordsQuery.data?.records ?? []) as MedicalRecord[];

  return (
    <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <article className="rounded-2xl bg-white p-5 shadow-glow">
        <h2 className="text-xl font-bold text-accent2">My Appointments</h2>
        <div className="mt-4 space-y-3">
          {appointmentsQuery.data?.appointments.map((appointment) => (
            <article key={appointment.id} className="rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-accent2">{new Date(appointment.slotStart).toLocaleString()}</p>
              <p className="text-sm text-slate-600">Patient: {appointment.patientName ?? appointment.patientEmail}</p>
              <p className="text-xs uppercase tracking-wide text-slate-500">{appointment.status}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPatientId(appointment.patientId)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  View Patient
                </button>
                {appointment.status !== "cancelled" ? (
                  <>
                    <input
                      value={cancelReason[appointment.id] ?? ""}
                      onChange={(event) =>
                        setCancelReason((current) => ({
                          ...current,
                          [appointment.id]: event.target.value
                        }))
                      }
                      placeholder="Cancellation reason"
                      className="min-w-56 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => cancelMutation.mutate(appointment.id)}
                      className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Cancel
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </article>

      <aside className="rounded-2xl bg-white p-5 shadow-glow">
        <h3 className="text-lg font-bold text-accent2">Patient Detail</h3>
        {profile ? (
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold text-accent2">{profile.fullName ?? profile.email}</p>
              <p>{profile.email}</p>
              <p>DOB: {profile.dateOfBirth ?? "-"}</p>
              <p>Phone: {profile.phoneNumber ?? "-"}</p>
            </div>
            <div>
              <h4 className="font-semibold text-accent2">Records</h4>
              <div className="mt-2 space-y-2">
                {records.map((record) => (
                  <div key={record.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="font-semibold text-accent2">{record.title}</p>
                    <p>{record.recordType}</p>
                    <p>{record.recordDate}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-600">Select an appointment to view patient profile and records.</p>
        )}
      </aside>

      {status ? <p className="text-sm text-slate-700 lg:col-span-2">{status}</p> : null}
    </section>
  );
};
