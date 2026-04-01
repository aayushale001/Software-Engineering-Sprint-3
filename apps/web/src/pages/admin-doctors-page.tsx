import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient, type DoctorSummary } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

type ScheduleRow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export const AdminDoctorsPage = () => {
  const token = useAuthStore((state) => state.accessToken);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [profile, setProfile] = useState<Partial<DoctorSummary>>({});
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionStart, setExceptionStart] = useState("");
  const [exceptionEnd, setExceptionEnd] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [conflicts, setConflicts] = useState<Array<Record<string, unknown>>>([]);

  const doctorsQuery = useQuery({
    queryKey: ["admin-doctors"],
    queryFn: async () => apiClient.listAdminDoctors(token ?? ""),
    enabled: Boolean(token)
  });

  useEffect(() => {
    if (!selectedDoctorId && doctorsQuery.data?.doctors[0]) {
      setSelectedDoctorId(doctorsQuery.data.doctors[0].id);
    }
  }, [doctorsQuery.data, selectedDoctorId]);

  const detailQuery = useQuery({
    queryKey: ["admin-doctor-detail", selectedDoctorId],
    queryFn: async () => apiClient.getAdminDoctor(token ?? "", selectedDoctorId ?? ""),
    enabled: Boolean(token && selectedDoctorId)
  });

  useEffect(() => {
    const doctor = detailQuery.data?.doctor as DoctorSummary | undefined;
    if (!doctor) {
      return;
    }

    setProfile(doctor);
    setSchedules(
      ((detailQuery.data?.schedules ?? []) as ScheduleRow[]).map((schedule) => ({
        dayOfWeek: schedule.dayOfWeek,
        startTime: String(schedule.startTime).slice(0, 5),
        endTime: String(schedule.endTime).slice(0, 5)
      }))
    );
  }, [detailQuery.data]);

  const updateProfileMutation = useMutation({
    mutationFn: async () => apiClient.updateAdminDoctor(token ?? "", selectedDoctorId ?? "", profile),
    onSuccess: async () => {
      setStatus("Doctor profile updated.");
      await Promise.all([doctorsQuery.refetch(), detailQuery.refetch()]);
    },
    onError: (error) => setStatus((error as Error).message)
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async () => apiClient.updateAdminDoctorSchedule(token ?? "", selectedDoctorId ?? "", schedules),
    onSuccess: async () => {
      setStatus("Doctor schedule updated.");
      await detailQuery.refetch();
    },
    onError: (error) => setStatus((error as Error).message)
  });

  const exceptionMutation = useMutation({
    mutationFn: async (applyToBookedAppointments?: boolean) =>
      apiClient.createAdminDoctorException(token ?? "", selectedDoctorId ?? "", {
        exceptionDate,
        startTime: exceptionStart || undefined,
        endTime: exceptionEnd || undefined,
        reason: exceptionReason,
        applyToBookedAppointments
      }),
    onSuccess: async () => {
      setStatus("Doctor exception created.");
      setExceptionDate("");
      setExceptionStart("");
      setExceptionEnd("");
      setExceptionReason("");
      setConflicts([]);
      await detailQuery.refetch();
    },
    onError: (error) => {
      const details = (error as Error & { details?: { affectedAppointments?: Array<Record<string, unknown>> } }).details;
      if (details?.affectedAppointments) {
        setConflicts(details.affectedAppointments);
        setStatus("This exception overlaps booked appointments. Confirm to cancel them.");
        return;
      }

      setStatus((error as Error).message);
    }
  });

  return (
    <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <aside className="rounded-2xl bg-white p-5 shadow-glow">
        <h2 className="text-xl font-bold text-accent2">Doctors</h2>
        <div className="mt-4 space-y-2">
          {doctorsQuery.data?.doctors.map((doctor) => (
            <button
              key={doctor.id}
              type="button"
              onClick={() => setSelectedDoctorId(doctor.id)}
              className={`w-full rounded-xl border px-3 py-2 text-left ${selectedDoctorId === doctor.id ? "border-accent bg-mist" : "border-slate-200"}`}
            >
              <p className="font-semibold text-accent2">{doctor.fullName}</p>
              <p className="text-xs text-slate-500">{doctor.specialty}</p>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {doctor.status} {doctor.staffStatus ? `• staff ${doctor.staffStatus}` : ""}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <div className="space-y-5">
        <article className="rounded-2xl bg-white p-5 shadow-glow">
          <h3 className="text-lg font-bold text-accent2">Doctor Profile</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input value={profile.fullName ?? ""} onChange={(event) => setProfile((current) => ({ ...current, fullName: event.target.value }))} placeholder="Full name" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input value={profile.specialty ?? ""} onChange={(event) => setProfile((current) => ({ ...current, specialty: event.target.value }))} placeholder="Specialty" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input value={profile.timezone ?? ""} onChange={(event) => setProfile((current) => ({ ...current, timezone: event.target.value }))} placeholder="Timezone" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input value={profile.phoneNumber ?? ""} onChange={(event) => setProfile((current) => ({ ...current, phoneNumber: event.target.value }))} placeholder="Phone number" className="rounded-xl border border-slate-200 px-3 py-2" />
            <select value={profile.status ?? "active"} onChange={(event) => setProfile((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))} className="rounded-xl border border-slate-200 px-3 py-2">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">Staff email: {profile.staffEmail ?? "-"}</div>
            <textarea value={profile.bio ?? ""} onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))} placeholder="Bio" className="min-h-28 rounded-xl border border-slate-200 px-3 py-2 md:col-span-2" />
          </div>
          <button type="button" onClick={() => updateProfileMutation.mutate()} disabled={updateProfileMutation.isPending || !selectedDoctorId} className="mt-4 rounded-xl bg-accent2 px-4 py-2 font-semibold text-white">
            Save Doctor
          </button>
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-glow">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-accent2">Weekly Schedule</h3>
            <button type="button" onClick={() => setSchedules((current) => [...current, { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }])} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              Add Day
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {schedules.map((schedule, index) => (
              <div key={`${schedule.dayOfWeek}-${index}`} className="grid gap-3 md:grid-cols-4">
                <input type="number" min={0} max={6} value={schedule.dayOfWeek} onChange={(event) => setSchedules((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, dayOfWeek: Number(event.target.value) } : entry)))} className="rounded-xl border border-slate-200 px-3 py-2" />
                <input type="time" value={schedule.startTime} onChange={(event) => setSchedules((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, startTime: event.target.value } : entry)))} className="rounded-xl border border-slate-200 px-3 py-2" />
                <input type="time" value={schedule.endTime} onChange={(event) => setSchedules((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, endTime: event.target.value } : entry)))} className="rounded-xl border border-slate-200 px-3 py-2" />
                <button type="button" onClick={() => setSchedules((current) => current.filter((_, entryIndex) => entryIndex !== index))} className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-700">
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => updateScheduleMutation.mutate()} disabled={updateScheduleMutation.isPending || !selectedDoctorId} className="mt-4 rounded-xl bg-accent px-4 py-2 font-semibold text-white">
            Save Schedule
          </button>
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-glow">
          <h3 className="text-lg font-bold text-accent2">Schedule Exception</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <input type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
            <input type="time" value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
            <input type="time" value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
            <input value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} placeholder="Reason" className="rounded-xl border border-slate-200 px-3 py-2" />
          </div>
          <button type="button" onClick={() => exceptionMutation.mutate(false)} disabled={exceptionMutation.isPending || !selectedDoctorId || !exceptionDate || !exceptionReason} className="mt-4 rounded-xl bg-accent2 px-4 py-2 font-semibold text-white">
            Create Exception
          </button>
          {conflicts.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="font-semibold text-accent2">Affected appointments</p>
              <div className="mt-3 space-y-2">
                {conflicts.map((conflict) => (
                  <div key={String(conflict.appointmentId)} className="rounded-lg border border-amber-200 p-3 text-sm">
                    <p>{String(conflict.patientName ?? conflict.patientEmail)}</p>
                    <p>{new Date(String(conflict.slotStart)).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => exceptionMutation.mutate(true)} className="mt-3 rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white">
                Confirm Exception And Cancel Appointments
              </button>
            </div>
          ) : null}
        </article>
      </div>

      {status ? <p className="text-sm text-slate-700 lg:col-span-2">{status}</p> : null}
    </section>
  );
};
