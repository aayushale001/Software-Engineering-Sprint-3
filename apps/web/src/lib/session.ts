export type AuthRole = "patient" | "doctor" | "admin";

export type SessionPayload = {
  accessToken: string;
  role: AuthRole;
  patientId: string | null;
  staffUserId: string | null;
  doctorId: string | null;
};

export const getHomePathForRole = (role: AuthRole | null): string => {
  if (role === "doctor") {
    return "/doctor/appointments";
  }

  if (role === "admin") {
    return "/admin/doctors";
  }

  return "/";
};
