import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export const MyAppointmentsPage = () => {
  const token = useAuthStore((state) => state.accessToken);
  const [status, setStatus] = useState<string | null>(null);
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => apiClient.listAppointments(token ?? ""),
    enabled: Boolean(token)
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => apiClient.cancelAppointment(appointmentId, token ?? "", cancelReasons[appointmentId]),
    onSuccess: async () => {
      setStatus("Appointment cancelled.");
      await query.refetch();
    },
    onError: (error) => setStatus((error as Error).message)
  });

  return (
    <section className="rounded-2xl bg-white p-4 shadow-glow">
      <h2 className="text-xl font-bold text-accent2">My Appointments</h2>

      <div className="mt-4 space-y-3">
        {query.data?.appointments?.map((appointment) => (
          <article key={String(appointment.id)} className="rounded-xl border border-slate-200 p-3">
            <p className="font-semibold text-accent2">{new Date(String(appointment.slotStart)).toLocaleString()}</p>
            <p className="text-sm text-slate-600">Doctor: {String(appointment.doctorName ?? appointment.doctorId)}</p>
            <p className="text-xs uppercase tracking-wide text-slate-500">{String(appointment.status)}</p>
            {appointment.status !== "cancelled" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={cancelReasons[String(appointment.id)] ?? ""}
                  onChange={(event) =>
                    setCancelReasons((current) => ({
                      ...current,
                      [String(appointment.id)]: event.target.value
                    }))
                  }
                  placeholder="Cancellation reason"
                  className="min-w-56 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => cancelMutation.mutate(String(appointment.id))}
                  className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Reason: {String(appointment.cancellationReason ?? "-")}</p>
            )}
          </article>
        ))}
      </div>

      {status ? <p className="mt-4 text-sm text-slate-700">{status}</p> : null}
    </section>
  );
};
