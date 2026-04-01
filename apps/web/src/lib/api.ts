import type { AuthRole, SessionPayload } from "./session";

export type PatientProfile = {
  id: string;
  email: string;
  fullName: string | null;
  dateOfBirth: string | null;
  phoneNumber: string | null;
  profileComplete: boolean;
  status: "active" | "inactive";
};

export type DoctorSummary = {
  id: string;
  fullName: string;
  specialty: string;
  timezone: string;
  bio: string | null;
  phoneNumber: string | null;
  status: "active" | "inactive";
  staffEmail?: string | null;
  staffStatus?: "invited" | "active" | "inactive" | null;
  staffUserId?: string | null;
};

export type Slot = {
  doctorId: string;
  slotStart: string;
  slotEnd: string;
  status: "available" | "held" | "booked";
  heldByPatientId?: string | null;
  holdExpiresAt?: string | null;
};

export type Appointment = {
  id: string;
  patientId: string;
  doctorId: string;
  slotStart: string;
  slotEnd: string;
  status: string;
  reason: string | null;
  cancellationReason: string | null;
  patientName: string | null;
  patientEmail: string;
  doctorName: string | null;
};

export type MedicalRecordEntry = {
  id: string;
  key: string;
  value: string;
};

export type MedicalRecord = {
  id: string;
  patientId: string;
  recordType: string;
  title: string;
  recordDate: string;
  createdAt: string;
  entries?: MedicalRecordEntry[];
};

export type MedicalRecordDetail = MedicalRecord & {
  entries: MedicalRecordEntry[];
};

export type AuditLog = {
  id: number;
  eventType: string;
  actorType: string;
  actorId: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
};

export type StaffInvitePayload =
  | {
      email: string;
      role: "admin";
    }
  | {
      email: string;
      role: "doctor";
      doctorProfile: {
        fullName: string;
        specialty: string;
        timezone: string;
        bio?: string;
        phoneNumber?: string;
      };
    };

export type ApiClient = {
  patientSignup: (email: string, password: string) => Promise<SessionPayload>;
  patientLogin: (email: string, password: string) => Promise<SessionPayload>;
  patientForgotPassword: (email: string) => Promise<{ message: string }>;
  getPatientResetToken: (token: string) => Promise<{ email: string; expiresAt: string }>;
  resetPatientPassword: (token: string, password: string) => Promise<SessionPayload>;
  requestOtp: (email: string) => Promise<{ message: string; expiresInSeconds: number; devOtp?: string }>;
  verifyOtp: (email: string, otp: string) => Promise<SessionPayload>;
  getGoogleAuthorizationUrl: () => Promise<{ authorizationUrl: string }>;
  exchangeGoogleCode: (code: string, state: string) => Promise<SessionPayload>;
  staffLogin: (email: string, password: string) => Promise<SessionPayload>;
  getStaffInvite: (token: string) => Promise<{ email: string; role: AuthRole; expiresAt: string; acceptedAt: string | null; status: string }>;
  acceptStaffInvite: (inviteToken: string, password: string) => Promise<SessionPayload>;
  listStaffUsers: (token: string, role?: "doctor" | "admin") => Promise<{ users: Array<Record<string, unknown>> }>;
  createStaffInvite: (token: string, payload: StaffInvitePayload) => Promise<Record<string, unknown>>;
  logout: () => Promise<{ message: string }>;
  updateProfile: (token: string, payload: Partial<{ fullName: string; dateOfBirth: string; phoneNumber: string }>) => Promise<{ profile: PatientProfile }>;
  getProfile: (token: string) => Promise<PatientProfile>;
  getDoctors: () => Promise<DoctorSummary[]>;
  getAvailability: (doctorId: string, start: string, end: string, token: string) => Promise<{ slots: Slot[] }>;
  holdAppointment: (payload: { doctorId: string; slotStart: string; reason?: string }, token: string) => Promise<{ holdId: string; expiresAt: string }>;
  confirmAppointment: (holdId: string, token: string) => Promise<Record<string, unknown>>;
  listAppointments: (token: string) => Promise<{ appointments: Appointment[] }>;
  cancelAppointment: (appointmentId: string, token: string, reason?: string) => Promise<{ appointment: Appointment }>;
  listRecords: (token: string) => Promise<{ records: MedicalRecord[] }>;
  createRecord: (
    token: string,
    payload: { recordType: string; title: string; recordDate: string; entries: Array<{ key: string; value: string }> }
  ) => Promise<MedicalRecordDetail>;
  updateRecord: (
    token: string,
    recordId: string,
    payload: { recordType?: string; title?: string; recordDate?: string; entries?: Array<{ key: string; value: string }> }
  ) => Promise<MedicalRecordDetail>;
  getDoctorProfile: (token: string) => Promise<DoctorSummary>;
  updateDoctorProfile: (
    token: string,
    payload: Partial<{ fullName: string; specialty: string; timezone: string; bio: string | null; phoneNumber: string | null }>
  ) => Promise<DoctorSummary>;
  getDoctorSchedule: (token: string) => Promise<{ schedules: Array<Record<string, unknown>>; exceptions: Array<Record<string, unknown>> }>;
  updateDoctorSchedule: (token: string, schedules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>) => Promise<{ schedules: Array<Record<string, unknown>> }>;
  createDoctorException: (
    token: string,
    payload: { exceptionDate: string; startTime?: string; endTime?: string; reason: string; applyToBookedAppointments?: boolean }
  ) => Promise<Record<string, unknown>>;
  listDoctorAppointments: (token: string) => Promise<{ appointments: Appointment[] }>;
  cancelDoctorAppointment: (token: string, appointmentId: string, reason?: string) => Promise<{ appointment: Appointment }>;
  getDoctorPatientProfile: (token: string, patientId: string) => Promise<PatientProfile>;
  getDoctorPatientRecords: (token: string, patientId: string) => Promise<{ records: MedicalRecord[] }>;
  listAdminDoctors: (token: string) => Promise<{ doctors: DoctorSummary[] }>;
  getAdminDoctor: (token: string, doctorId: string) => Promise<Record<string, unknown>>;
  updateAdminDoctor: (
    token: string,
    doctorId: string,
    payload: Partial<{ fullName: string; specialty: string; timezone: string; bio: string | null; phoneNumber: string | null; status: "active" | "inactive" }>
  ) => Promise<DoctorSummary>;
  getAdminDoctorSchedule: (token: string, doctorId: string) => Promise<{ schedules: Array<Record<string, unknown>>; exceptions: Array<Record<string, unknown>> }>;
  updateAdminDoctorSchedule: (
    token: string,
    doctorId: string,
    schedules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>
  ) => Promise<{ schedules: Array<Record<string, unknown>> }>;
  createAdminDoctorException: (
    token: string,
    doctorId: string,
    payload: { exceptionDate: string; startTime?: string; endTime?: string; reason: string; applyToBookedAppointments?: boolean }
  ) => Promise<Record<string, unknown>>;
  listAdminPatients: (token: string) => Promise<{ patients: PatientProfile[] }>;
  getAdminPatientProfile: (token: string, patientId: string) => Promise<PatientProfile>;
  updateAdminPatientStatus: (token: string, patientId: string, status: "active" | "inactive") => Promise<{ profile: PatientProfile }>;
  getAdminPatientRecords: (token: string, patientId: string) => Promise<{ records: MedicalRecord[] }>;
  listAdminAppointments: (token: string) => Promise<{ appointments: Appointment[] }>;
  cancelAdminAppointment: (token: string, appointmentId: string, reason?: string) => Promise<{ appointment: Appointment }>;
  listAuditLogs: (token: string) => Promise<{ logs: AuditLog[] }>;
};

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const { headers, ...rest } = init;
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    ...rest,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(headers ?? {})
    }
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Request failed" }));
    const error = new Error(errorBody.error ?? "Request failed") as Error & {
      details?: Record<string, unknown>;
    };
    error.details = errorBody;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`
});

export const apiClient: ApiClient = {
  patientSignup: (email, password) =>
    request("/auth/patient/signup", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  patientLogin: (email, password) =>
    request("/auth/patient/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  patientForgotPassword: (email) =>
    request("/auth/patient/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  getPatientResetToken: (token) => request(`/auth/patient/reset-password/${encodeURIComponent(token)}`),
  resetPatientPassword: (token, password) =>
    request("/auth/patient/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password })
    }),
  requestOtp: (email) => request("/auth/request-otp", { method: "POST", body: JSON.stringify({ email }) }),
  verifyOtp: (email, otp) => request("/auth/verify-otp", { method: "POST", body: JSON.stringify({ email, otp }) }),
  getGoogleAuthorizationUrl: () => request("/auth/google/url"),
  exchangeGoogleCode: (code, state) =>
    request("/auth/google/exchange", {
      method: "POST",
      body: JSON.stringify({ code, state })
    }),
  staffLogin: (email, password) =>
    request("/auth/staff/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  getStaffInvite: (token) => request(`/auth/staff/invitations/${encodeURIComponent(token)}`),
  acceptStaffInvite: (inviteToken, password) =>
    request("/auth/staff/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ inviteToken, password })
    }),
  listStaffUsers: (token, role) =>
    request(`/auth/staff/users${role ? `?role=${encodeURIComponent(role)}` : ""}`, {
      headers: authHeaders(token)
    }),
  createStaffInvite: (token, payload) =>
    request("/auth/staff/invitations", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload)
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  updateProfile: (token, payload) =>
    request("/patients/me/profile", {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(payload)
    }),
  getProfile: (token) =>
    request("/patients/me/profile", {
      headers: authHeaders(token)
    }),
  getDoctors: () => request("/doctors"),
  getAvailability: (doctorId, start, end, token) =>
    request(`/doctors/${doctorId}/availability?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
      headers: authHeaders(token)
    }),
  holdAppointment: (payload, token) =>
    request("/appointments/hold", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload)
    }),
  confirmAppointment: (holdId, token) =>
    request("/appointments/confirm", {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "idempotency-key": crypto.randomUUID()
      },
      body: JSON.stringify({ holdId })
    }),
  listAppointments: (token) =>
    request("/appointments/me", {
      headers: authHeaders(token)
    }),
  cancelAppointment: (appointmentId, token, reason) =>
    request(`/appointments/${appointmentId}`, {
      method: "DELETE",
      headers: authHeaders(token),
      body: JSON.stringify({ reason })
    }),
  listRecords: (token) =>
    request("/patients/me/records", {
      headers: authHeaders(token)
    }),
  createRecord: (token, payload) =>
    request("/patients/me/records", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload)
    }),
  updateRecord: (token, recordId, payload) =>
    request(`/patients/me/records/${recordId}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(payload)
    }),
  getDoctorProfile: (token) =>
    request("/doctors/me/profile", {
      headers: authHeaders(token)
    }),
  updateDoctorProfile: (token, payload) =>
    request("/doctors/me/profile", {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(payload)
    }),
  getDoctorSchedule: (token) =>
    request("/doctors/me/schedule", {
      headers: authHeaders(token)
    }),
  updateDoctorSchedule: (token, schedules) =>
    request("/doctors/me/schedule", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ schedules })
    }),
  createDoctorException: (token, payload) =>
    request("/doctors/me/exceptions", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload)
    }),
  listDoctorAppointments: (token) =>
    request("/doctors/me/appointments", {
      headers: authHeaders(token)
    }),
  cancelDoctorAppointment: (token, appointmentId, reason) =>
    request(`/doctors/me/appointments/${appointmentId}/cancel`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ reason })
    }),
  getDoctorPatientProfile: (token, patientId) =>
    request(`/doctors/me/patients/${patientId}/profile`, {
      headers: authHeaders(token)
    }),
  getDoctorPatientRecords: (token, patientId) =>
    request(`/doctors/me/patients/${patientId}/records`, {
      headers: authHeaders(token)
    }),
  listAdminDoctors: (token) =>
    request("/admin/doctors", {
      headers: authHeaders(token)
    }),
  getAdminDoctor: (token, doctorId) =>
    request(`/admin/doctors/${doctorId}`, {
      headers: authHeaders(token)
    }),
  updateAdminDoctor: (token, doctorId, payload) =>
    request(`/admin/doctors/${doctorId}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(payload)
    }),
  getAdminDoctorSchedule: (token, doctorId) =>
    request(`/admin/doctors/${doctorId}/schedule`, {
      headers: authHeaders(token)
    }),
  updateAdminDoctorSchedule: (token, doctorId, schedules) =>
    request(`/admin/doctors/${doctorId}/schedule`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ schedules })
    }),
  createAdminDoctorException: (token, doctorId, payload) =>
    request(`/admin/doctors/${doctorId}/exceptions`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload)
    }),
  listAdminPatients: (token) =>
    request("/admin/patients", {
      headers: authHeaders(token)
    }),
  getAdminPatientProfile: (token, patientId) =>
    request(`/admin/patients/${patientId}/profile`, {
      headers: authHeaders(token)
    }),
  updateAdminPatientStatus: (token, patientId, status) =>
    request(`/admin/patients/${patientId}/status`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ status })
    }),
  getAdminPatientRecords: (token, patientId) =>
    request(`/admin/patients/${patientId}/records`, {
      headers: authHeaders(token)
    }),
  listAdminAppointments: (token) =>
    request("/admin/appointments", {
      headers: authHeaders(token)
    }),
  cancelAdminAppointment: (token, appointmentId, reason) =>
    request(`/admin/appointments/${appointmentId}/cancel`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ reason })
    }),
  listAuditLogs: (token) =>
    request("/admin/audit/logs", {
      headers: authHeaders(token)
    })
};
