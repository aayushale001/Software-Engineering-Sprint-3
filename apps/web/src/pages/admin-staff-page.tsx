import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export const AdminStaffPage = () => {
  const token = useAuthStore((state) => state.accessToken);
  const [status, setStatus] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [doctorEmail, setDoctorEmail] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorSpecialty, setDoctorSpecialty] = useState("");
  const [doctorTimezone, setDoctorTimezone] = useState("UTC");
  const [doctorPhone, setDoctorPhone] = useState("");
  const [doctorBio, setDoctorBio] = useState("");

  const usersQuery = useQuery({
    queryKey: ["admin-staff-users"],
    queryFn: async () => apiClient.listStaffUsers(token ?? ""),
    enabled: Boolean(token)
  });

  const inviteMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof apiClient.createStaffInvite>[1]) => apiClient.createStaffInvite(token ?? "", payload),
    onSuccess: async (result) => {
      setStatus(`Invite created. Setup URL: ${String(result.setupUrl)}`);
      setAdminEmail("");
      setDoctorEmail("");
      setDoctorName("");
      setDoctorSpecialty("");
      setDoctorPhone("");
      setDoctorBio("");
      await usersQuery.refetch();
    },
    onError: (error) => setStatus((error as Error).message)
  });

  return (
    <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <article className="rounded-2xl bg-white p-5 shadow-glow">
        <h2 className="text-xl font-bold text-accent2">Invite Staff</h2>

        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-accent2">Invite Admin</h3>
          <input value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="admin@hospital.com" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2" />
          <button
            type="button"
            onClick={() => inviteMutation.mutate({ email: adminEmail, role: "admin" })}
            disabled={inviteMutation.isPending || !adminEmail}
            className="mt-3 rounded-xl bg-accent2 px-4 py-2 font-semibold text-white"
          >
            Invite Admin
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-accent2">Invite Doctor</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input value={doctorEmail} onChange={(event) => setDoctorEmail(event.target.value)} placeholder="doctor@hospital.com" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input value={doctorName} onChange={(event) => setDoctorName(event.target.value)} placeholder="Doctor name" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input value={doctorSpecialty} onChange={(event) => setDoctorSpecialty(event.target.value)} placeholder="Specialty" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input value={doctorTimezone} onChange={(event) => setDoctorTimezone(event.target.value)} placeholder="Timezone" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input value={doctorPhone} onChange={(event) => setDoctorPhone(event.target.value)} placeholder="Phone number" className="rounded-xl border border-slate-200 px-3 py-2 md:col-span-2" />
            <textarea value={doctorBio} onChange={(event) => setDoctorBio(event.target.value)} placeholder="Short bio" className="min-h-28 rounded-xl border border-slate-200 px-3 py-2 md:col-span-2" />
          </div>
          <button
            type="button"
            onClick={() =>
              inviteMutation.mutate({
                email: doctorEmail,
                role: "doctor",
                doctorProfile: {
                  fullName: doctorName,
                  specialty: doctorSpecialty,
                  timezone: doctorTimezone,
                  phoneNumber: doctorPhone || undefined,
                  bio: doctorBio || undefined
                }
              })
            }
            disabled={inviteMutation.isPending || !doctorEmail || !doctorName || !doctorSpecialty || !doctorTimezone}
            className="mt-3 rounded-xl bg-accent px-4 py-2 font-semibold text-white"
          >
            Invite Doctor
          </button>
        </div>
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-glow">
        <h3 className="text-lg font-bold text-accent2">Staff Accounts</h3>
        <div className="mt-4 space-y-3">
          {usersQuery.data?.users.map((user) => (
            <div key={String(user.id)} className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
              <p className="font-semibold text-accent2">{String(user.email)}</p>
              <p>Role: {String(user.role)}</p>
              <p>Status: {String(user.status)}</p>
            </div>
          ))}
        </div>
      </article>

      {status ? <p className="text-sm text-slate-700 lg:col-span-2">{status}</p> : null}
    </section>
  );
};
