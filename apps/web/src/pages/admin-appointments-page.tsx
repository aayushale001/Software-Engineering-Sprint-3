import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export const AdminAppointmentsPage = () => {
  const token = useAuthStore((state) => state.accessToken);
  const [status, setStatus] = useState<string | null>(null);
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["admin-appointments"],
    queryFn: async () => apiClient.listAdminAppointments(token ?? ""),
    enabled: Boolean(token)
  });

  const mutation = useMutation({
    mutationFn: async (appointmentId: string) => apiClient.cancelAdminAppointment(token ?? "", appointmentId, cancelReasons[appointmentId]),
    onSuccess: async () => {
      setStatus("Appointment cancelled.");
      await query.refetch();
    },
    onError: (error) => setStatus((error as Error).message)
  });

  return (
    <section className="rounded-2xl bg-white p-5 shadow-glow">
      <h2 className="text-xl font-bold text-accent2">Appointment Oversight</h2>
      <div className="mt-4 space-y-3">
        {query.data?.appointments.map((appointment) => (
          <article key={appointment.id} className="rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-accent2">{new Date(appointment.slotStart).toLocaleString()}</p>
            <p className="text-sm text-slate-600">
              {appointment.patientName ?? appointment.patientEmail} with {appointment.doctorName ?? appointment.doctorId}
            </p>
            <p className="text-xs uppercase tracking-wide text-slate-500">{appointment.status}</p>
            {appointment.status !== "cancelled" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={cancelReasons[appointment.id] ?? ""}
                  onChange={(event) =>
                    setCancelReasons((current) => ({
                      ...current,
                      [appointment.id]: event.target.value
                    }))
                  }
                  placeholder="Cancellation reason"
                  className="min-w-60 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => mutation.mutate(appointment.id)} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white">
                  Cancel Appointment
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Reason: {appointment.cancellationReason ?? "-"}</p>
            )}
          </article>
        ))}
      </div>
      {status ? <p className="mt-4 text-sm text-slate-700">{status}</p> : null}
    </section>
  );
};
