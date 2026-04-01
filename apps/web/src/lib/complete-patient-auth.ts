import type { NavigateFunction } from "react-router-dom";

import type { SessionPayload } from "./session";
import { apiClient } from "./api";
import { getHomePathForRole } from "./session";

export const resolvePostAuthPath = async (session: SessionPayload): Promise<string> => {
  if (session.role !== "patient") {
    return getHomePathForRole(session.role);
  }

  const profile = await apiClient.getProfile(session.accessToken);
  return profile.profileComplete ? "/" : "/profile";
};

export const finishAuthNavigation = async (
  session: SessionPayload,
  navigate: NavigateFunction,
  setAuth: (next: SessionPayload) => void
) => {
  const nextPath = await resolvePostAuthPath(session);
  setAuth(session);
  navigate(nextPath, { replace: true });
};
