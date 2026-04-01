import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

type ScheduleRow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DoctorSchedulePage = () => {
  const token = useAuthStore((state) => state.accessToken);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionStart, setExceptionStart] = useState("");
  const [exceptionEnd, setExceptionEnd] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [conflicts, setConflicts] = useState<Array<Record<string, unknown>>>([]);

  const query = useQuery({
    queryKey: ["doctor-schedule"],
    queryFn: async () => apiClient.getDoctorSchedule(token ?? ""),
    enabled: Boolean(token)
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }

    setSchedules(
      (query.data.schedules as ScheduleRow[]).map((schedule) => ({
        dayOfWeek: schedule.dayOfWeek,
        startTime: String(schedule.startTime).slice(0, 5),
        endTime: String(schedule.endTime).slice(0, 5)
      }))
    );
  }, [query.data]);

  const scheduleMutation = useMutation({
    mutationFn: async () => apiClient.updateDoctorSchedule(token ?? "", schedules),
    onSuccess: async () => {
      setStatus("Weekly schedule updated.");
      await query.refetch();
    },
    onError: (error) => setStatus((error as Error).message)
  });

  const exceptionMutation = useMutation({
    mutationFn: async (applyToBookedAppointments?: boolean) =>
      apiClient.createDoctorException(token ?? "", {
        exceptionDate,
        startTime: exceptionStart || undefined,
        endTime: exceptionEnd || undefined,
        reason: exceptionReason,
        applyToBookedAppointments
      }),
    onSuccess: async () => {
      setStatus("Schedule exception created.");
      setConflicts([]);
      setExceptionDate("");
      setExceptionStart("");
      setExceptionEnd("");
      setExceptionReason("");
      await query.refetch();
    },
    onError: (error) => {
      const details = (error as Error & { details?: { affectedAppointments?: Array<Record<string, unknown>> } }).details;
      if (details?.affectedAppointments) {
        setConflicts(details.affectedAppointments);
        setStatus("This exception overlaps booked appointments. Review and confirm to cancel them.");
        return;
      }

      setStatus((error as Error).message);
    }
  });

  return (
    <section className="space-y-5">
      <article className="rounded-2xl bg-white p-5 shadow-glow">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-accent2">Weekly Schedule</h2>
            <p className="text-sm text-slate-600">Define recurring working hours. Slots are regenerated from this template.</p>
          </div>
          <button
            type="button"
            onClick={() => setSchedules((current) => [...current, { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }])}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            Add Day
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {schedules.map((schedule, index) => (
            <div key={`${schedule.dayOfWeek}-${index}`} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-4">
              <select
                value={schedule.dayOfWeek}
                onChange={(event) =>
                  setSchedules((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, dayOfWeek: Number(event.target.value) } : entry
                    )
                  )
                }
                className="rounded-xl border border-slate-200 px-3 py-2"
              >
                {dayLabels.map((label, dayOfWeek) => (
                  <option key={label} value={dayOfWeek}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={schedule.startTime}
                onChange={(event) =>
                  setSchedules((current) =>
                    current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, startTime: event.target.value } : entry))
                  )
                }
                className="rounded-xl border border-slate-200 px-3 py-2"
              />
              <input
                type="time"
                value={schedule.endTime}
                onChange={(event) =>
                  setSchedules((current) =>
                    current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, endTime: event.target.value } : entry))
                  )
                }
                className="rounded-xl border border-slate-200 px-3 py-2"
              />
              <button
                type="button"
                onClick={() => setSchedules((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => scheduleMutation.mutate()}
          disabled={scheduleMutation.isPending || !token}
          className="mt-4 rounded-xl bg-accent2 px-4 py-2 font-semibold text-white hover:bg-[#0a3760] disabled:opacity-70"
        >
          Save Weekly Schedule
        </button>
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-glow">
        <h3 className="text-lg font-bold text-accent2">Time Off / Schedule Exception</h3>
        <p className="text-sm text-slate-600">Create a one-off cancellation window. If booked visits overlap, you can confirm their cancellation here.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
          <input type="time" value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
          <input type="time" value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
          <input value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} placeholder="Reason" className="rounded-xl border border-slate-200 px-3 py-2" />
        </div>

        <button
          type="button"
          onClick={() => exceptionMutation.mutate(false)}
          disabled={exceptionMutation.isPending || !exceptionDate || !exceptionReason}
          className="mt-4 rounded-xl bg-accent px-4 py-2 font-semibold text-white hover:bg-accent2 disabled:opacity-70"
        >
          Create Exception
        </button>

        {conflicts.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-accent2">Affected appointments</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {conflicts.map((conflict) => (
                <div key={String(conflict.appointmentId)} className="rounded-lg border border-amber-200 p-3">
                  <p>{String(conflict.patientName ?? conflict.patientEmail)}</p>
                  <p>{new Date(String(conflict.slotStart)).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => exceptionMutation.mutate(true)}
              disabled={exceptionMutation.isPending}
              className="mt-3 rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white"
            >
              Confirm Exception And Cancel Appointments
            </button>
          </div>
        ) : null}

        <div className="mt-4">
          <h4 className="font-semibold text-accent2">Existing Exceptions</h4>
          <div className="mt-3 space-y-2">
            {(query.data?.exceptions ?? []).map((exception) => (
              <div key={String(exception.id)} className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                <p>{String(exception.exceptionDate)}</p>
                <p>
                  {exception.startTime ? String(exception.startTime).slice(0, 5) : "Full day"} {exception.endTime ? `- ${String(exception.endTime).slice(0, 5)}` : ""}
                </p>
                <p>{String(exception.reason)}</p>
              </div>
            ))}
          </div>
        </div>
      </article>

      {status ? <p className="text-sm text-slate-700">{status}</p> : null}
    </section>
  );
};
