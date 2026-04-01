import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AuthRole, SessionPayload } from "../lib/session";

type AuthState = {
  accessToken: string | null;
  role: AuthRole | null;
  patientId: string | null;
  staffUserId: string | null;
  doctorId: string | null;
  setAuth: (next: SessionPayload) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      role: null,
      patientId: null,
      staffUserId: null,
      doctorId: null,
      setAuth: (next) => set(next),
      clearAuth: () =>
        set({
          accessToken: null,
          role: null,
          patientId: null,
          staffUserId: null,
          doctorId: null
        })
    }),
    {
      name: "hospital-auth"
    }
  )
);
