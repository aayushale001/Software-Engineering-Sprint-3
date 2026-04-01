import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient, type MedicalRecord, type PatientProfile } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export const AdminPatientsPage = () => {
  const token = useAuthStore((state) => state.accessToken);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const patientsQuery = useQuery({
    queryKey: ["admin-patients"],
    queryFn: async () => apiClient.listAdminPatients(token ?? ""),
    enabled: Boolean(token)
  });

  const profileQuery = useQuery({
    queryKey: ["admin-patient-profile", selectedPatientId],
    queryFn: async () => apiClient.getAdminPatientProfile(token ?? "", selectedPatientId ?? ""),
    enabled: Boolean(token && selectedPatientId)
  });

  const recordsQuery = useQuery({
    queryKey: ["admin-patient-records", selectedPatientId],
    queryFn: async () => apiClient.getAdminPatientRecords(token ?? "", selectedPatientId ?? ""),
    enabled: Boolean(token && selectedPatientId)
  });

  const statusMutation = useMutation({
    mutationFn: async (nextStatus: "active" | "inactive") => apiClient.updateAdminPatientStatus(token ?? "", selectedPatientId ?? "", nextStatus),
    onSuccess: async () => {
      setStatus("Patient status updated.");
      await Promise.all([patientsQuery.refetch(), profileQuery.refetch()]);
    },
    onError: (error) => setStatus((error as Error).message)
  });

  const profile = profileQuery.data as PatientProfile | undefined;
  const records = (recordsQuery.data?.records ?? []) as MedicalRecord[];

  return (
    <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <aside className="rounded-2xl bg-white p-5 shadow-glow">
        <h2 className="text-xl font-bold text-accent2">Patients</h2>
        <div className="mt-4 space-y-2">
          {patientsQuery.data?.patients.map((patient) => (
            <button key={patient.id} type="button" onClick={() => setSelectedPatientId(patient.id)} className={`w-full rounded-xl border px-3 py-2 text-left ${selectedPatientId === patient.id ? "border-accent bg-mist" : "border-slate-200"}`}>
              <p className="font-semibold text-accent2">{patient.fullName ?? patient.email}</p>
              <p className="text-xs text-slate-500">{patient.email}</p>
              <p className="text-xs uppercase tracking-wide text-slate-400">{patient.status}</p>
            </button>
          ))}
        </div>
      </aside>

      <article className="rounded-2xl bg-white p-5 shadow-glow">
        {profile ? (
          <>
            <h3 className="text-lg font-bold text-accent2">{profile.fullName ?? profile.email}</h3>
            <div className="mt-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              <p>Email: {profile.email}</p>
              <p>DOB: {profile.dateOfBirth ?? "-"}</p>
              <p>Phone: {profile.phoneNumber ?? "-"}</p>
              <p>Status: {profile.status}</p>
            </div>
            <button
              type="button"
              onClick={() => statusMutation.mutate(profile.status === "active" ? "inactive" : "active")}
              className="mt-4 rounded-xl bg-accent2 px-4 py-2 font-semibold text-white"
            >
              {profile.status === "active" ? "Deactivate Patient" : "Reactivate Patient"}
            </button>

            <div className="mt-5">
              <h4 className="font-semibold text-accent2">Medical Records</h4>
              <div className="mt-3 space-y-2">
                {records.map((record) => (
                  <div key={record.id} className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                    <p className="font-semibold text-accent2">{record.title}</p>
                    <p>{record.recordType}</p>
                    <p>{record.recordDate}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600">Select a patient to review profile and records.</p>
        )}
      </article>

      {status ? <p className="text-sm text-slate-700 lg:col-span-2">{status}</p> : null}
    </section>
  );
};
