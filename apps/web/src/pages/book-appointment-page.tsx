import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRealtimeAvailability } from "../hooks/use-realtime-availability";
import { apiClient } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

type Slot = {
  doctorId: string;
  slotStart: string;
  slotEnd: string;
  status: "available" | "held" | "booked";
  heldByPatientId?: string | null;
  holdExpiresAt?: string | null;
};

const AVAILABILITY_WINDOW_DAYS = 7;

const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const BookAppointmentPage = () => {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [hold, setHold] = useState<{ holdId: string; expiresAt: string } | null>(null);
  const [rangeStartDate, setRangeStartDate] = useState(() => formatDateInputValue(new Date()));

  const doctorsQuery = useQuery({
    queryKey: ["doctors"],
    queryFn: apiClient.getDoctors
  });

  const range = useMemo(() => {
    const start = new Date(`${rangeStartDate}T00:00:00`);
    const end = new Date();
    end.setTime(start.getTime());
    end.setDate(start.getDate() + AVAILABILITY_WINDOW_DAYS);
    const displayEnd = new Date(end);
    displayEnd.setDate(end.getDate() - 1);

    return {
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${start.toLocaleDateString()} - ${displayEnd.toLocaleDateString()}`
    };
  }, [rangeStartDate]);

  const availabilityQuery = useQuery({
    queryKey: ["availability", selectedDoctorId, range.start, range.end],
    queryFn: async () => {
      const result = await apiClient.getAvailability(selectedDoctorId ?? "", range.start, range.end, token ?? "");
      return result.slots as Slot[];
    },
    enabled: Boolean(selectedDoctorId && token)
  });

  useRealtimeAvailability({
    token,
    doctorId: selectedDoctorId,
    onSlotUpdate: useCallback(
      (event) => {
        queryClient.setQueryData<Slot[]>(["availability", selectedDoctorId, range.start, range.end], (current) =>
          (current ?? []).map((slot) => {
            if (slot.slotStart === event.slotStart) {
              return {
                ...slot,
                status: event.status as Slot["status"]
              };
            }
            return slot;
          })
        );
      },
      [queryClient, range.end, range.start, selectedDoctorId]
    )
  });

  const holdMutation = useMutation({
    mutationFn: async (slot: Slot) => {
      return apiClient.holdAppointment(
        {
          doctorId: slot.doctorId,
          slotStart: slot.slotStart
        },
        token ?? ""
      );
    },
    onSuccess: (result, slot) => {
      setSelectedSlot(slot);
      setHold(result);
    }
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!hold) {
        throw new Error("No active hold");
      }
      return apiClient.confirmAppointment(hold.holdId, token ?? "");
    },
    onSuccess: () => {
      setHold(null);
      setSelectedSlot(null);
      availabilityQuery.refetch();
    }
  });

  const remainingSeconds = hold
    ? Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000))
    : 0;

  const shiftRange = (days: number) => {
    setRangeStartDate((current) => {
      const next = new Date(`${current}T00:00:00`);
      next.setDate(next.getDate() + days);
      return formatDateInputValue(next);
    });
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl bg-white p-4 shadow-glow">
        <h3 className="text-lg font-bold text-accent2">Select Doctor</h3>
        <div className="mt-3 space-y-2">
          {doctorsQuery.data?.map((doctor) => {
            const active = selectedDoctorId === doctor.id;
            return (
              <button
                key={doctor.id}
                type="button"
                className={`w-full rounded-xl border px-3 py-2 text-left ${active ? "border-accent bg-mist" : "border-slate-200"}`}
                onClick={() => setSelectedDoctorId(doctor.id)}
              >
                <p className="font-semibold text-accent2">{doctor.fullName}</p>
                <p className="text-xs text-slate-500">{doctor.specialty}</p>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="rounded-2xl bg-white p-4 shadow-glow">
        <h3 className="text-lg font-bold text-accent2">Live Availability</h3>
        <p className="text-sm text-slate-600">Updates stream in real time while you browse slots.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => shiftRange(-AVAILABILITY_WINDOW_DAYS)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            Previous Week
          </button>
          <input
            type="date"
            value={rangeStartDate}
            onChange={(event) => setRangeStartDate(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => shiftRange(AVAILABILITY_WINDOW_DAYS)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            Next Week
          </button>
          <p className="text-sm text-slate-500">Showing {range.label}</p>
        </div>

        {!selectedDoctorId ? <p className="mt-4 text-sm text-slate-600">Select a doctor to view availability.</p> : null}
        {selectedDoctorId && availabilityQuery.isPending ? <p className="mt-4 text-sm text-slate-600">Loading slots...</p> : null}
        {selectedDoctorId && availabilityQuery.error ? (
          <p className="mt-4 text-sm text-red-700">
            {(availabilityQuery.error as Error).message || "Unable to load availability."}
          </p>
        ) : null}
        {selectedDoctorId && !availabilityQuery.isPending && !availabilityQuery.error && (availabilityQuery.data?.length ?? 0) === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No slots were found in this 7-day window. Try a different week.</p>
        ) : null}

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {availabilityQuery.data?.map((slot) => (
            <button
              key={`${slot.doctorId}-${slot.slotStart}`}
              type="button"
              disabled={slot.status !== "available" || holdMutation.isPending}
              onClick={() => holdMutation.mutate(slot)}
              className={`rounded-xl border p-3 text-left ${
                slot.status === "available"
                  ? "border-accent bg-white hover:bg-mist"
                  : slot.status === "held"
                    ? "border-warm bg-amber-50"
                    : "border-slate-300 bg-slate-100"
              }`}
            >
              <p className="font-semibold text-accent2">{new Date(slot.slotStart).toLocaleString()}</p>
              <p className="text-xs uppercase tracking-wide text-slate-500">{slot.status}</p>
            </button>
          ))}
        </div>

        {hold ? (
          <div className="mt-5 rounded-xl border border-warm bg-amber-50 p-4">
            <p className="font-semibold text-accent2">Slot Held</p>
            <p className="text-sm text-slate-700">
              {selectedSlot ? new Date(selectedSlot.slotStart).toLocaleString() : "Selected slot"}
            </p>
            <p className="text-sm text-slate-600">Confirm within {remainingSeconds}s to avoid release.</p>
            <button
              type="button"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending || remainingSeconds === 0}
              className="mt-3 rounded-xl bg-accent2 px-4 py-2 font-semibold text-white hover:bg-[#0a3760] disabled:opacity-70"
            >
              Confirm Appointment
            </button>
          </div>
        ) : null}

        {holdMutation.error ? <p className="mt-3 text-sm text-red-700">{(holdMutation.error as Error).message}</p> : null}
        {confirmMutation.error ? <p className="mt-3 text-sm text-red-700">{(confirmMutation.error as Error).message}</p> : null}
      </div>
    </section>
  );
};
