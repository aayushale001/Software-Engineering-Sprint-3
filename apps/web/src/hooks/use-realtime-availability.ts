import { useEffect } from "react";

type UseRealtimeAvailabilityProps = {
  token: string | null;
  doctorId: string | null;
  onSlotUpdate: (payload: { doctorId: string; slotStart: string; status: string; event?: string }) => void;
};

export const useRealtimeAvailability = ({ token, doctorId, onSlotUpdate }: UseRealtimeAvailabilityProps) => {
  useEffect(() => {
    if (!token || !doctorId) {
      return;
    }

    const baseWs = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:3007/ws";
    const ws = new WebSocket(`${baseWs}?token=${encodeURIComponent(token)}&doctorIds=${encodeURIComponent(doctorId)}`);

    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as {
        event?: string;
        payload?: { doctorId: string; slotStart: string; status: string };
      };

      if (parsed.payload) {
        onSlotUpdate({
          ...parsed.payload,
          event: parsed.event
        });
      }
    };

    return () => {
      ws.close();
    };
  }, [token, doctorId, onSlotUpdate]);
};
