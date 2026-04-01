import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";

import { apiClient } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export const PatientOnboardingGate = ({ children }: { children: ReactElement }) => {
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.role);

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: async () => apiClient.getProfile(accessToken ?? ""),
    enabled: role === "patient" && Boolean(accessToken)
  });

  if (role !== "patient") {
    return children;
  }

  if (profileQuery.isPending) {
    return (
      <div className="mx-auto mt-16 max-w-xl rounded-2xl bg-white/80 p-6 text-sm text-slate-700 shadow-glow backdrop-blur">
        Loading your patient profile...
      </div>
    );
  }

  if (profileQuery.error) {
    return (
      <div className="mx-auto mt-16 max-w-xl rounded-2xl bg-white/80 p-6 text-sm text-red-700 shadow-glow backdrop-blur">
        Unable to load your patient profile. Refresh and try again.
      </div>
    );
  }

  if (!profileQuery.data?.profileComplete && location.pathname !== "/profile") {
    return <Navigate to="/profile" replace />;
  }

  return children;
};
