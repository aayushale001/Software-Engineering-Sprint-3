import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";

import { getHomePathForRole, type AuthRole } from "../lib/session";
import { useAuthStore } from "../store/auth-store";

export const ProtectedRoute = ({ children, roles }: { children: ReactElement; roles?: AuthRole[] }) => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.role);

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (roles && (!role || !roles.includes(role))) {
    return <Navigate to={getHomePathForRole(role)} replace />;
  }

  return children;
};
